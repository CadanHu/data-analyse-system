import os
import pymysql
import psycopg2
import random
from datetime import datetime, timedelta

def optimize_mysql_classic(host, user, password):
    print("💎 正在极致优化 classic_business...")
    conn = pymysql.connect(host=host, user=user, password=password, database='classic_business', charset='utf8mb4', autocommit=True)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS users")
    cur.execute("""CREATE TABLE users (
        user_id INT PRIMARY KEY AUTO_INCREMENT COMMENT '唯一用户ID',
        username VARCHAR(50) COMMENT '用户名',
        gender ENUM('M', 'F', 'O') COMMENT '性别: M=男, F=女, O=其他',
        age INT COMMENT '年龄',
        registration_date DATE COMMENT '注册日期'
    ) COMMENT='系统统一用户信息表'""")
    users = [(f"User_{i}", random.choice(['M', 'F', 'O']), random.randint(18, 70), datetime(2023, 1, 1) + timedelta(days=random.randint(0, 400))) for i in range(1, 2001)]
    cur.executemany("INSERT INTO users (username, gender, age, registration_date) VALUES (%s, %s, %s, %s)", users)
    
    cur.execute("DROP TABLE IF EXISTS product_price_history")
    cur.execute("""CREATE TABLE product_price_history (
        history_id INT PRIMARY KEY AUTO_INCREMENT,
        product_id INT COMMENT '关联产品ID',
        old_price DECIMAL(10, 2),
        new_price DECIMAL(10, 2),
        change_date DATE COMMENT '调价生效日期'
    ) COMMENT='产品调价历史记录表'""")
    history = [(random.randint(1, 200), random.uniform(50, 500), random.uniform(50, 500), datetime(2024, 1, 1) + timedelta(days=random.randint(0, 365))) for _ in range(500)]
    cur.executemany("INSERT INTO product_price_history (product_id, old_price, new_price, change_date) VALUES (%s, %s, %s, %s)", history)
    conn.close()

def optimize_mysql_global(host, user, password):
    print("🚀 正在极致优化 global_analysis...")
    conn = pymysql.connect(host=host, user=user, password=password, database='global_analysis', charset='utf8mb4', autocommit=True)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS sales_forecast")
    cur.execute("""CREATE TABLE sales_forecast (
        forecast_date DATE PRIMARY KEY COMMENT '预测日期',
        actual_value DECIMAL(12, 2) COMMENT '当日实际值',
        predicted_value DECIMAL(12, 2) COMMENT '模型预测值',
        upper_bound DECIMAL(12, 2) COMMENT '置信区间上限',
        lower_bound DECIMAL(12, 2) COMMENT '置信区间下限'
    ) COMMENT='销售额预测与实际对比表'""")
    forecast = []
    for i in range(100):
        d = datetime.now().date() + timedelta(days=i-50)
        actual = 10000 + random.uniform(-1000, 1000) if i < 50 else None
        pred = 10000 + (i * 20) + random.uniform(-500, 500)
        forecast.append((d, actual, pred, pred*1.1, pred*0.9))
    cur.executemany("INSERT INTO sales_forecast VALUES (%s, %s, %s, %s, %s)", forecast)
    conn.close()

def optimize_postgres(host, port, user, password):
    print("🐘 正在极致优化 postgres...")
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname='postgres')
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS audit_logs")
    cur.execute("""CREATE TABLE audit_logs (
        audit_id SERIAL PRIMARY KEY,
        action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actor_id INT,
        action_type VARCHAR(50),
        payload JSONB
    )""")
    cur.execute("COMMENT ON COLUMN audit_logs.payload IS '包含操作细节的 JSON 报文'")
    audit_data = [
        (101, 'Update_Product', '{"pid": 20, "changes": {"price": [50, 65], "stock": [10, 5]}, "ip": "10.0.0.1"}'),
        (102, 'User_Login', '{"method": "OAuth", "provider": "Google", "success": true}'),
        (103, 'System_Alert', '{"severity": "High", "module": "Payment", "error_code": 5003}')
    ]
    cur.executemany("INSERT INTO audit_logs (actor_id, action_type, payload) VALUES (%s, %s, %s)", audit_data)
    cur.execute("CREATE INDEX idx_audit_payload ON audit_logs USING GIN (payload)")
    conn.close()

if __name__ == "__main__":
    mysql_host = os.getenv("MYSQL_HOST", "localhost")
    mysql_user = os.getenv("MYSQL_USER", "root")
    mysql_pass = os.getenv("MYSQL_PASSWORD", "root")
    
    optimize_mysql_classic(mysql_host, mysql_user, mysql_pass)
    optimize_mysql_global(mysql_host, mysql_user, mysql_pass)

    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    pg_user = os.getenv("POSTGRES_USER", "postgres")
    pg_pass = os.getenv("POSTGRES_PASSWORD", "")
    optimize_postgres(pg_host, 5432, pg_user, pg_pass)
    print("\n🏆 全球顶级仿真数据库优化已完成！")
