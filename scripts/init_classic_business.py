import os
import pymysql
import random
import math
from datetime import datetime, timedelta

def setup_enhanced_business_data():
    conn = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "root"),
        port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    
    cur.execute("CREATE DATABASE IF NOT EXISTS classic_business CHARACTER SET utf8mb4")
    cur.execute("USE classic_business")
    
    print("🏗️  正在构建增强型商业分析数据库 (规模级 + 脏数据模拟)...")

    # 1. 结构优化：增加索引和新表
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    tables = ['order_details', 'orders', 'customers', 'products', 'marketing_campaigns', 'returns']
    for table in tables:
        cur.execute(f"DROP TABLE IF EXISTS {table}")

    cur.execute("""
    CREATE TABLE products (
        product_id INT PRIMARY KEY AUTO_INCREMENT,
        product_name VARCHAR(100),
        category VARCHAR(50),
        buy_price DECIMAL(10, 2),
        msrp DECIMAL(10, 2),
        quantity_in_stock INT,
        tags LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")

    cur.execute("""
    CREATE TABLE customers (
        customer_id INT PRIMARY KEY AUTO_INCREMENT,
        customer_name VARCHAR(100),
        segment VARCHAR(20), -- 'VIP', 'Regular', 'New'
        city VARCHAR(50),
        province VARCHAR(50),
        email VARCHAR(100),
        phone VARCHAR(20)
    )""")

    cur.execute("""
    CREATE TABLE marketing_campaigns (
        campaign_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        channel VARCHAR(50), -- 'Social', 'Search', 'Email'
        budget DECIMAL(12, 2),
        start_date DATE,
        end_date DATE
    )""")

    cur.execute("""
    CREATE TABLE orders (
        order_id INT PRIMARY KEY AUTO_INCREMENT,
        order_date DATETIME,
        customer_id INT,
        campaign_id INT,
        status VARCHAR(20),
        shipping_cost DECIMAL(10, 2),
        payment_method VARCHAR(20) -- 'Alipay', 'WeChat', 'CreditCard'
    )""")

    cur.execute("""
    CREATE TABLE order_details (
        order_id INT,
        product_id INT,
        quantity_ordered INT,
        price_each DECIMAL(10, 2),
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        PRIMARY KEY (order_id, product_id)
    )""")

    cur.execute("""
    CREATE TABLE returns (
        return_id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT,
        product_id INT,
        return_date DATE,
        reason TEXT,
        refund_amount DECIMAL(10, 2)
    )""")

    # 2. 填充高质量基础数据
    print("📦 正在生成 200+ 种产品...")
    categories = ['Electronics', 'Furniture', 'Apparel', 'Sports', 'Food', 'Beauty']
    product_list = []
    for i in range(200):
        cat = random.choice(categories)
        buy_p = round(random.uniform(10, 5000), 2)
        msrp = round(buy_p * random.uniform(1.2, 2.5), 2)
        product_list.append((f"Prod_{cat}_{i}", cat, buy_p, msrp, random.randint(0, 1000)))
    cur.executemany("INSERT INTO products (product_name, category, buy_price, msrp, quantity_in_stock) VALUES (%s, %s, %s, %s, %s)", product_list)

    print("👥 正在生成 2000+ 客户...")
    cities = [('北京', '北京'), ('上海', '上海'), ('广州', '广东'), ('深圳', '广东'), ('杭州', '浙江'), ('武汉', '湖北'), ('成都', '四川')]
    customer_list = []
    for i in range(2000):
        city, prov = random.choice(cities)
        seg = random.choices(['Regular', 'VIP', 'New'], weights=[0.7, 0.1, 0.2])[0]
        customer_list.append((f"Cust_{i}", seg, city, prov, f"user{i}@example.com"))
    cur.executemany("INSERT INTO customers (customer_name, segment, city, province, email) VALUES (%s, %s, %s, %s, %s)", customer_list)

    # 3. 填充营销活动
    campaigns = [
        ('Spring Sale', 'Social', 50000, '2025-03-01', '2025-03-15'),
        ('Double 11 Prep', 'Search', 200000, '2025-11-01', '2025-11-12'),
        ('Summer Clearance', 'Email', 30000, '2025-07-01', '2025-07-31')
    ]
    cur.executemany("INSERT INTO marketing_campaigns (name, channel, budget, start_date, end_date) VALUES (%s, %s, %s, %s, %s)", campaigns)

    # 4. 模拟复杂销售订单 (20,000 条)
    print("📈 正在生成 20,000 条模拟订单 (包含周期性、爆发期、脏数据)...")
    start_date = datetime(2024, 1, 1)
    orders_data = []
    details_data = []
    returns_data = []

    for i in range(1, 20001):
        # 时间模拟：增加 11 月的爆发
        day_offset = random.randint(0, 450)
        curr_date = start_date + timedelta(days=day_offset)
        
        # 爆发系数：11月权重增加 5 倍
        is_promo = (curr_date.month == 11 and 1 <= curr_date.day <= 11)
        if is_promo:
            if random.random() > 0.8: # 如果不是促销期，跳过一部分
                pass
        
        cid = random.randint(1, 2000)
        camp_id = random.randint(1, 3) if random.random() > 0.7 else None
        
        # 脏数据注入：1% 的状态是 NULL 或异常
        status = random.choices(['Shipped', 'Resolved', 'Cancelled', None, 'Error_99'], weights=[0.8, 0.1, 0.05, 0.02, 0.03])[0]
        ship_cost = round(random.uniform(5, 50), 2)
        
        cur.execute("INSERT INTO orders (order_date, customer_id, campaign_id, status, shipping_cost) VALUES (%s, %s, %s, %s, %s)", 
                    (curr_date, cid, camp_id, status, ship_cost))
        oid = cur.lastrowid
        
        # 订单项：1-5 个
        num_items = random.randint(1, 5)
        pids = random.sample(range(1, 201), num_items)
        for pid in pids:
            qty = random.randint(1, 10)
            # 获取价格，偶尔产生“价格异常”脏数据
            price = round(random.uniform(50, 200), 2) if random.random() > 0.99 else 99999.99
            disc = round(price * 0.1, 2) if is_promo else 0
            details_data.append((oid, pid, qty, price, disc))
            
            # 售后模拟：3% 的退货率
            if random.random() < 0.03:
                returns_data.append((oid, pid, curr_date + timedelta(days=random.randint(1, 7)), "Product damaged", price * qty))

    # 批量插入详情
    print(f"🔗 正在关联 {len(details_data)} 条订单详情...")
    cur.executemany("INSERT INTO order_details (order_id, product_id, quantity_ordered, price_each, discount_amount) VALUES (%s, %s, %s, %s, %s)", details_data)
    
    print(f"🔙 正在生成 {len(returns_data)} 条退货记录...")
    cur.executemany("INSERT INTO returns (order_id, product_id, return_date, reason, refund_amount) VALUES (%s, %s, %s, %s, %s)", returns_data)

    print("✅ 增强型数据库 'classic_business' 创建成功！")
    conn.close()

if __name__ == "__main__":
    setup_enhanced_business_data()
