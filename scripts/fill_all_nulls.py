
import asyncio
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from config import DATABASES
from databases.database_manager import DatabaseManager

async def fill_all_nulls():
    try:
        db_config = DATABASES['mysql_example']
        print(f'📊 开始填充数据库所有表的 NULL 值: {db_config["name"]}')
        
        DatabaseManager.register_database('mysql_example', db_config)
        adapter = DatabaseManager.get_adapter('mysql_example')
        await adapter.connect()
        
        print(f'✅ 已连接')
        
        # 获取所有表
        tables = await adapter.get_tables()
        print(f'\n📋 找到 {len(tables)} 个表: {[t.name for t in tables]}')
        
        for table in tables:
            table_name = table.name
            print(f'\n📄 处理表: {table_name}')
            
            # 获取表结构
            columns = await adapter.get_table_schema(table_name)
            
            # 获取所有数据
            rows = await adapter.execute_query(f'SELECT * FROM `{table_name}`')
            
            if not rows:
                print(f'  ⚠️ 表 {table_name} 没有数据，跳过')
                continue
            
            print(f'  📊 找到 {len(rows)} 条记录')
            
            # 处理每条记录
            for row in rows:
                update_fields = []
                
                for col in columns:
                    col_name = col.name
                    col_type = col.type.lower()
                    current_value = row.get(col_name)
                    
                    # 如果不是 NULL，跳过
                    if current_value is not None:
                        continue
                    
                    # 根据字段名和类型填充合理的值
                    if 'sex' in col_name.lower() or 'gender' in col_name.lower():
                        new_value = random.choice(['0', '1'])
                    elif 'name' in col_name.lower():
                        names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十']
                        new_value = random.choice(names)
                    elif 'phone' in col_name.lower() or 'telephone' in col_name.lower():
                        new_value = f'1{random.randint(300000000, 999999999)}'
                    elif 'email' in col_name.lower():
                        base_name = row.get('name', 'user') or 'user'
                        new_value = f'{base_name.replace(" ", "").lower()}{random.randint(100, 999)}@example.com'
                    elif 'idcard' in col_name.lower() or 'id_card' in col_name.lower():
                        new_value = f'{random.randint(110000, 650000)}{datetime.now().year - random.randint(18, 60):04d}{random.randint(1, 12):02d}{random.randint(1, 28):02d}{random.randint(1000, 9999)}'
                    elif 'birthday' in col_name.lower():
                        new_value = (datetime.now().date() - timedelta(days=random.randint(365 * 18, 365 * 60))).strftime('%Y-%m-%d')
                    elif 'regtime' in col_name.lower() or 'reg_time' in col_name.lower() or 'date' in col_name.lower() and 'order' in col_name.lower():
                        new_value = (datetime.now().date() - timedelta(days=random.randint(0, 365 * 3))).strftime('%Y-%m-%d')
                    elif 'filenumber' in col_name.lower() or 'file_number' in col_name.lower() or 'code' in col_name.lower():
                        new_value = f'{random.choice(["F", "C", "S", "T"])}{random.randint(100000, 999999)}'
                    elif 'remark' in col_name.lower() or 'attention' in col_name.lower():
                        remarks = ['', '正常', '待处理', '已完成', '重要', '优先处理']
                        new_value = random.choice(remarks)
                    elif 'password' in col_name.lower():
                        new_value = None  # 密码保持 NULL
                    elif 'img' in col_name.lower():
                        new_value = 'default.jpg'
                    elif 'station' in col_name.lower():
                        stations = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安']
                        new_value = random.choice(stations)
                    elif 'helpcode' in col_name.lower() or 'help_code' in col_name.lower():
                        new_value = f'{col_name.upper()[:4]}{random.randint(100, 999)}'
                    elif 'price' in col_name.lower():
                        new_value = round(random.uniform(10, 5000), 2)
                    elif 'number' in col_name.lower() or 'reservations' in col_name.lower():
                        new_value = random.randint(0, 500)
                    elif 'priority' in col_name.lower():
                        new_value = random.randint(1, 10)
                    elif 'level' in col_name.lower():
                        new_value = random.randint(1, 3)
                    elif 'age' in col_name.lower() and col_type != 'int':
                        new_value = f'{random.randint(0, 100)}-{random.randint(18, 100)}'
                    elif 'type' in col_name.lower():
                        new_value = str(random.randint(1, 3))
                    elif 'parentmenuid' in col_name.lower() or 'parent_menu_id' in col_name.lower():
                        new_value = None  # 保持 NULL
                    elif 'linkurl' in col_name.lower() or 'link_url' in col_name.lower():
                        new_value = f'{col_name.lower().replace("_", "")}.html'
                    elif 'path' in col_name.lower():
                        new_value = f'/{random.randint(1, 10)}-{random.randint(1, 10)}'
                    elif 'description' in col_name.lower():
                        descs = ['', '系统默认', '用户自定义', '标准配置']
                        new_value = random.choice(descs)
                    elif 'keyword' in col_name.lower():
                        new_value = f'KEYWORD_{random.randint(100, 999)}'
                    elif 'col_' in col_name.lower():
                        new_value = random.randint(0, 100)
                    elif 'int' in col_type or 'decimal' in col_type or 'double' in col_type or 'float' in col_type:
                        new_value = random.randint(0, 1000)
                    elif 'varchar' in col_type or 'text' in col_type or 'char' in col_type:
                        new_value = f'默认值_{random.randint(100, 999)}'
                    else:
                        new_value = None
                    
                    if new_value is not None:
                        if isinstance(new_value, str):
                            update_fields.append(f'`{col_name}` = "{new_value}"')
                        elif isinstance(new_value, (int, float)):
                            update_fields.append(f'`{col_name}` = {new_value}')
                        elif isinstance(new_value, datetime):
                            update_fields.append(f'`{col_name}` = "{new_value.strftime("%Y-%m-%d")}"')
                
                # 执行更新
                if update_fields:
                    pk_value = row.get('id') or row.get('ID')
                    if pk_value is not None:
                        update_sql = f'UPDATE `{table_name}` SET {", ".join(update_fields)} WHERE id = {pk_value}'
                        try:
                            await adapter.execute_query(update_sql)
                            print(f'  ✅ 更新记录 ID={pk_value}: {len(update_fields)} 个字段')
                        except Exception as e:
                            print(f'  ❌ 更新失败 ID={pk_value}: {e}')
        
        print(f'\n✅ 所有表的 NULL 值填充完成！')
        
        await adapter.disconnect()
        
    except Exception as e:
        import traceback
        print(f'❌ 错误: {e}')
        traceback.print_exc()

asyncio.run(fill_all_nulls())

