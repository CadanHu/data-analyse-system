"""
业务数据库初始化
创建示例数据表：订单、用户、产品
"""
import aiosqlite
from pathlib import Path

from config import BUSINESS_DB_PATH


async def init_business_db():
    """初始化业务数据库"""
    async with aiosqlite.connect(BUSINESS_DB_PATH) as db:
        # 创建用户表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                region TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 创建产品表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT,
                price REAL,
                cost REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 创建订单表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product_id INTEGER,
                quantity INTEGER,
                amount REAL,
                order_date DATE,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        """)
        
        # 插入示例用户数据
        users = [
            ("张三", "zhangsan@example.com", "华东"),
            ("李四", "lisi@example.com", "华南"),
            ("王五", "wangwu@example.com", "华北"),
            ("赵六", "zhaoliu@example.com", "华东"),
            ("钱七", "qianqi@example.com", "华西"),
            ("孙八", "sunba@example.com", "华中"),
            ("周九", "zhoujiu@example.com", "华南"),
            ("吴十", "wushi@example.com", "华北"),
        ]
        await db.executemany(
            "INSERT OR IGNORE INTO users (name, email, region) VALUES (?, ?, ?)",
            users
        )
        
        # 插入示例产品数据
        products = [
            ("iPhone 15 Pro", "手机", 8999.0, 6500.0),
            ("MacBook Pro 14", "电脑", 14999.0, 11000.0),
            ("AirPods Pro", "配件", 1899.0, 1200.0),
            ("iPad Air", "平板", 4799.0, 3500.0),
            ("Apple Watch", "穿戴", 2999.0, 2000.0),
            ("MacBook Air", "电脑", 9999.0, 7500.0),
            ("iPhone 15", "手机", 5999.0, 4200.0),
            ("iPad Pro", "平板", 6799.0, 4800.0),
            ("AirPods", "配件", 999.0, 600.0),
            ("Apple Watch Ultra", "穿戴", 6499.0, 4500.0),
        ]
        await db.executemany(
            "INSERT OR IGNORE INTO products (name, category, price, cost) VALUES (?, ?, ?, ?)",
            products
        )
        
        # 插入示例订单数据
        import random
        from datetime import datetime, timedelta
        
        orders = []
        base_date = datetime.now()
        
        # 生成 500 条订单数据
        for i in range(500):
            user_id = random.randint(1, len(users))
            product_id = random.randint(1, len(products))
            quantity = random.randint(1, 10)
            # 根据产品价格计算正确的金额
            product_price = products[product_id - 1][2]
            amount = quantity * product_price
            # 过去 180 天内的随机日期
            order_date = (base_date - timedelta(days=random.randint(0, 180))).strftime("%Y-%m-%d")
            status = random.choice(["completed", "completed", "completed", "shipped", "pending"])
            orders.append((user_id, product_id, quantity, amount, order_date, status))
        
        await db.executemany(
            """INSERT INTO orders (user_id, product_id, quantity, amount, order_date, status) 
               VALUES (?, ?, ?, ?, ?, ?)""",
            orders
        )
        
        await db.commit()
        print(f"✅ 业务数据库初始化完成：{BUSINESS_DB_PATH}")
        print(f"   - 用户数：{len(users)}")
        print(f"   - 产品数：{len(products)}")
        print(f"   - 订单数：{len(orders)}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(init_business_db())
