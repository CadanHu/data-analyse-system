
import asyncio
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def fill_data():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 开始填充数据库 {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        # 1. 填充 t_member 表的 birthday
        print(f'\n📄 填充 t_member 表的 birthday...')
        members = await adapter.execute_query('SELECT id, regTime FROM `t_member`')
        
        for member in members:
            member_id = member['id']
            reg_time = member['regTime']
            
            if reg_time:
                random_days = random.randint(365 * 18, 365 * 60)  # 18-60岁
                birthday = reg_time - timedelta(days=random_days)
            else:
                random_days = random.randint(365 * 18, 365 * 60)
                birthday = datetime.now().date() - timedelta(days=random_days)
            
            # 随机生成档案号
            file_number = f'F{random.randint(100000, 999999)}'
            
            # 随机生成邮箱
            names = await adapter.execute_query(f'SELECT name FROM `t_member` WHERE id = {member_id}')
            name = names[0]['name'] if names else 'user'
            if not name:
                name = 'user'
            email = f'{name.replace(" ", "").lower()}{random.randint(100, 999)}@example.com'
            
            # 更新
            update_sql = f'''
                UPDATE `t_member` 
                SET birthday = '{birthday}',
                    fileNumber = '{file_number}',
                    email = '{email}'
                WHERE id = {member_id}
            '''
            await adapter.execute_query(update_sql)
            print(f'  ✅ 更新会员 {member_id}: birthday={birthday}, fileNumber={file_number}')
        
        # 2. 填充 t_user 表的字段
        print(f'\n📄 填充 t_user 表的字段...')
        users = await adapter.execute_query('SELECT id FROM `t_user`')
        
        for user in users:
            user_id = user['id']
            
            gender = random.choice(['0', '1'])  # 0=女，1=男
            birthday = datetime.now().date() - timedelta(days=random.randint(365 * 20, 365 * 50))
            telephone = f'1{random.randint(300000000, 999999999)}'
            station = random.choice(['北京', '上海', '广州', '深圳', '杭州', '成都'])
            remark = random.choice(['活跃用户', '新用户', '待审核', ''])
            
            update_sql = f'''
                UPDATE `t_user` 
                SET gender = '{gender}',
                    birthday = '{birthday}',
                    telephone = '{telephone}',
                    station = '{station}',
                    remark = '{remark}'
                WHERE id = {user_id}
            '''
            await adapter.execute_query(update_sql)
            print(f'  ✅ 更新用户 {user_id}')
        
        print(f'\n✅ 数据填充完成！')
        
        # 验证填充结果
        print(f'\n📊 验证填充结果:')
        members_with_birthday = await adapter.execute_query('SELECT COUNT(*) as cnt FROM `t_member` WHERE birthday IS NOT NULL')
        print(f'  - t_member 有 birthday 的记录: {members_with_birthday[0]["cnt"]}')
        
        users_with_data = await adapter.execute_query('SELECT COUNT(*) as cnt FROM `t_user` WHERE gender IS NOT NULL')
        print(f'  - t_user 有 gender 的记录: {users_with_data[0]["cnt"]}')
        
        await adapter.disconnect()
        
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(fill_data())

