"""
inject_2025_2026_data.py — 补充 2025-04 至 2026-03 订单数据，并给 customers 添加经纬度

做法：
  1. ALTER TABLE customers ADD COLUMN latitude / longitude
  2. UPDATE 城市坐标
  3. INSERT 35,000 条新订单 (2025-04-01 ~ 2026-03-15)
  4. INSERT 对应 order_details / returns
"""

import pymysql
import random
import os
from datetime import datetime, timedelta

# ── 主要城市经纬度 ──────────────────────────────────────────────
CITY_COORDS = {
    '北京':  (39.9042, 116.4074),
    '上海':  (31.2304, 121.4737),
    '广州':  (23.1291, 113.2644),
    '深圳':  (22.5431, 114.0579),
    '杭州':  (30.2741, 120.1551),
    '武汉':  (30.5928, 114.3055),
    '成都':  (30.5728, 104.0668),
    '西安':  (34.3416, 108.9398),
    '南京':  (32.0603, 118.7969),
    '重庆':  (29.5630, 106.5516),
    '天津':  (39.3434, 117.3616),
    '苏州':  (31.2990, 120.5853),
    '郑州':  (34.7466, 113.6253),
    '长沙':  (28.2278, 112.9388),
    '青岛':  (36.0671, 120.3826),
}

def main():
    conn = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "root"),
        port=3306,
        charset='utf8mb4',
        autocommit=True
    )
    cur = conn.cursor()
    cur.execute("USE classic_business")

    # ── 1. 给 customers 加经纬度字段 ──────────────────────────────
    print("📍 [1/4] 添加 latitude / longitude 字段...")
    for col, definition in [("latitude", "DECIMAL(10,6)"), ("longitude", "DECIMAL(10,6)")]:
        try:
            cur.execute(f"ALTER TABLE customers ADD COLUMN {col} {definition}")
            print(f"   ✅ 已添加 {col}")
        except pymysql.err.OperationalError:
            print(f"   ⏩ {col} 已存在，跳过")

    # ── 2. 更新城市坐标（带随机偏移模拟不同区域）─────────────────
    print("🗺️  [2/4] 更新城市经纬度...")
    for city, (lat, lng) in CITY_COORDS.items():
        # 加 ±0.05° 随机偏移，让同城客户分散在地图上
        cur.execute("""
            UPDATE customers
            SET latitude  = %s + (RAND() - 0.5) * 0.10,
                longitude = %s + (RAND() - 0.5) * 0.10
            WHERE city = %s AND (latitude IS NULL OR latitude = 0)
        """, (lat, lng, city))
    cur.execute("SELECT COUNT(*) FROM customers WHERE latitude IS NOT NULL")
    print(f"   已更新 {cur.fetchone()[0]} 条客户坐标")

    # ── 3. 查询基础数据范围 ───────────────────────────────────────
    cur.execute("SELECT MAX(customer_id) FROM customers")
    max_cid = cur.fetchone()[0]
    cur.execute("SELECT MAX(product_id) FROM products")
    max_pid = cur.fetchone()[0]
    cur.execute("SELECT campaign_id FROM marketing_campaigns")
    camp_ids = [r[0] for r in cur.fetchall()]

    # ── 4. 补充 2025-04-01 ~ 2026-03-15 订单 ────────────────────
    print("📈 [3/4] 生成 35,000 条新订单 (2025-04 ~ 2026-03)...")

    start = datetime(2025, 4, 1)
    end   = datetime(2026, 3, 15)
    total_days = (end - start).days  # ~349 天

    orders_data   = []
    details_data  = []
    returns_data  = []
    payment_methods = ['Alipay', 'WeChat', 'CreditCard', 'UnionPay']
    statuses        = ['Shipped', 'Resolved', 'Cancelled', None]
    status_weights  = [0.80, 0.10, 0.07, 0.03]

    NUM_ORDERS = 35_000
    for _ in range(NUM_ORDERS):
        day_offset = random.randint(0, total_days)
        order_date = start + timedelta(days=day_offset)

        # 双十一 & 618 促销爆发
        is_1111 = order_date.month == 11 and order_date.day <= 11
        is_618  = order_date.month == 6  and 1 <= order_date.day <= 18
        is_promo = is_1111 or is_618

        cid      = random.randint(1, max_cid)
        camp_id  = random.choice(camp_ids) if (random.random() > 0.7 and camp_ids) else None
        status   = random.choices(statuses, weights=status_weights)[0]
        ship_cost = round(random.uniform(5, 50), 2)
        pay_method = random.choice(payment_methods)

        orders_data.append((order_date, cid, camp_id, status, ship_cost, pay_method))

    print(f"   批量写入 {len(orders_data)} 条订单...")
    cur.executemany(
        "INSERT INTO orders (order_date, customer_id, campaign_id, status, shipping_cost, payment_method) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        orders_data
    )

    # 取回刚插入的 order_id 范围（lastrowid - NUM_ORDERS + 1 ~ lastrowid）
    last_oid  = cur.lastrowid
    first_oid = last_oid - NUM_ORDERS + 1

    print(f"   生成订单详情 & 退货...")
    BATCH = 1000
    for oid in range(first_oid, last_oid + 1):
        num_items = random.randint(1, 5)
        pids = random.sample(range(1, max_pid + 1), min(num_items, max_pid))
        for pid in pids:
            qty   = random.randint(1, 10)
            price = round(random.uniform(50, 500), 2)
            disc  = round(price * random.uniform(0.05, 0.15), 2) if random.random() < 0.3 else 0
            details_data.append((oid, pid, qty, price, disc))

            if random.random() < 0.03:
                ret_date = datetime(2025, 4, 1) + timedelta(days=random.randint(0, total_days + 15))
                returns_data.append((oid, pid, ret_date.date(), "Product issue", price * qty))

        if len(details_data) >= BATCH:
            cur.executemany(
                "INSERT IGNORE INTO order_details (order_id, product_id, quantity_ordered, price_each, discount_amount) "
                "VALUES (%s, %s, %s, %s, %s)",
                details_data
            )
            details_data = []

    if details_data:
        cur.executemany(
            "INSERT IGNORE INTO order_details (order_id, product_id, quantity_ordered, price_each, discount_amount) "
            "VALUES (%s, %s, %s, %s, %s)",
            details_data
        )

    if returns_data:
        cur.executemany(
            "INSERT INTO returns (order_id, product_id, return_date, reason, refund_amount) "
            "VALUES (%s, %s, %s, %s, %s)",
            returns_data
        )
        print(f"   退货记录: {len(returns_data)} 条")

    # ── 5. 验证 ───────────────────────────────────────────────────
    print("✅ [4/4] 验证数据...")
    cur.execute("SELECT MIN(order_date), MAX(order_date), COUNT(*) FROM orders")
    print("   orders:", cur.fetchone())
    cur.execute("""
        SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, COUNT(*) AS cnt
        FROM orders
        WHERE order_date >= '2025-01-01'
        GROUP BY month ORDER BY month
    """)
    print("   2025+ 月度订单量:")
    for row in cur.fetchall():
        print(f"     {row[0]}: {row[1]} 条")

    conn.close()
    print("\n🎉 数据补充完成！现在可以重新同步到手机。")

if __name__ == "__main__":
    main()
