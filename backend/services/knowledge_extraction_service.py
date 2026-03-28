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
                    max_tokens=8192
                )
                
                # 累加 Token 消耗
                total_prompt_tokens += response.usage.prompt_tokens
                total_completion_tokens += response.usage.completion_tokens
                raw_content = response.choices[0].message.content
            else:
                # 其他供应商使用 LangChain
                llm = llm_factory.get_langchain_model(provider=provider, model_name=model_id, temperature=0.2)
                response = await llm.ainvoke([{"role": "user", "content": final_prompt + "\\n请务必只返回 JSON 格式结果，不要包含 Markdown 代码块标记。"}])
                raw_content = response.content
            
            # 🚀 增强版安全解析逻辑 (提取最外层 JSON)
            import json
            raw_content = raw_content.strip()
            try:
                # 尝试寻找 JSON 边界
                start_idx = raw_content.find('{')
                end_idx = raw_content.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    json_str = raw_content[start_idx:end_idx+1]
                else:
                    json_str = raw_content
                
                # 清除 Markdown 代码块标记 (如果还有)
                json_str = json_str.replace('```json', '').replace('```', '').strip()
                result = json.loads(json_str)
            except Exception as parse_err:
                logger.warning(f"⚠️ [Report] 初次解析 JSON 失败，尝试自修复: {parse_err}")
                # 最后的兜底：如果 JSON 明显截断 (以字符结尾而不是 })
                if not raw_content.endswith('}'):
                    try: 
                        result = json.loads(raw_content + '"}') 
                    except:
                        raise parse_err
                else:
                    raise parse_err
            
            # 注入 Token 数据供路由层保存
            if "_usage" not in result:
                result["_usage"] = {
                    "prompt_tokens": total_prompt_tokens,
                    "completion_tokens": total_completion_tokens
                }
            
            logger.info(f"✅ [Report] 报告生成完毕 (长度: {len(result.get('html', ''))}), Token: {total_prompt_tokens + total_completion_tokens}")
            
            # 5. 自动保存分析结果 (异步存档)
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
        
        logger.info(f"🔍 [Report] 正在分析章节: {chunk.get('metadata', {}).get('header_path', '未知')}")
        prompt = f"""你是一个资深的专业数据分析师。请对以下文档片段进行深度分析。
        你需要提取出其中的关键数据指标、所有表格内容，并总结核心发现。
        输出必须是 JSON 格式，包含: summary, tables (list of {{title, headers, rows}}), key_points.
        
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
                response = await llm.ainvoke([{"role": "user", "content": prompt + "\\n请务必只返回 JSON 格式结果。"}])
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

    async def analyze_and_generate_report(self, message_id: str, content: str, session_id: str):
        """🚀 异步后台任务：分析并生成深度报告"""
        from database.session_db import session_db, MessageModel
        from sqlalchemy import select
        from utils.json_utils import json_dumps
        import json
        
        logger.info(f"🧪 [Knowledge] 开始异步深度分析 / Starting async deep analysis: {message_id}")
        
        try:
            # 1. 执行分析逻辑
            report = await self.generate_visual_report(content, user_query="请基于提供的 SQL 结果和上下文，生成一份极具视觉冲击力的深度数据科学分析报告。")
            
            # 2. 更新数据库
            async with session_db.async_session() as session:
                result = await session.execute(select(MessageModel).where(MessageModel.id == message_id))
                msg = result.scalar_one_or_none()
                if msg:
                    # 读取旧数据
                    data_obj = {}
                    if msg.data:
                        try:
                            data_obj = json.loads(msg.data)
                        except: pass
                    
                    # 注入报告数据
                    data_obj["html_report"] = report
                    data_obj["report_status"] = "done"
                    data_obj["can_generate_report"] = False # 已生成，不再显示按钮
                    
                    msg.data = json_dumps(data_obj)
                    await session.commit()
                    logger.info(f"✅ [Knowledge] 报告更新至数据库成功 / Report updated to DB: {message_id}")
        except Exception as e:
            logger.error(f"❌ [Knowledge] 深度分析失败 / Deep analysis failed: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # 发生错误时回滚状态
            async with session_db.async_session() as session:
                result = await session.execute(select(MessageModel).where(MessageModel.id == message_id))
                msg = result.scalar_one_or_none()
                if msg:
                    data_obj = {}
                    if msg.data:
                        try: data_obj = json.loads(msg.data)
                        except: pass
                    data_obj["report_status"] = "error"
                    data_obj["report_error"] = str(e)
                    data_obj["can_generate_report"] = True # 允许点击重试
                    msg.data = json_dumps(data_obj)
                    await session.commit()

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


# ─── Web 端知识图谱抽取（后台任务专用）──────────────────────────────────────────
async def extract_knowledge_graph_for_web(text: str, user_id: int, filename: str) -> Optional[Dict[str, Any]]:
    """
    从文档文本中抽取知识图谱实体和关系。
    在后台任务中从数据库读取用户 API Key，直接调用 LLM。
    返回 {entities, relations, doc_name, extracted_at} 或 None。
    """
    import httpx
    import datetime
    from database.session_db import session_db

    # 1. 读取用户已配置的 LLM Key，按优先级（国内优先）
    PREFERRED = ['deepseek', 'qwen', 'zhipu', 'minimax', 'openai', 'claude']
    DEFAULT_ENDPOINTS = {
        'deepseek': ('https://api.deepseek.com/v1/chat/completions',  'deepseek-chat'),
        'qwen':     ('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-plus'),
        'zhipu':    ('https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flash'),
        'minimax':  ('https://api.minimax.chat/v1/text/chatcompletion_v2', 'MiniMax-Text-01'),
        'openai':   ('https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'),
        'claude':   (None, None),  # claude 格式不同，暂不支持
    }

    try:
        all_keys = await session_db.get_all_api_keys(user_id)
    except Exception as e:
        logger.warning(f"⚠️ [KG-Web] 读取用户 Key 失败: {e}")
        return None

    key_map = {k['provider']: k for k in all_keys}
    chosen_key = chosen_url = chosen_model = None

    for provider in PREFERRED:
        if provider not in key_map or provider not in DEFAULT_ENDPOINTS:
            continue
        default_url, default_model = DEFAULT_ENDPOINTS[provider]
        if default_url is None:
            continue  # 跳过格式不兼容的
        rec = key_map[provider]
        chosen_key   = rec['api_key']
        chosen_model = rec.get('model_name') or default_model
        base = (rec.get('base_url') or '').rstrip('/')
        if base:
            if base.endswith('/chat/completions'):
                chosen_url = base
            elif '/v1' in base or 'compatible-mode' in base or 'paas' in base:
                chosen_url = base + '/chat/completions'
            else:
                chosen_url = base + '/v1/chat/completions'
        else:
            chosen_url = default_url
        break

    if not chosen_key:
        logger.info('⚠️ [KG-Web] 未找到可用 LLM Key，跳过知识图谱抽取')
        return None

    # 构建备用模型列表（排除已选主模型）
    fallback_providers = []
    for provider in PREFERRED:
        if provider not in key_map or provider not in DEFAULT_ENDPOINTS:
            continue
        default_url, default_model = DEFAULT_ENDPOINTS[provider]
        if default_url is None:
            continue
        rec = key_map[provider]
        if rec['api_key'] == chosen_key:
            continue  # 跳过主模型
        fb_key = rec['api_key']
        fb_model = rec.get('model_name') or default_model
        base = (rec.get('base_url') or '').rstrip('/')
        if base:
            if base.endswith('/chat/completions'):
                fb_url = base
            elif '/v1' in base or 'compatible-mode' in base or 'paas' in base:
                fb_url = base + '/chat/completions'
            else:
                fb_url = base + '/v1/chat/completions'
        else:
            fb_url = default_url
        fallback_providers.append((provider, fb_url, fb_key, fb_model))

    logger.info(f'🚀 [KG-Web] 开始抽取知识图谱: {filename} | 模型: {chosen_model}')

    # 2. 分块处理全文
    CHUNK_SIZE = 4000   # 每块字符数
    OVERLAP    = 200    # 块间重叠，避免实体在边界处丢失
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start: start + CHUNK_SIZE])
        start += CHUNK_SIZE - OVERLAP
    logger.info(f'[KG-Web] 文本共 {len(text)} 字符，切分为 {len(chunks)} 块 (块大小={CHUNK_SIZE}, 重叠={OVERLAP})')

    def build_prompt(chunk: str) -> str:
        return (
            f'请从以下文本中抽取所有实体和它们之间的关系，用于构建知识图谱。\n\n'
            f'文本内容：\n"""\n{chunk}\n"""\n\n'
            f'请严格输出 JSON 格式（不要有任何其他文字）：\n'
            f'{{\n'
            f'  "entities": [\n'
            f'    {{"id": "e1", "text": "实体名称", "type": "Person|Organization|Concept|Event|Location|Other", "description": "简短描述"}}\n'
            f'  ],\n'
            f'  "relations": [\n'
            f'    {{"id": "r1", "source": "e1", "target": "e2", "label": "关系描述"}}\n'
            f'  ]\n'
            f'}}\n\n'
            f'要求：\n'
            f'- 尽量抽取文本中出现的所有实体，不要遗漏\n'
            f'- 尽量抽取所有确定存在的关系\n'
            f'- id 从 e1/r1 开始递增\n'
            f'- 类型只能是 Person/Organization/Concept/Event/Location/Other 之一'
        )

    # 3. 逐块调用 LLM，合并结果
    all_entities: Dict[str, Dict] = {}   # text（小写）-> entity dict，用于去重
    all_relations: Dict[str, Dict] = {}  # (src_text, tgt_text, label) -> relation dict

    async def _call_llm(client, chunk, chunk_idx, total, url=None, key=None, model=None):
        _url   = url   or chosen_url
        _key   = key   or chosen_key
        _model = model or chosen_model
        try:
            resp = await client.post(
                _url,
                headers={'Authorization': f'Bearer {_key}', 'Content-Type': 'application/json'},
                json={'model': _model, 'messages': [{'role': 'user', 'content': build_prompt(chunk)}], 'max_tokens': 4000}
            )
            resp.raise_for_status()
            return resp.json()['choices'][0]['message']['content']
        except Exception as chunk_err:
            logger.warning(f'[KG-Web] ❌ 块 {chunk_idx+1}/{total} 调用失败 ({_model}): {chunk_err}')
            return None

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            failed_chunks = []  # 收集失败的块，最后统一重试
            pending = list(enumerate(chunks))

            for chunk_idx, chunk in pending:
                logger.info(f'[KG-Web] ⏳ 正在处理块 {chunk_idx+1}/{len(chunks)} ({len(chunk)} 字符)...')
                raw = await _call_llm(client, chunk, chunk_idx, len(chunks))
                if raw is None:
                    failed_chunks.append((chunk_idx, chunk))
                    continue

                match = re.search(r'\{[\s\S]*\}', raw)
                if not match:
                    logger.warning(f'[KG-Web] ⚠️ 块 {chunk_idx+1}/{len(chunks)} 未找到 JSON，跳过')
                    continue

                try:
                    parsed = json.loads(match.group(0))
                except json.JSONDecodeError as je:
                    logger.warning(f'[KG-Web] ⚠️ 块 {chunk_idx+1}/{len(chunks)} JSON 解析失败: {je}')
                    continue

                # 收集本块实体，建立块内 id -> text 映射
                chunk_id_to_text: Dict[str, str] = {}
                chunk_new_entities = 0
                for e in parsed.get('entities', []):
                    e_text = (e.get('text') or '').strip()
                    if not e_text:
                        continue
                    chunk_id_to_text[e.get('id', '')] = e_text
                    key = e_text.lower()
                    if key not in all_entities:
                        all_entities[key] = {
                            'text': e_text,
                            'type': e.get('type', 'Other'),
                            'description': e.get('description', ''),
                        }
                        chunk_new_entities += 1

                # 收集本块关系，用块内 id 解析出文本
                chunk_new_relations = 0
                for r in parsed.get('relations', []):
                    raw_src = r.get('source') or r.get('from') or ''
                    raw_tgt = r.get('target') or r.get('to') or ''
                    src_text = chunk_id_to_text.get(raw_src, raw_src).strip()
                    tgt_text = chunk_id_to_text.get(raw_tgt, raw_tgt).strip()
                    label    = (r.get('label') or '').strip()
                    if not src_text or not tgt_text or not label:
                        continue
                    rel_key = (src_text.lower(), tgt_text.lower(), label.lower())
                    if rel_key not in all_relations:
                        all_relations[rel_key] = {
                            'source': src_text,
                            'target': tgt_text,
                            'label':  label,
                        }
                        chunk_new_relations += 1

                logger.info(
                    f'[KG-Web] ✔ 块 {chunk_idx+1}/{len(chunks)} 完成 '
                    f'(新增实体 +{chunk_new_entities}, 新增关系 +{chunk_new_relations}) '
                    f'| 累计: 实体 {len(all_entities)}, 关系 {len(all_relations)}'
                )

            # 所有块处理完后，重试失败的块（只重试一次）
            if failed_chunks:
                logger.info(f'[KG-Web] 🔁 开始重试 {len(failed_chunks)} 个失败块...')
            still_failed = []  # 重试后依然失败的块
            for chunk_idx, chunk in failed_chunks:
                logger.info(f'[KG-Web] 🔁 重试块 {chunk_idx+1}/{len(chunks)} ({len(chunk)} 字符)...')
                raw = await _call_llm(client, chunk, chunk_idx, len(chunks))
                if raw is None:
                    still_failed.append((chunk_idx, chunk))
                    continue

                match = re.search(r'\{[\s\S]*\}', raw)
                if not match:
                    logger.warning(f'[KG-Web] ⚠️ 块 {chunk_idx+1}/{len(chunks)} 重试未找到 JSON，跳过')
                    continue
                try:
                    parsed = json.loads(match.group(0))
                except json.JSONDecodeError as je:
                    logger.warning(f'[KG-Web] ⚠️ 块 {chunk_idx+1}/{len(chunks)} 重试 JSON 解析失败: {je}')
                    continue

                chunk_id_to_text: Dict[str, str] = {}
                chunk_new_entities = 0
                for e in parsed.get('entities', []):
                    e_text = (e.get('text') or '').strip()
                    if not e_text:
                        continue
                    chunk_id_to_text[e.get('id', '')] = e_text
                    key = e_text.lower()
                    if key not in all_entities:
                        all_entities[key] = {
                            'text': e_text,
                            'type': e.get('type', 'Other'),
                            'description': e.get('description', ''),
                        }
                        chunk_new_entities += 1

                chunk_new_relations = 0
                for r in parsed.get('relations', []):
                    raw_src = r.get('source') or r.get('from') or ''
                    raw_tgt = r.get('target') or r.get('to') or ''
                    src_text = chunk_id_to_text.get(raw_src, raw_src).strip()
                    tgt_text = chunk_id_to_text.get(raw_tgt, raw_tgt).strip()
                    label    = (r.get('label') or '').strip()
                    if not src_text or not tgt_text or not label:
                        continue
                    rel_key = (src_text.lower(), tgt_text.lower(), label.lower())
                    if rel_key not in all_relations:
                        all_relations[rel_key] = {
                            'source': src_text,
                            'target': tgt_text,
                            'label':  label,
                        }
                        chunk_new_relations += 1

                logger.info(
                    f'[KG-Web] ✔ 块 {chunk_idx+1}/{len(chunks)} 重试完成 '
                    f'(新增实体 +{chunk_new_entities}, 新增关系 +{chunk_new_relations})'
                )

            # 对重试仍失败的块，依次尝试备用模型
            if still_failed and fallback_providers:
                logger.info(f'[KG-Web] 🔄 {len(still_failed)} 个块尝试备用模型...')
            permanently_failed = []
            for chunk_idx, chunk in still_failed:
                succeeded = False
                for fb_provider, fb_url, fb_key, fb_model in fallback_providers:
                    logger.info(f'[KG-Web] 🔄 块 {chunk_idx+1}/{len(chunks)} 切换备用模型: {fb_model}')
                    raw = await _call_llm(client, chunk, chunk_idx, len(chunks), fb_url, fb_key, fb_model)
                    if raw is None:
                        continue

                    match = re.search(r'\{[\s\S]*\}', raw)
                    if not match:
                        continue
                    try:
                        parsed = json.loads(match.group(0))
                    except json.JSONDecodeError:
                        continue

                    chunk_id_to_text: Dict[str, str] = {}
                    chunk_new_entities = 0
                    for e in parsed.get('entities', []):
                        e_text = (e.get('text') or '').strip()
                        if not e_text:
                            continue
                        chunk_id_to_text[e.get('id', '')] = e_text
                        key = e_text.lower()
                        if key not in all_entities:
                            all_entities[key] = {
                                'text': e_text,
                                'type': e.get('type', 'Other'),
                                'description': e.get('description', ''),
                            }
                            chunk_new_entities += 1

                    chunk_new_relations = 0
                    for r in parsed.get('relations', []):
                        raw_src = r.get('source') or r.get('from') or ''
                        raw_tgt = r.get('target') or r.get('to') or ''
                        src_text = chunk_id_to_text.get(raw_src, raw_src).strip()
                        tgt_text = chunk_id_to_text.get(raw_tgt, raw_tgt).strip()
                        label    = (r.get('label') or '').strip()
                        if not src_text or not tgt_text or not label:
                            continue
                        rel_key = (src_text.lower(), tgt_text.lower(), label.lower())
                        if rel_key not in all_relations:
                            all_relations[rel_key] = {
                                'source': src_text,
                                'target': tgt_text,
                                'label':  label,
                            }
                            chunk_new_relations += 1

                    logger.info(
                        f'[KG-Web] ✔ 块 {chunk_idx+1}/{len(chunks)} 备用模型 {fb_model} 成功 '
                        f'(新增实体 +{chunk_new_entities}, 新增关系 +{chunk_new_relations})'
                    )
                    succeeded = True
                    break

                if not succeeded:
                    permanently_failed.append((chunk_idx, chunk))

            # 所有模型均失败 → 存盘待补跑
            if permanently_failed:
                from database.knowledge_db import knowledge_db
                logger.warning(f'[KG-Web] 💾 {len(permanently_failed)} 个块所有模型均失败，已存盘待补跑')
                for chunk_idx, chunk in permanently_failed:
                    await knowledge_db.save_failed_chunk(user_id, filename, chunk_idx, len(chunks), chunk)

        # 4. 重新分配全局 ID
        entities_list = []
        text_to_gid: Dict[str, str] = {}
        for idx, (key, e) in enumerate(all_entities.items(), start=1):
            gid = f'e{idx}'
            text_to_gid[e['text'].lower()] = gid
            entities_list.append({'id': gid, **e})

        relations_list = []
        for idx, (_, r) in enumerate(all_relations.items(), start=1):
            src_gid = text_to_gid.get(r['source'].lower(), r['source'])
            tgt_gid = text_to_gid.get(r['target'].lower(), r['target'])
            relations_list.append({'id': f'r{idx}', 'source': src_gid, 'target': tgt_gid, 'label': r['label']})

        graph = {
            'entities':     entities_list,
            'relations':    relations_list,
            'doc_name':     filename,
            'extracted_at': datetime.datetime.utcnow().isoformat(),
        }
        logger.info(f'✅ [KG-Web] 抽取完成: {len(graph["entities"])} 实体, {len(graph["relations"])} 关系')

        # 同步写入 PostgreSQL，供 GraphRAG 检索使用
        try:
            from database.knowledge_db import knowledge_db
            logger.info(f'[KG-Web] 📝 正在写入 PostgreSQL ({len(graph["entities"])} 实体, {len(graph["relations"])} 关系)...')
            id_to_text = {e['id']: e['text'] for e in graph['entities']}
            knowledge_items = []
            for e in graph['entities']:
                knowledge_items.append({
                    'class': e.get('type', 'Other'),
                    'text': e['text'],
                    'attributes': {'description': e.get('description', '')},
                })
            for r in graph['relations']:
                raw_src = r.get('source') or r.get('from') or ''
                raw_tgt = r.get('target') or r.get('to') or ''
                src = id_to_text.get(raw_src, raw_src)
                tgt = id_to_text.get(raw_tgt, raw_tgt)
                knowledge_items.append({
                    'class': 'relationship',
                    'text': r.get('label', ''),
                    'attributes': {'source': src, 'target': tgt, 'type': r.get('label', '')},
                })
            await knowledge_db.save_knowledge(filename, knowledge_items, user_id)
            logger.info(f'[KG-Web] ✅ PostgreSQL 写入完成')
        except Exception as pg_err:
            logger.warning(f'⚠️ [KG-Web] 写入 PostgreSQL 失败（不影响前端展示）: {pg_err}')

        # 社区检测 + 摘要（后台静默运行，不影响前端展示）
        try:
            logger.info(f'[KG-Web] 🏘️ 开始社区检测与摘要生成...')
            from services.community_service import detect_and_summarize_communities
            community_count = await detect_and_summarize_communities(
                doc_id=filename,
                user_id=user_id,
                entities=entities_list,
                relations=relations_list,
                llm_url=chosen_url,
                llm_key=chosen_key,
                llm_model=chosen_model,
            )
            if community_count:
                logger.info(f'[KG-Web] 🏘️ 社区检测完成: {community_count} 个社区已生成摘要')
        except Exception as comm_err:
            logger.warning(f'⚠️ [KG-Web] 社区检测失败（不影响前端展示）: {comm_err}')

        return graph
    except Exception as e:
        logger.warning(f'⚠️ [KG-Web] 知识图谱抽取失败: {e}')
        return None
