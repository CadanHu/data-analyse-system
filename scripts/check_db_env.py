"""
数据库环境验证工具 - 检查 SQLAlchemy 连接及多库状态
"""
import asyncio
import sys
from pathlib import Path

# 添加 backend 目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

try:
    from config import DATABASES, MYSQL_SESSION_DATABASE, MYSQL_HOST, MYSQL_PORT
    from databases.database_manager import DatabaseManager
    from database.session_db import session_db
    print("✅ 配置加载成功")
except ImportError as e:
    print(f"❌ 配置加载失败: {e}")
    sys.exit(1)

async def check_env():
    print("
🔍 正在检查数据库环境...
")
    
    # 1. 检查会话数据库 (MySQL)
    print(f"📡 正在测试会话数据库连接: {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_SESSION_DATABASE}")
    try:
        await session_db.init_db()
        print("✅ 会话数据库连接成功，且表结构已初始化/校验通过。")
    except Exception as e:
        print(f"❌ 会话数据库连接失败: {str(e)}")
        print("   请检查 .env 中的 MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD 是否正确。")

    # 2. 检查多数据库配置
    print(f"
📚 正在检查业务数据库配置 ({len(DATABASES)} 个):")
    for key, config in DATABASES.items():
        db_type = config.get("type")
        db_name = config.get("name")
        print(f"--- 数据库: {db_name} [{key}] ({db_type}) ---")
        
        try:
            DatabaseManager.register_database(key, config)
            success = await DatabaseManager.connect(key)
            if success:
                adapter = DatabaseManager.get_adapter(key)
                version = await adapter.get_database_version()
                tables = await adapter.get_tables()
                print(f"✅ 连接成功! 版本: {version}, 表数量: {len(tables)}")
            else:
                print(f"❌ 连接失败。")
        except Exception as e:
            print(f"❌ 出错: {str(e)}")

    print("
✨ 环境检查完成。")

if __name__ == "__main__":
    asyncio.run(check_env())
