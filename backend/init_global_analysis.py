import pymysql
import random
from datetime import datetime, timedelta

def setup_real_world_analysis_db():
    conn = pymysql.connect(
        host='localhost', user='root', password='root', port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    
    # 1. 创建全能商业分析库 (Global Business Analytics)
    cur.execute("CREATE DATABASE IF NOT EXISTS global_analysis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    cur.execute("USE global_analysis")
    
    print("🚀 正在构建全场景商业分析系统 (零售 + 租赁 + 人力)...")

    # --- 零售模块 (Retail) ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        customer_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        city VARCHAR(50),
        country VARCHAR(50),
        segment VARCHAR(20),
        registered_at DATE
    )""")
    
    # 填充客户
    segments = ['Corporate', 'Consumer', 'Small Business', 'Home Office']
    cities = [('New York', 'USA'), ('London', 'UK'), ('Tokyo', 'Japan'), ('Shanghai', 'China'), ('Berlin', 'Germany')]
    cust_data = []
    for i in range(1, 101):
        city, country = random.choice(cities)
        cust_data.append((f"Customer_{i}", city, country, random.choice(segments), (datetime(2023, 1, 1) + timedelta(days=random.randint(0, 700))).date()))
    cur.executemany("INSERT INTO customers (name, city, country, segment, registered_at) VALUES (%s, %s, %s, %s, %s)", cust_data)

    # --- 租赁模块 (Rental/Subscription) ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS subscriptions (
        sub_id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT,
        plan_name VARCHAR(50),
        monthly_fee DECIMAL(10, 2),
        start_date DATE,
        status VARCHAR(20)
    )""")
    plans = [('Basic', 9.99), ('Standard', 19.99), ('Premium', 29.99)]
    sub_data = []
    for i in range(1, 81):
        plan, fee = random.choice(plans)
        sub_data.append((random.randint(1, 100), plan, fee, (datetime(2024, 1, 1) + timedelta(days=random.randint(0, 365))).date(), random.choice(['Active', 'Active', 'Cancelled'])))
    cur.executemany("INSERT INTO subscriptions (customer_id, plan_name, monthly_fee, start_date, status) VALUES (%s, %s, %s, %s, %s)", sub_data)

    # --- 人力/工资模块 (HR & Salaries) ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        emp_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        department VARCHAR(50),
        base_salary DECIMAL(10, 2),
        hire_date DATE
    )""")
    depts = ['Sales', 'Engineering', 'Marketing', 'Finance', 'Operations']
    emp_data = []
    for i in range(1, 31):
        emp_data.append((f"Employee_{i}", random.choice(depts), random.uniform(5000, 15000), (datetime(2020, 1, 1) + timedelta(days=random.randint(0, 1500))).date()))
    cur.executemany("INSERT INTO employees (name, department, base_salary, hire_date) VALUES (%s, %s, %s, %s)", emp_data)

    # --- 销售记录模块 (Sales Performance) ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sales_performance (
        sale_id INT PRIMARY KEY AUTO_INCREMENT,
        emp_id INT,
        month VARCHAR(7),
        revenue DECIMAL(12, 2),
        target_achieved BOOLEAN
    )""")
    perf_data = []
    for eid in range(1, 31):
        for month in range(1, 13):
            rev = random.uniform(20000, 100000)
            perf_data.append((eid, f"2024-{month:02d}", rev, rev > 60000))
    cur.executemany("INSERT INTO sales_performance (emp_id, month, revenue, target_achieved) VALUES (%s, %s, %s, %s)", perf_data)

    print("✅ 全场景商业分析库 'global_analysis' 创建并导入成功！")
    print("📊 包含：100名客户，80个订阅合约，30名员工，360条销售业绩记录。")
    conn.close()

if __name__ == "__main__":
    setup_real_world_analysis_db()
