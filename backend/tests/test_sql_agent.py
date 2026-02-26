#!/usr/bin/env python3
"""
测试 SQL Agent 在 LangChain 1.x 中的功能
"""

import sys
import asyncio
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from config import OPENAI_API_KEY, DATABASES
from agents.langchain_sql_agent import LangChainSQLAgent

print("=" * 60)
print("SQL Agent 在 LangChain 1.x 中的功能测试")
print("=" * 60)
print()

async def test_sql_agent():
    """测试 SQL Agent"""
    
    print("1. 初始化 SQL Agent")
    print("-" * 40)
    
    db_path = DATABASES["business"]["path"]
    agent = LangChainSQLAgent(db_path=str(db_path))
    
    print(f"✓ Agent 初始化成功")
    print(f"  - 数据库: {db_path}")
    print()
    
    print("2. 测试简单查询")
    print("-" * 40)
    
    test_query = "有多少个用户？"
    print(f"查询: {test_query}")
    print()
    
    try:
        async for chunk in agent.ainvoke_stream(test_query):
            if chunk["type"] == "content":
                print(chunk["content"], end="")
        print()
        print()
        print("✓ 查询成功！")
    except Exception as e:
        print(f"✗ 查询失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if not OPENAI_API_KEY:
        print("⚠️  警告: OPENAI_API_KEY 未设置")
        print("请在 .env 文件中设置 OPENAI_API_KEY")
        sys.exit(1)
    
    asyncio.run(test_sql_agent())
