"""
业务数据库初始化 (已废弃 SQLite 自动初始化)
请使用 scripts/ 下的迁移脚本来初始化 MySQL 或 PostgreSQL 业务库。
"""

async def init_business_db():
    """
    现在系统不再自动初始化业务数据库。
    请确保在 config.py 或 .env 中配置的数据库已手动初始化。
    """
    pass

if __name__ == "__main__":
    print("⚠️ 自动初始化已废弃。请配置远程 MySQL/PostgreSQL 数据库。")
