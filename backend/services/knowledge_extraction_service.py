import os
import sys
import json
import asyncio
import textwrap
from typing import List, Dict, Any, Optional
from pathlib import Path
from utils.logger import logger
from database.knowledge_db import knowledge_db

# 动态定位 external/langextract 并加入 sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
LANGEXTRACT_ROOT = BASE_DIR / "external" / "langextract"

if LANGEXTRACT_ROOT.exists():
    if str(LANGEXTRACT_ROOT) not in sys.path:
        sys.path.insert(0, str(LANGEXTRACT_ROOT))
        print(f"📡 [Extraction] 已将 langextract 路径优先加入 sys.path: {LANGEXTRACT_ROOT}")
else:
    print(f"⚠️ [Extraction] 未找到 langextract 目录: {LANGEXTRACT_ROOT}")

try:
    import langextract as lx
    from langextract.core import data as lx_data
    print("✅ [Extraction] langextract 模块加载成功")
except Exception as e:
    logger.error(f"❌ [Extraction] 无法加载 langextract: {str(e)}")
    lx = None
    lx_data = None

class KnowledgeExtractionService:
    """知识提取服务：利用 LangExtract 将 Markdown 转换为结构化 JSON"""

    def __init__(self):
        # 优先使用环境变量，否则使用 config.py 中的 API_KEY (DeepSeek)
        self.api_key = os.getenv("LANGEXTRACT_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
        self.model_id = os.getenv("LANGEXTRACT_MODEL", "deepseek-chat")
        self.base_url = os.getenv("LANGEXTRACT_BASE_URL", "https://api.deepseek.com")
        
        if not self.api_key:
            logger.warning("⚠️ 未配置 LANGEXTRACT_API_KEY 或 DEEPSEEK_API_KEY，提取功能可能失败。")

    def _get_default_prompt(self) -> str:
        return textwrap.dedent("""\
            你是一个专业的知识图谱构建专家。请从提供的文本中提取关键实体、属性及其相互关系。
            提取规则：
            1. 实体：提取人名、组织、地点、日期、金额、关键技术或概念。
            2. 属性：为每个实体添加必要的描述性属性（如：职位的具体名称、金额的币种等）。
            3. 关系：提取实体间的逻辑连接（如：属于、位于、工作于、创建于、金额归属于等）。
            4. 必须保持原文真实性，不要编造信息。
            输出格式：严格按照提供的 Schema 进行 JSON 输出。""")

    def _get_default_examples(self) -> List[Any]:
        # 提供一个通用的例子
        return [
            lx_data.ExampleData(
                text="阿里巴巴集团由马云于1999年在杭州创立。",
                extractions=[
                    lx_data.Extraction(
                        extraction_class="entity",
                        extraction_text="阿里巴巴集团",
                        attributes={"type": "公司", "description": "互联网巨头"}
                    ),
                    lx_data.Extraction(
                        extraction_class="entity",
                        extraction_text="马云",
                        attributes={"type": "人物", "description": "创始人"}
                    ),
                    lx_data.Extraction(
                        extraction_class="entity",
                        extraction_text="1999年",
                        attributes={"type": "日期"}
                    ),
                    lx_data.Extraction(
                        extraction_class="relationship",
                        extraction_text="马云创立阿里巴巴集团",
                        attributes={"source": "马云", "target": "阿里巴巴集团", "type": "创始人"}
                    ),
                ]
            )
        ]

    async def extract_and_save(self, text: str, doc_id: str, prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """执行提取并自动保存到 PostgreSQL"""
        knowledge = self.extract_knowledge(text, prompt)
        if knowledge and not knowledge[0].get("error"):
            try:
                await knowledge_db.save_knowledge(doc_id, knowledge)
            except Exception as e:
                logger.error(f"❌ [Extraction] 持久化失败: {str(e)}")
        return knowledge

    async def extract_knowledge(self, text: str, prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """执行提取 (异步化处理，防止阻塞主线程)"""
        if not lx:
            return [{"error": "LangExtract 未安装"}]
        
        if not text or len(text.strip()) < 10:
            return []

        # 核心逻辑：如果文本超过 2000 字，进行更细粒度的分段抽取
        CHUNK_SIZE = 2000
        CHUNK_OVERLAP = 200
        
        loop = asyncio.get_event_loop()
        
        if len(text) <= CHUNK_SIZE:
            chunks = [text]
        else:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
                separators=["\n\n", "\n", "。", "；", ". ", "; ", " "]
            )
            chunks = await loop.run_in_executor(None, splitter.split_text, text)
            logger.info(f"✂️ [Extraction] 文档较长 ({len(text)} 字)，已切分为 {len(chunks)} 个片段。解锁并行处理...")

        all_knowledge = []
        
        # 定义内部同步处理函数
        def _sync_process_chunk(chunk_text, index, chunks_count):
            try:
                logger.info(f"📡 [Extraction] 片段 {index+1}/{chunks_count} 启动处理...")
                from langextract.providers.openai import OpenAILanguageModel
                custom_model = OpenAILanguageModel(
                    model_id=self.model_id, api_key=self.api_key, base_url=self.base_url
                )

                result = lx.extract(
                    text_or_documents=chunk_text,
                    prompt_description=prompt or self._get_default_prompt(),
                    examples=self._get_default_examples(),
                    model=custom_model,
                    use_schema_constraints=False, fence_output=True,
                    max_workers=5, extraction_passes=1
                )

                return [{
                    "class": item.extraction_class,
                    "text": item.extraction_text,
                    "attributes": item.attributes
                } for item in result.extractions]
            except Exception as e:
                logger.error(f"❌ [Extraction] 片段 {index+1} 失败: {str(e)}")
                return []

        # 使用线程池并发执行，但外层用 gather 保持异步
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            tasks = [
                loop.run_in_executor(executor, _sync_process_chunk, chunk, i, len(chunks))
                for i, chunk in enumerate(chunks)
            ]
            results = await asyncio.gather(*tasks)
            for data in results:
                all_knowledge.extend(data)

        logger.info(f"🚀 [Extraction] 并行处理圆满完成！共获得 {len(all_knowledge)} 条知识点")
        return all_knowledge

# 全局实例
knowledge_extraction_service = KnowledgeExtractionService()
