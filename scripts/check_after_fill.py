
import asyncio
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def check_data():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 验证填充后的数据 {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        # 检查 t_member
        print(f'\n📄 t_member 表:')
        members = await adapter.execute_query('SELECT * FROM `t_member` LIMIT 3')
        for member in members:
            print(f'  {member}')
        
        # 检查 t_user
        print(f'\n📄 t_user 表:')
        users = await adapter.execute_query('SELECT * FROM `t_user` LIMIT 3')
        for user in users:
            print(f'  {user}')
        
        await adapter.disconnect()
        print('\n✅ 验证完成')
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(check_data())

