import asyncio
import os
import pymysql

# 数据库配置
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
DB_NAME = "classic_business"

def check():
    print(f"🔍 [Debug] 正在连接 MySQL ({MYSQL_HOST}:{MYSQL_PORT}) 检查 {DB_NAME} 表结构...")
    try:
        conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]
                print(f"✅ [成功] 当前数据库中的表: {tables}")
                
                for table in tables:
                    print(f"\n--- 表 {table} 的结构 ---")
                    cursor.execute(f"DESCRIBE `{table}`")
                    for col in cursor.fetchall():
                        print(f"  {col[0]}: {col[1]}")
        finally:
            conn.close()
    except Exception as e:
        print(f"❌ [失败] 无法读取表结构: {e}")

if __name__ == "__main__":
    check()
