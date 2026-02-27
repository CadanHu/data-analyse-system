
import asyncio
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def check_data():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 检查 MySQL 数据库 {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        tables = await adapter.get_tables()
        print(f'📋 找到 {len(tables)} 个表: {[t.name for t in tables]}')
        
        for table in tables:
            print(f'\n📄 表 {table.name}:')
            rows = await adapter.execute_query(f'SELECT COUNT(*) as cnt FROM `{table.name}`')
            count = rows[0]['cnt'] if rows else 0
            print(f'  📊 行数: {count}')
            
            if count > 0:
                sample = await adapter.execute_query(f'SELECT * FROM `{table.name}` LIMIT 3')
                print(f'  样本数据: {sample}')
        
        await adapter.disconnect()
        print('\n✅ 检查完成')
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(check_data())

