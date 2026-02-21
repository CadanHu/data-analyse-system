"""
数据库初始化脚本
"""
import asyncio
from database.session_db import session_db
from database.business_db import init_business_db


async def main():
    """初始化所有数据库"""
    print("🚀 开始初始化数据库...")
    
    # 初始化会话数据库
    print("\n📊 初始化会话数据库...")
    await session_db.init_db()
    print("✅ 会话数据库初始化完成")
    
    # 初始化业务数据库
    print("\n📈 初始化业务数据库...")
    await init_business_db()
    print("✅ 业务数据库初始化完成")
    
    print("\n✨ 所有数据库初始化完成！")


if __name__ == "__main__":
    asyncio.run(main())
