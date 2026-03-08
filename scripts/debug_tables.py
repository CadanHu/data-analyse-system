import asyncio
import os
import sys
from pathlib import Path

# 添加 backend 到路径
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from databases.database_manager import db_manager
from sqlalchemy import text

async def check():
    print("🔍 [Debug] 正在连接数据库检查表结构...")
    try:
        # 获取 classic_business 的引擎
        engine = db_manager.get_engine("classic_business")
        async with engine.connect() as conn:
            result = await conn.execute(text("SHOW TABLES"))
            tables = [row[0] for row in result]
            print(f"✅ [成功] 当前数据库中的表: {tables}")
            
            for table in tables:
                print(f"\n--- 表 {table} 的结构 ---")
                columns = await conn.execute(text(f"DESCRIBE `{table}`"))
                for col in columns:
                    print(f"  {col[0]}: {col[1]}")
    except Exception as e:
        print(f"❌ [失败] 无法读取表结构: {e}")

if __name__ == "__main__":
    asyncio.run(check())
