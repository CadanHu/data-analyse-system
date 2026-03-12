import os
import re
import sys
import json
import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from utils.logger import logger
from utils.prompt_templates import VISUALIZATION_REPORT_PROMPT
from config import API_KEY, API_BASE_URL, CHAT_MODEL, ModelProvider, DEFAULT_PROVIDER
from services.llm_factory import llm_factory

# 动态定位 external/langextract 并加入 sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
LANGEXTRACT_ROOT = BASE_DIR / "external" / "langextract"

if LANGEXTRACT_ROOT.exists() and str(LANGEXTRACT_ROOT) not in sys.path:
    sys.path.insert(0, str(LANGEXTRACT_ROOT))

try:
    import langextract as lx
    from langextract.core import data as lx_data
except Exception:
    lx = None
    lx_data = None

# ==================== 1. 标题感知切分器 ====================
class TitleBasedMarkdownSplitter:
    """基于标题层级的 Markdown 智能切分器"""
    def __init__(self, chunk_size: int = 2000):
        self.chunk_size = chunk_size
        self.head_pattern = re.compile(r"^#+\s")
    
    def _get_header_level(self, line: str) -> int:
        match = re.match(r"^(#+)\s+", line)
        return len(match.group(1)) if match else 0

    def split_text(self, markdown: str) -> List[Dict[str, Any]]:
        lines = markdown.splitlines(keepends=True)
        points = [{"line": 0, "metadata": {"header_path": "开始"}}]
        title_stack = []
        
        for i, line in enumerate(lines):
            level = self._get_header_level(line)
            if level > 0:
                title = line.strip("#").strip()
                while title_stack and title_stack[-1][0] >= level:
                    title_stack.pop()
                title_stack.append((level, title))
                points.append({
                    "line": i,
                    "metadata": {"header_path": " > ".join([t for _, t in title_stack])}
                })
        
        points.append({"line": len(lines), "metadata": {}})
        
        chunks = []
        for i in range(len(points) - 1):
            start, end = points[i]["line"], points[i+1]["line"]
            content = "".join(lines[start:end]).strip()
            if content:
                chunks.append({
                    "content": content,
                    "metadata": points[i]["metadata"]
                })
        
        merged = []
        temp_content = ""
        temp_metadata = {}
        for c in chunks:
            if len(temp_content) + len(c["content"]) < self.chunk_size:
                temp_content += "\n" + c["content"]
                temp_metadata.update(c["metadata"])
            else:
                if temp_content:
                    merged.append({"content": temp_content, "metadata": temp_metadata})
                temp_content = c["content"]
                temp_metadata = c["metadata"]
        if temp_content:
            merged.append({"content": temp_content, "metadata": temp_metadata})
        return merged

# ==================== 2. 知识蒸馏与表格推断器 ====================
class KnowledgeDistiller:
    """从原始 Markdown 中精准提取表格和核心指标"""
    @staticmethod
    def extract_tables(text: str) -> List[Dict[str, Any]]:
        import re
        tables = []
        table_pattern = re.compile(r'\|(.+)\|\n\|([\s\-\|]+)\|\n((?:\|.+\|\n?)+)')
        for match in table_pattern.finditer(text):
            headers = [h.strip() for h in match.group(1).split('|') if h.strip()]
            rows = [[c.strip() for c in r.split('|') if c.strip()] for r in match.group(3).strip().split('\n')]
            if headers and rows:
                tables.append({"headers": headers, "rows": [r for r in rows if len(r) == len(headers)]})
        return tables

    @staticmethod
    def build_visualization_context(chunks_analysis: List[Dict[str, Any]]) -> str:
        """根据切分块的分析结果构建紧凑上下文"""
        context_parts = ["# 核心数据洞察与逻辑校验\n"]
        for i, chunk in enumerate(chunks_analysis):
            path = chunk.get("metadata", {}).get("header_path", "未知章节")
            analysis = chunk.get("analysis", {})
            
            # 聚合摘要与要点
            context_parts.append(f"## 章节路径: {path}")
            context_parts.append(f"内容摘要: {analysis.get('summary', '')}")
            
            # 聚合表格 (包括推断出的表格)
            tables = analysis.get("tables", [])
            for table in tables:
                context_parts.append(f"### 数据表: {table.get('title', '统计数据')}")
                headers = table.get("headers", [])
                if not headers: continue
                context_parts.append("| " + " | ".join(headers) + " |")
                context_parts.append("| " + " | ".join(["---"] * len(headers)) + " |")
                for row in table.get("rows", []):
                    context_parts.append("| " + " | ".join([str(cell) for cell in row]) + " |")
                if table.get("note"):
                    context_parts.append(f"*注: {table['note']}*")
            context_parts.append("\n")
            
            # 聚合核心要点
            points = analysis.get("key_points", [])
            if points:
                context_parts.append("关键发现:")
                for p in points: context_parts.append(f"- {p}")
            context_parts.append("-" * 20)
            
        return "\n".join(context_parts)

