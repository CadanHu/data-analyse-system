import pymysql
import os
from dotenv import load_dotenv
from pathlib import Path

# 加载配置
env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(env_path)

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
MYSQL_SESSION_DATABASE = os.getenv("MYSQL_SESSION_DATABASE", "data_pulse_sessions")

def fix_schema():
    print(f"📡 [Fix] 正在连接数据库 {MYSQL_SESSION_DATABASE} 以修复表结构...")
    try:
        conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_SESSION_DATABASE,
            charset='utf8mb4',
            autocommit=True
        )
        with conn.cursor() as cursor:
            # 基础反馈列
            cols = {
                'feedback': 'INT DEFAULT 0',
                'feedback_text': 'TEXT',
                'tokens_prompt': 'INT DEFAULT 0',
                'tokens_completion': 'INT DEFAULT 0'
            }
            
            for col_name, col_type in cols.items():
                cursor.execute(f"SHOW COLUMNS FROM messages LIKE '{col_name}'")
                if not cursor.fetchone():
                    print(f"➕ 正在添加 {col_name} 列...")
                    cursor.execute(f"ALTER TABLE messages ADD COLUMN {col_name} {col_type}")
                else:
                    print(f"✅ {col_name} 列已存在")

        print("✨ [成功] 数据库表结构修复完成！")
        conn.close()
    except Exception as e:
        print(f"❌ [失败] 修复过程中出现错误: {e}")

if __name__ == "__main__":
    fix_schema()
