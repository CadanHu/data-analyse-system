import pymysql
import random
from datetime import datetime, timedelta

def setup_business_data():
    conn = pymysql.connect(
        host='localhost', user='root', password='root', port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    
    # 1. 创建数据库
    cur.execute("CREATE DATABASE IF NOT EXISTS classic_business CHARACTER SET utf8mb4")
    cur.execute("USE classic_business")
    
    print("🏗️  正在构建商业分析数据库结构...")
    
    # 2. 创建产品表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        product_id INT PRIMARY KEY AUTO_INCREMENT,
        product_name VARCHAR(100),
        category VARCHAR(50),
        buy_price DECIMAL(10, 2),
        msrp DECIMAL(10, 2),
        quantity_in_stock INT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    
    # 3. 创建订单表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        order_id INT PRIMARY KEY AUTO_INCREMENT,
        order_date DATE,
        required_date DATE,
        shipped_date DATE,
        status VARCHAR(20),
        customer_id INT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    
    # 4. 创建订单详情表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS order_details (
        order_id INT,
        product_id INT,
        quantity_ordered INT,
        price_each DECIMAL(10, 2),
        PRIMARY KEY (order_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    
    # 5. 清理并填充产品数据
    cur.execute("TRUNCATE TABLE products")
    products = [
        ('iPhone 15 Pro', 'Electronics', 5999.00, 7999.00, 150),
        ('MacBook Air M2', 'Electronics', 7499.00, 8999.00, 85),
        ('iPad Pro', 'Electronics', 4599.00, 5699.00, 120),
        ('AirPods Pro 2', 'Accessories', 1299.00, 1899.00, 300),
        ('Coffee Table', 'Furniture', 450.00, 899.00, 45),
        ('Ergonomic Chair', 'Furniture', 850.00, 1599.00, 60),
        ('Running Shoes', 'Apparel', 260.00, 599.00, 200),
        ('Yoga Mat', 'Sports', 85.00, 199.00, 150),
        ('Hydro Flask', 'Sports', 120.00, 249.00, 220),
        ('Smart Watch', 'Electronics', 1800.00, 2999.00, 95)
    ]
    cur.executemany("INSERT INTO products (product_name, category, buy_price, msrp, quantity_in_stock) VALUES (%s, %s, %s, %s, %s)", products)
    
    # 6. 生成 2025 年至今的模拟销售订单数据
    print("📊 正在生成 1000 条模拟销售数据...")
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    cur.execute("TRUNCATE TABLE orders")
    cur.execute("TRUNCATE TABLE order_details")
    
    start_date = datetime(2025, 1, 1)
    for i in range(1, 1001):
        order_date = start_date + timedelta(days=random.randint(0, 400))
        customer_id = random.randint(1001, 1050)
        status = random.choice(['Shipped', 'Shipped', 'Shipped', 'Resolved', 'Cancelled'])
        
        cur.execute("INSERT INTO orders (order_date, status, customer_id) VALUES (%s, %s, %s)", (order_date, status, customer_id))
        order_id = cur.lastrowid
        
        # 每个订单随机购买 1-3 个产品
        num_items = random.randint(1, 3)
        selected_prods = random.sample(range(1, 11), num_items)
        for pid in selected_prods:
            qty = random.randint(1, 5)
            # 获取该产品的售价 (MSRP)
            price = products[pid-1][3]
            cur.execute("INSERT INTO order_details (order_id, product_id, quantity_ordered, price_each) VALUES (%s, %s, %s, %s)", 
                        (order_id, pid, qty, price))
            
    print("✅ 商业分析库 'classic_business' 创建并导入成功！")
    conn.close()

if __name__ == "__main__":
    setup_business_data()
