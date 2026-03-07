import os
import asyncio
from database.knowledge_db import knowledge_db
from utils.logger import logger

async def test_pg_storage():
    logger.info("🧪 开始测试 PostgreSQL 持久化功能...")
    
    # 1. 初始化表
    await knowledge_db.init_db()
    
    # 2. 构造模拟知识数据
    mock_knowledge = [
        {
            "class": "entity",
            "text": "OpenAI",
            "attributes": {"type": "公司", "industry": "AI", "location": "San Francisco"}
        },
        {
            "class": "relationship",
            "text": "Sam Altman 领导 OpenAI",
            "attributes": {"source": "Sam Altman", "target": "OpenAI", "type": "CEO"}
        }
    ]
    
    # 3. 尝试保存
    try:
        await knowledge_db.save_knowledge(doc_id="test_report_001.pdf", knowledge=mock_knowledge)
        logger.info("✅ 模拟数据保存成功！请去 DBeaver 或 psql 中查看表：knowledge_entities")
    except Exception as e:
        logger.error(f"❌ 保存失败: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_pg_storage())
