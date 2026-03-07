import os
import asyncio
from pathlib import Path
from services.mineru_service import mineru_service
from services.knowledge_extraction_service import knowledge_extraction_service
from utils.logger import logger

async def test_deep_extraction():
    # 测试文件路径 (请确保该文件存在，或者替换为一个存在的 PDF)
    test_pdf = Path("uploads/test.pdf")
    if not test_pdf.exists():
        # 创建一个简单的文本文件模拟
        test_pdf = Path("uploads/test_simple.txt")
        test_pdf.write_text("阿里巴巴集团由马云于1999年在杭州创立。它是一家全球领先的电子商务公司。")

    logger.info(f"🧪 开始测试深度提取流程: {test_pdf}")

    # 1. 测试 MinerU (如果是 PDF)
    if test_pdf.suffix.lower() == ".pdf":
        logger.info("📡 正在调用 MinerU API...")
        markdown = mineru_service.parse_pdf(test_pdf)
        logger.info(f"📝 MinerU 返回结果预览: {markdown[:200]}...")
    else:
        markdown = test_pdf.read_text()

    # 2. 测试 LangExtract
    logger.info("📡 正在调用 LangExtract 进行知识抽取...")
    knowledge = knowledge_extraction_service.extract_knowledge(markdown)
    
    logger.info("✅ 抽取结果:")
    for item in knowledge:
        print(f"- [{item.get('class')}] {item.get('text')}: {item.get('attributes')}")

if __name__ == "__main__":
    # 设置环境变量 (如果尚未设置)
    # os.environ["MINERU_API_KEY"] = "..."
    # os.environ["DEEPSEEK_API_KEY"] = "..."
    
    asyncio.run(test_deep_extraction())
