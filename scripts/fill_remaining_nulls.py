
import asyncio
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def fill_remaining_nulls():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 处理剩余的 NULL 值: {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        # 处理 t_member 表
        print(f'\n📄 处理 t_member 表...')
        members = await adapter.execute_query('SELECT * FROM `t_member`')
        for member in members:
            update_fields = []
            member_id = member['id']
            
            # 处理 password
            if member.get('password') is None:
                update_fields.append("`password` = '123456'")
            
            # 处理 remark
            if member.get('remark') is None:
                remarks = ['', '正常用户', '活跃用户', '新注册']
                remark = random.choice(remarks)
                update_fields.append(f"`remark` = '{remark}'")
            
            # 处理 sex
            if member.get('sex') is None:
                sex = random.choice(['0', '1'])
                update_fields.append(f"`sex` = '{sex}'")
            
            # 处理 idCard
            if member.get('idCard') is None:
                id_card = f'{random.randint(110000, 650000)}{datetime.now().year - random.randint(18, 60):04d}{random.randint(1, 12):02d}{random.randint(1, 28):02d}{random.randint(1000, 9999)}'
                update_fields.append(f"`idCard` = '{id_card}'")
            
            if update_fields:
                update_sql = f'UPDATE `t_member` SET {", ".join(update_fields)} WHERE id = {member_id}'
                await adapter.execute_query(update_sql)
                print(f'  ✅ 更新会员 {member_id}: {len(update_fields)} 个字段')
        
        # 处理 t_menu 表
        print(f'\n📄 处理 t_menu 表...')
        menus = await adapter.execute_query('SELECT * FROM `t_menu`')
        for menu in menus:
            update_fields = []
            menu_id = menu['id']
            
            if menu.get('linkUrl') is None:
                link_url = f'menu{menu_id}.html'
                update_fields.append(f"`linkUrl` = '{link_url}'")
            
            if menu.get('description') is None:
                descs = ['', '系统菜单', '功能菜单']
                desc = random.choice(descs)
                update_fields.append(f"`description` = '{desc}'")
            
            if menu.get('parentMenuId') is None:
                update_fields.append("`parentMenuId` = NULL")
            
            if update_fields:
                update_sql = f'UPDATE `t_menu` SET {", ".join(update_fields)} WHERE id = {menu_id}'
                await adapter.execute_query(update_sql)
                print(f'  ✅ 更新菜单 {menu_id}: {len(update_fields)} 个字段')
        
        print(f'\n✅ 剩余 NULL 值填充完成！')
        
        await adapter.disconnect()
        
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(fill_remaining_nulls())

