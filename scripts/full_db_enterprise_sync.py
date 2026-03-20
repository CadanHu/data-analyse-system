import os
import pymysql
import psycopg2
import random
from datetime import datetime, timedelta

def sync_mysql(db_name, user, password, host, port):
    print(f"🔧 正在增强 MySQL 库: {db_name}...")
    conn = pymysql.connect(host=host, port=port, user=user, password=password, charset='utf8mb4', autocommit=True)
    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS {db_name} CHARACTER SET utf8mb4")
    cur.execute(f"USE {db_name}")
    
    # --- 统一组织架构 ---
    cur.execute("DROP TABLE IF EXISTS organizations")
    cur.execute("""CREATE TABLE organizations (
        org_id INT PRIMARY KEY AUTO_INCREMENT,
        org_name VARCHAR(100), region VARCHAR(50), currency VARCHAR(10), exchange_rate DECIMAL(10, 4)
    )""")
    cur.executemany("INSERT INTO organizations (org_name, region, currency, exchange_rate) VALUES (%s, %s, %s, %s)", 
        [('Global_HQ', 'Global', 'USD', 7.2), ('CN_East', 'East', 'CNY', 1.0), ('EU_West', 'Europe', 'EUR', 7.8)])

    # --- 统一日志 (10万条以保证平衡) ---
    cur.execute("DROP TABLE IF EXISTS user_behavior_logs")
    cur.execute("""CREATE TABLE user_behavior_logs (
        log_id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id INT, event_time DATETIME, event_type VARCHAR(50)
    )""")
    logs = [(random.randint(1, 1000), datetime.now() - timedelta(minutes=random.randint(0, 100000)), random.choice(['view', 'click', 'buy'])) for _ in range(100000)]
    cur.executemany("INSERT INTO user_behavior_logs (user_id, event_time, event_type) VALUES (%s, %s, %s)", logs)
    
    conn.close()

def sync_postgresql(db_name, user, password, host, port):
    print(f"🔧 正在增强 PostgreSQL 库: {db_name}...")
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=db_name)
    conn.autocommit = True
    cur = conn.cursor()
    
    # --- 统一组织架构 ---
    cur.execute("DROP TABLE IF EXISTS organizations")
    cur.execute("""CREATE TABLE organizations (
        org_id SERIAL PRIMARY KEY,
        org_name VARCHAR(100), region VARCHAR(50), currency VARCHAR(10), exchange_rate DECIMAL(10, 4)
    )""")
    cur.executemany("INSERT INTO organizations (org_name, region, currency, exchange_rate) VALUES (%s, %s, %s, %s)", 
        [('Global_HQ', 'Global', 'USD', 7.2), ('CN_East', 'East', 'CNY', 1.0), ('EU_West', 'Europe', 'EUR', 7.8)])

    # --- 统一日志 (10万条) ---
    cur.execute("DROP TABLE IF EXISTS user_behavior_logs")
    cur.execute("""CREATE TABLE user_behavior_logs (
        log_id SERIAL PRIMARY KEY, user_id INT, event_time TIMESTAMP, event_type VARCHAR(50)
    )""")
    logs = [(random.randint(1, 1000), datetime.now() - timedelta(minutes=random.randint(0, 100000)), random.choice(['view', 'click', 'buy'])) for _ in range(100000)]
    cur.executemany("INSERT INTO user_behavior_logs (user_id, event_time, event_type) VALUES (%s, %s, %s)", logs)
    
    # --- 针对 PG 的特色增强 (地理空间数据模拟) ---
    cur.execute("DROP TABLE IF EXISTS city_nodes")
    cur.execute("CREATE TABLE city_nodes (id SERIAL PRIMARY KEY, name VARCHAR(50), lat DOUBLE PRECISION, lon DOUBLE PRECISION, population INT)")
    cities = [('New York', 40.71, -74.00, 8400000), ('London', 51.50, -0.12, 8900000), ('Tokyo', 35.68, 139.65, 14000000)]
    cur.executemany("INSERT INTO city_nodes (name, lat, lon, population) VALUES (%s, %s, %s, %s)", cities)
    
    conn.close()

if __name__ == "__main__":
    mysql_host = os.getenv("MYSQL_HOST", "localhost")
    mysql_user = os.getenv("MYSQL_USER", "root")
    mysql_pass = os.getenv("MYSQL_PASSWORD", "root")
    
    # MySQL 增强
    for db in ['classic_business', 'global_analysis']:
        sync_mysql(db, mysql_user, mysql_pass, mysql_host, 3306)
    
    # PG 增强
    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    pg_user = os.getenv("POSTGRES_USER", "postgres")
    pg_pass = os.getenv("POSTGRES_PASSWORD", "root")
    pg_db = os.getenv("POSTGRES_DB", "knowledge_base")
    sync_postgresql(pg_db, pg_user, pg_pass, pg_host, 5432)
    print(f"\n✅ 所有 4 个数据库 ({pg_db} 等) 同步增强完成！")
