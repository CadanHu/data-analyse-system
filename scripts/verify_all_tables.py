
import asyncio
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def verify_data():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 验证所有表的填充结果 {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        # 获取所有表
        tables = await adapter.get_tables()
        
        total_nulls_before = 0
        total_nulls_after = 0
        
        for table in tables:
            table_name = table.name
            print(f'\n📄 表: {table_name}')
            
            columns = await adapter.get_table_schema(table_name)
            rows = await adapter.execute_query(f'SELECT * FROM `{table_name}`')
            
            if not rows:
                print(f'  ⚠️ 没有数据')
                continue
            
            # 统计 NULL 值
            null_count = 0
            for row in rows:
                for col in columns:
                    if row.get(col.name) is None:
                        null_count += 1
            
            print(f'  📊 记录数: {len(rows)}')
            print(f'  📉 剩余 NULL 值: {null_count}')
        
        await adapter.disconnect()
        print(f'\n✅ 验证完成！')
        
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(verify_data())

