
import asyncio
from sqlalchemy import text
from backend.database.session_db import session_db

async def upgrade_db_columns():
    print("🚀 开始通过 SQLAlchemy 升级数据库列为 LONGTEXT (带关键字保护)...")
    async with session_db.engine.begin() as conn:
        columns_to_upgrade = ['content', 'sql', 'chart_cfg', 'thinking', 'data', 'feedback_text']
        for col in columns_to_upgrade:
            print(f"正在升级 messages.{col} 为 LONGTEXT...")
            # 🚀 使用反引号包裹列名，防止 sql 等关键字冲突
            sql = text(f"ALTER TABLE messages MODIFY COLUMN `{col}` LONGTEXT")
            await conn.execute(sql)
        print("✅ 数据库列升级成功！")

if __name__ == "__main__":
    asyncio.run(upgrade_db_columns())
