import asyncio
import sys
import os
from pathlib import Path

# 将后端路径加入 sys.path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import DATABASES
from backend.databases.database_manager import DatabaseManager

async def probe_postgres():
    db_key = "postgres_example"
    config = DATABASES.get(db_key)
    
    if not config:
        print(f"❌ 配置文件中未找到 {db_key}")
        return

    print(f"📡 正在探测 PostgreSQL: {config['host']}:{config['port']} (库: {config['database']})...")
    
    DatabaseManager.register_database(db_key, config)
    adapter = DatabaseManager.get_adapter(db_key)
    
    try:
        connected = await adapter.connect()
        if not connected:
            print("❌ 连接失败。请确保 backend/.env 中有 POSTGRES_PASSWORD=... 且密码正确。")
            return
        
        print("✅ 连接成功！")
        tables = await adapter.get_tables()
        
        if not tables:
            print("📭 数据库中暂时没有任何表。")
            return
            
        print(f"📊 发现 {len(tables)} 张表:")
        for table in tables:
            print(f"--- 表名: {table.name} ---")
            cols = [f"{c.name}" for c in table.columns]
            print(f"列: {', '.join(cols)}")
            
            try:
                rows = await adapter.execute_query(f'SELECT * FROM "{table.name}" LIMIT 2')
                if rows:
                    print(f"样本: {rows}")
                else:
                    print("(表为空)")
            except Exception as e:
                print(f"读取失败: {str(e)}")
            print("-" * 20)
                
    except Exception as e:
        print(f"💥 发生错误: {str(e)}")
    finally:
        await DatabaseManager.disconnect_all()

if __name__ == "__main__":
    asyncio.run(probe_postgres())
