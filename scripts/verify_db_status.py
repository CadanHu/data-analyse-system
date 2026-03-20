
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR / 'backend'))

from config import DATABASES
from databases.database_manager import DatabaseManager

async def verify_database(db_id):
    try:
        db_config = DATABASES.get(db_id)
        if not db_config:
            print(f"❌ 找不到数据库配置: {db_id}")
            return

        print(f"
" + "="*50)
        print(f"📊 正在验证数据库: {db_config['name']} ({db_id})")
        print("="*50)
        
        DatabaseManager.register_database(db_id, db_config)
        adapter = DatabaseManager.get_adapter(db_id)
        
        try:
            await adapter.connect()
            print(f"✅ 数据库连接成功")
        except Exception as e:
            print(f"❌ 数据库连接失败: {e}")
            return

        # 获取所有表
        try:
            tables = await adapter.get_tables()
            print(f"📋 找到 {len(tables)} 个表")
        except Exception as e:
            print(f"❌ 获取表列表失败: {e}")
            await adapter.disconnect()
            return

        for table in tables:
            table_name = table.name
            print(f"
  📄 表: {table_name}")
            
            try:
                # 获取表结构
                columns = await adapter.get_table_schema(table_name)
                # 获取数据量
                count_result = await adapter.execute_query(f"SELECT COUNT(*) as cnt FROM `{table_name}`")
                record_count = count_result[0]['cnt']
                
                if record_count == 0:
                    print(f"    ⚠️ 表为空，跳过 NULL 值检查")
                    continue
                
                # 抽样检查数据
                sample_rows = await adapter.execute_query(f"SELECT * FROM `{table_name}` LIMIT 1")
                
                # 统计 NULL 值
                null_counts = {}
                for col in columns:
                    col_name = col.name
                    null_check = await adapter.execute_query(f"SELECT COUNT(*) as cnt FROM `{table_name}` WHERE `{col_name}` IS NULL")
                    null_cnt = null_check[0]['cnt']
                    if null_cnt > 0:
                        null_counts[col_name] = null_cnt

                print(f"    📈 记录数: {record_count}")
                if null_counts:
                    print(f"    📉 包含 NULL 值的字段:")
                    for col, count in null_counts.items():
                        print(f"      - {col}: {count} 个 NULL")
                else:
                    print(f"    ✨ 该表所有字段已填充 (无 NULL)")
                
                if sample_rows:
                    print(f"    📝 样例数据: {sample_rows[0]}")

            except Exception as e:
                print(f"    ❌ 处理表 {table_name} 时出错: {e}")

        await adapter.disconnect()
        print(f"
✅ 数据库 {db_id} 验证完成")
        
    except Exception as e:
        print(f"❌ 验证过程发生严重错误: {e}")

async def main():
    # 验证常用的业务数据库
    target_dbs = ['classic_business', 'global_analysis']
    for db_id in target_dbs:
        await verify_database(db_id)

if __name__ == "__main__":
    asyncio.run(main())
