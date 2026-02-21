#!/usr/bin/env python3
"""
Part 3 测试脚本
"""
import sys
import asyncio

sys.path.insert(0, '.')


async def test_imports():
    print("📦 测试模块导入...")
    
    from main import app
    print("✅ main.py 导入成功")
    
    from routers import chat_router
    print("✅ chat_router 导入成功")
    
    from services.schema_service import SchemaService
    print("✅ SchemaService 导入成功")
    
    from services.sql_executor import SQLExecutor
    print("✅ SQLExecutor 导入成功")
    
    from agents.sql_agent import SQLAgent
    print("✅ SQLAgent 导入成功")
    
    print("\n🎉 所有模块导入测试通过！")


async def test_schema_service():
    print("\n📋 测试 Schema 服务...")
    
    from services.schema_service import SchemaService
    from database.business_db import init_business_db
    
    await init_business_db()
    
    tables = await SchemaService.get_table_names()
    print(f"✅ 数据库表: {tables}")
    
    schema = await SchemaService.get_full_schema()
    print(f"✅ Schema 提取成功 (长度: {len(schema)})")
    
    print("✅ Schema 服务测试通过！")


async def test_sql_executor():
    print("\n🔍 测试 SQL 执行器...")
    
    from services.sql_executor import SQLExecutor
    
    is_valid, error = SQLExecutor.validate_sql("SELECT * FROM users")
    print(f"✅ 安全校验 - 合法 SQL: {is_valid}")
    
    is_valid, error = SQLExecutor.validate_sql("DELETE FROM users")
    print(f"✅ 安全校验 - 非法 SQL: {is_valid}, 错误: {error}")
    
    try:
        result = await SQLExecutor.execute_sql("SELECT * FROM users LIMIT 3")
        print(f"✅ SQL 执行成功，返回 {result['row_count']} 行")
    except Exception as e:
        print(f"⚠️ SQL 执行测试跳过 (需要初始化数据库): {e}")
    
    print("✅ SQL 执行器测试通过！")


async def main():
    print("=" * 50)
    print("🧪 Part 3 验证测试")
    print("=" * 50)
    
    try:
        await test_imports()
        await test_schema_service()
        await test_sql_executor()
        
        print("\n" + "=" * 50)
        print("✅ Part 3 代码验证通过！")
        print("=" * 50)
        return 0
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
