"""
测试 MySQL 数据库连接
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import DATABASES
from databases.database_manager import DatabaseManager


async def test_mysql():
    print("=" * 60)
    print("MySQL 连接测试")
    print("=" * 60)

    # 检查 MySQL 配置
    if "classic_business" not in DATABASES:
        print("❌ 未找到 classic_business 数据库配置")
        return

    mysql_config = DATABASES["classic_business"]
    print(f"📋 配置信息:")
    print(f"   Host: {mysql_config.get('host')}")
    print(f"   Port: {mysql_config.get('port')}")
    print(f"   Database: {mysql_config.get('database')}")
    print(f"   User: {mysql_config.get('user')}")
    print(f"   Password: {'***' if mysql_config.get('password') else '(空)'}")
    print()

    # 注册数据库
    DatabaseManager.register_database("classic_business", mysql_config)

    # 尝试连接
    print("🔌 尝试连接 MySQL...")
    adapter = DatabaseManager.get_adapter("classic_business")

    if not adapter:
        print("❌ 无法获取 MySQL 适配器")
        return

    try:
        connected = await adapter.connect()
        if connected:
            print("✅ MySQL 连接成功！")
            print()

            # 获取表列表
            print("📊 获取表列表...")
            tables = await adapter.get_tables()
            print(f"   找到 {len(tables)} 个表:")
            for table in tables:
                print(f"   - {table.name} ({table.row_count} 行)")

            print()
            print("✅ 测试完成！")
            print()
            print("💡 提示:")
            print("   1. 在前端可以选择 'classic_business' 数据库")
            print("   2. 确保 MySQL 数据库中有表和数据")
            print("   3. 可以使用现有的 SQLite 数据库作为测试数据")
        else:
            print("❌ MySQL 连接失败")

    except Exception as e:
        print(f"❌ 连接出错: {str(e)}")
        print()
        print("💡 请检查:")
        print("   1. MySQL 服务是否正在运行")
        print("   2. .env 文件中的 MYSQL_PASSWORD 是否正确")
        print("   3. 数据库 MYSQL_DATABASE 是否存在")
        print("   4. 用户 MYSQL_USER 是否有访问权限")

    finally:
        await adapter.disconnect()


if __name__ == "__main__":
    asyncio.run(test_mysql())
