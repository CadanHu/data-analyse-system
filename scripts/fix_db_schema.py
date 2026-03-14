import os
import sys

# 🚀 自动处理路径，确保能找到 backend.config
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.append(base_dir)

import pymysql
# 兼容两种导包方式
try:
    from backend.config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_SESSION_DATABASE
except ImportError:
    from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_SESSION_DATABASE

def fix_schema():
    print(f"📡 正在连接数据库 {MYSQL_SESSION_DATABASE} 以更新 Schema...")
    conn = pymysql.connect(
        host=MYSQL_HOST, 
        port=MYSQL_PORT, 
        user=MYSQL_USER, 
        password=MYSQL_PASSWORD,
        database=MYSQL_SESSION_DATABASE
    )
    
    try:
        with conn.cursor() as cursor:
            # 检查字段是否存在，不存在则添加
            fields = {
                "enable_data_science_agent": "BOOLEAN DEFAULT 0",
                "enable_thinking": "BOOLEAN DEFAULT 0",
                "enable_rag": "BOOLEAN DEFAULT 0"
            }
            
            # 特殊逻辑：如果存在旧的 enable_data_science，尝试迁移或重命名
            try:
                cursor.execute("ALTER TABLE sessions CHANGE COLUMN enable_data_science enable_data_science_agent BOOLEAN DEFAULT 0")
                print("🔄 成功将 enable_data_science 重命名为 enable_data_science_agent")
            except:
                pass
            
            for field, definition in fields.items():
                try:
                    cursor.execute(f"ALTER TABLE sessions ADD COLUMN {field} {definition}")
                    print(f"✅ 成功添加字段: {field}")
                except (pymysql.err.InternalError, pymysql.err.OperationalError) as e:
                    if e.args[0] == 1060: # Column already exists
                        print(f"ℹ️ 字段 {field} 已存在，跳过")
                    else:
                        print(f"❌ 添加字段 {field} 失败: {e}")
        
        conn.commit()
        print("🎉 数据库 Schema 同步完成！")
    finally:
        conn.close()

if __name__ == "__main__":
    fix_schema()