# ==================== 3. 主服务类 ====================
class KnowledgeExtractionService:
    def __init__(self):
        # 默认使用 DeepSeek 进行知识抽取
        self.provider = ModelProvider.DEEPSEEK
        self.model_id = CHAT_MODEL
        self.splitter = TitleBasedMarkdownSplitter(chunk_size=2500)
        self.executor = ThreadPoolExecutor(max_workers=10)

    async def generate_visual_report(self, markdown_text: str, user_query: str = "分析该文档的核心业务指标和逻辑一致性", provider: str = None, model_name: str = None) -> Dict[str, Any]:
        """🚀 高并发可视化报告生成流程 (集成逻辑校验与表格推断)"""
        provider = provider or self.provider
        model_id = model_name or self.model_id
        
        logger.info(f"🚀 [Report] 开始生成深度报告 | 供应商: {provider} | 模型: {model_id}")
        total_prompt_tokens = 0
        total_completion_tokens = 0
        
        # 1. 智能切分 (基于标题路径)
        chunks = self.splitter.split_text(markdown_text)
        logger.info(f"📊 任务拆解: {len(chunks)} 个章节正在并行审计中...")

        # 2. 并行分析 (注入审计级 Prompt)
        tasks = [self._analyze_single_chunk(c, provider, model_id) for c in chunks]
        results_with_usage = await asyncio.gather(*tasks)
        
        chunks_results = []
        for r in results_with_usage:
            chunks_results.append({"metadata": r["metadata"], "analysis": r["analysis"]})
            total_prompt_tokens += r.get("usage", {}).get("prompt_tokens", 0)
            total_completion_tokens += r.get("usage", {}).get("completion_tokens", 0)

        # 3. 蒸馏上下文
        distilled_context = KnowledgeDistiller.build_visualization_context(chunks_results)
        
        # 4. 调用炫酷报告生成器
        final_prompt = VISUALIZATION_REPORT_PROMPT.format(
            user_query=user_query + " (请特别注意各章节间的数据逻辑是否吻合)", 
            knowledge_base=distilled_context
        )
        
        try:
            # 只有 OpenAI 和 DeepSeek 支持 AsyncOpenAI 客户端的 response_format
            if provider in [ModelProvider.OPENAI, ModelProvider.DEEPSEEK]:
                client = llm_factory.get_openai_client(provider)
                response = await client.chat.completions.create(
                    model=model_id,
                    messages=[{"role": "user", "content": final_prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=4000
                )
                
                # 累加 Token 消耗
                total_prompt_tokens += response.usage.prompt_tokens
                total_completion_tokens += response.usage.completion_tokens
                raw_content = response.choices[0].message.content
            else:
                # 其他供应商使用 LangChain
                llm = llm_factory.get_langchain_model(provider=provider, model_name=model_id, temperature=0.2)
                response = await llm.ainvoke([{"role": "user", "content": final_prompt + "\n请务必只返回 JSON 格式结果，不要包含 Markdown 代码块标记。"}])
                raw_content = response.content
            
            # 增加安全解析逻辑
            raw_content = raw_content.strip()
            if raw_content.startswith("```json"):
                raw_content = raw_content.split("```json")[1].split("```")[0].strip()
            elif raw_content.startswith("```"):
                raw_content = raw_content.split("```")[1].split("```")[0].strip()

            if not raw_content.strip().endswith('}'):
                raw_content += '"}'
                
            result = json.loads(raw_content)
            
            # 注入 Token 数据供路由层保存
            result["_usage"] = {
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens
            }
            
            # 5. 自动保存分析结果
            self._save_report_locally(result)
            
            logger.info(f"✅ [Report] 报告产出成功 | 累计消耗: {total_prompt_tokens + total_completion_tokens} Tokens")
            return result
        except Exception as e:
            logger.error(f"❌ [Report] 生成失败: {str(e)}")
            return {"error": True, "title": "生成失败", "summary": str(e), "html": f"<p>生成出错: {str(e)}</p>"}

    async def _analyze_single_chunk(self, chunk: Dict[str, Any], provider: str = None, model_id: str = None) -> Dict[str, Any]:
        """专业财务审计级 analysis (返回消耗)"""
        provider = provider or self.provider
        model_id = model_id or self.model_id
        
        prompt = f"""你是一个资深的专业财务分析师。请对以下文档片段进行深度分析并输出 JSON：
        内容: {chunk['content']}
        """
        try:
            if provider in [ModelProvider.OPENAI, ModelProvider.DEEPSEEK]:
                client = llm_factory.get_openai_client(provider)
                response = await client.chat.completions.create(
                    model=model_id,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )
                return {
                    "metadata": chunk['metadata'],
                    "analysis": json.loads(response.choices[0].message.content),
                    "usage": {
                        "prompt_tokens": response.usage.prompt_tokens,
                        "completion_tokens": response.usage.completion_tokens
                    }
                }
            else:
                llm = llm_factory.get_langchain_model(provider=provider, model_name=model_id, temperature=0.1)
                response = await llm.ainvoke([{"role": "user", "content": prompt + "\n请务必只返回 JSON 格式结果。"}])
                content = response.content.strip()
                if content.startswith("```json"):
                    content = content.split("```json")[1].split("```")[0].strip()
                return {
                    "metadata": chunk['metadata'],
                    "analysis": json.loads(content),
                    "usage": {"prompt_tokens": 0, "completion_tokens": 0}
                }
        except:
            return {"metadata": chunk['metadata'], "analysis": {"summary": "分析失败", "tables": [], "key_points": []}, "usage": {}}

    def _save_report_locally(self, report: Dict[str, Any]):
        """将生成的报告保存到 outputs 目录"""
        try:
            output_dir = Path("outputs")
            output_dir.mkdir(exist_ok=True)
            filename = f"report_{report.get('title', 'latest').replace(' ', '_')}.html"
            with open(output_dir / filename, "w", encoding="utf-8") as f:
                f.write(report.get("html", ""))
            logger.info(f"💾 [Report] HTML 报告已存档: {filename}")
        except:
            pass

    async def extract_and_save(self, text: str, doc_id: str, prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """保留原接口兼容性，并执行实际的切分分析"""
        logger.info(f"📑 [Knowledge] 正在为文档 {doc_id} 执行知识抽取并同步至数据库")
        try:
            chunks = self.splitter.split_text(text)
            return chunks
        except Exception as e:
            logger.error(f"❌ [Knowledge] 抽取失败: {e}")
            return []

    async def extract_knowledge(self, text: str, prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """为 upload_router 提供显式调用接口"""
        return await self.extract_and_save(text, "uploaded_file", prompt)

knowledge_extraction_service = KnowledgeExtractionService()
