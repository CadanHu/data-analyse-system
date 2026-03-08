import pymysql
import random
import time
from datetime import datetime, timedelta

def upgrade_to_enterprise():
    conn = pymysql.connect(
        host='localhost', user='root', password='root', port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    cur.execute("USE classic_business")
    
    print("🚀 正在启动企业级数据库升级程序 (v2.0)...")

    # ==========================================
    # 1. 组织架构与多租户 (Multi-Tenancy)
    # ==========================================
    print("🏢 [1/3] 构建多租户组织架构...")
    cur.execute("DROP TABLE IF EXISTS organizations")
    cur.execute("""
    CREATE TABLE organizations (
        org_id INT PRIMARY KEY AUTO_INCREMENT,
        org_name VARCHAR(100),
        region VARCHAR(50),
        currency VARCHAR(10), -- CNY, USD, EUR
        exchange_rate DECIMAL(10, 4) -- 相对基准货币(CNY)的汇率
    )""")
    
    orgs = [
        ('总部_Global', 'Global', 'USD', 7.2000),
        ('分公司_华东', 'East_China', 'CNY', 1.0000),
        ('分公司_华南', 'South_China', 'CNY', 1.0000),
        ('分公司_北美', 'North_America', 'USD', 7.2000),
        ('分公司_欧洲', 'Europe', 'EUR', 7.8500)
    ]
    cur.executemany("INSERT INTO organizations (org_name, region, currency, exchange_rate) VALUES (%s, %s, %s, %s)", orgs)
    
    # 为现有表添加 org_id 字段
    tables_to_patch = ['products', 'customers', 'orders', 'marketing_campaigns']
    for table in tables_to_patch:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN org_id INT DEFAULT 2") # 默认华东
            cur.execute(f"CREATE INDEX idx_{table}_org ON {table}(org_id)")
        except pymysql.err.OperationalError:
            pass # 字段已存在
            
    # 随机分配组织归属
    print("    正在重新分配 20,000+ 条数据的归属权...")
    cur.execute("UPDATE products SET org_id = FLOOR(1 + RAND() * 5)")
    cur.execute("UPDATE customers SET org_id = FLOOR(1 + RAND() * 5)")
    cur.execute("UPDATE orders SET org_id = (SELECT org_id FROM customers WHERE customers.customer_id = orders.customer_id)")

    # ==========================================
    # 2. 非结构化数据与客户反馈 (Unstructured Data)
    # ==========================================
    print("📝 [2/3] 生成客户反馈与非结构化文本...")
    # 修改 returns 表，增加 feedback 字段
    try:
        cur.execute("ALTER TABLE returns ADD COLUMN customer_feedback LONGTEXT")
        cur.execute("ALTER TABLE returns ADD COLUMN sentiment_score DECIMAL(3, 2)") # 情感评分 -1.0 ~ 1.0
    except:
        pass

    # 生成真实的反馈文本
    feedbacks = [
        ("物流太慢了，等了半个月！", -0.8),
        ("东西收到了，质量一般，习惯性好评吧。", 0.1),
        ("非常满意！包装精美，下次还来。", 0.9),
        ("颜色和图片不符，甚至有点破损，非常失望。", -0.9),
        ("客服态度很好，帮我解决了退换货问题。", 0.7),
        ("一般般吧，性价比不高。", -0.2),
        ("快递暴力运输，箱子都烂了！", -0.95),
        ("Great product! Loved the quality.", 0.85), # 混合英文
        ("Do not buy! It broke after 2 days.", -0.9)
    ]
    
    cur.execute("SELECT return_id FROM returns")
    return_ids = [row[0] for row in cur.fetchall()]
    
    update_data = []
    for rid in return_ids:
        text, score = random.choice(feedbacks)
        # 加上一点随机扰动
        final_score = score + random.uniform(-0.05, 0.05)
        update_data.append((text, final_score, rid))
        
    cur.executemany("UPDATE returns SET customer_feedback = %s, sentiment_score = %s WHERE return_id = %s", update_data)

    # ==========================================
    # 3. 高频行为日志 (Big Data Simulation)
    # ==========================================
    print("🌊 [3/3] 正在生成 500,000+ 条用户行为日志 (模拟点击流)...")
    cur.execute("DROP TABLE IF EXISTS user_behavior_logs")
    cur.execute("""
    CREATE TABLE user_behavior_logs (
        log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        event_time DATETIME,
        event_type VARCHAR(50), -- 'view_product', 'add_to_cart', 'search', 'click_banner'
        target_id INT, -- product_id or campaign_id
        device_type VARCHAR(20), -- 'Mobile', 'Desktop', 'Tablet'
        session_id VARCHAR(64),
        ip_address VARCHAR(45)
    ) ENGINE=InnoDB
    """)
    
    # 批量生成日志 (使用 buffer 写入以提高速度)
    batch_size = 5000
    total_logs = 500000
    start_time = datetime(2024, 1, 1)
    
    buffer = []
    print(f"    预计耗时约 30 秒，请稍候...")
    
    for i in range(total_logs):
        # 模拟：大部分行为发生在最近 3 个月
        if random.random() > 0.3:
            event_time = datetime.now() - timedelta(days=random.randint(0, 90), seconds=random.randint(0, 86400))
        else:
            event_time = start_time + timedelta(days=random.randint(0, 365))
            
        uid = random.randint(1, 2000)
        etype = random.choices(['view_product', 'search', 'add_to_cart', 'click_banner', 'checkout_start'], 
                             weights=[0.6, 0.2, 0.1, 0.05, 0.05])[0]
        tid = random.randint(1, 200) if etype in ['view_product', 'add_to_cart'] else None
        device = random.choices(['Mobile', 'Desktop'], weights=[0.7, 0.3])[0]
        sess = f"sess_{uid}_{random.randint(1000, 9999)}"
        ip = f"192.168.{random.randint(1, 255)}.{random.randint(1, 255)}"
        
        buffer.append((uid, event_time, etype, tid, device, sess, ip))
        
        if len(buffer) >= batch_size:
            cur.executemany("""
                INSERT INTO user_behavior_logs 
                (user_id, event_time, event_type, target_id, device_type, session_id, ip_address) 
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, buffer)
            buffer = []
            if i % 50000 == 0:
                print(f"    已生成 {i} 条日志...")
                
    if buffer:
        cur.executemany("""
            INSERT INTO user_behavior_logs 
            (user_id, event_time, event_type, target_id, device_type, session_id, ip_address) 
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, buffer)

    # 建立索引 (这是大数据量查询的关键)
    print("    正在为日志表建立索引...")
    cur.execute("CREATE INDEX idx_logs_user_time ON user_behavior_logs(user_id, event_time)")
    cur.execute("CREATE INDEX idx_logs_event_type ON user_behavior_logs(event_type)")

    # ==========================================
    # 4. 数据裂变 (Data Fission - 压力测试准备)
    # ==========================================
    print("🔥 [Bonus] 执行订单表数据裂变 (目标: 100,000+ 行)...")
    # 当前约 20,000 行，复制 3 次即可达到 ~160,000 行
    # 为了避免主键冲突，不复制 order_id
    for _ in range(3):
        print("    正在翻倍复制 orders 表数据...")
        cur.execute("""
            INSERT INTO orders (order_date, customer_id, campaign_id, status, shipping_cost, payment_method, org_id)
            SELECT 
                DATE_ADD(order_date, INTERVAL -1 YEAR), -- 时间回溯一年，避免重叠
                customer_id, campaign_id, status, shipping_cost, payment_method, org_id
            FROM orders
        """)
        
    print("✅ 企业级数据库升级完成！")
    print("   - 新增表: organizations, user_behavior_logs (50w+)")
    print("   - 增强表: orders (10w+), returns (含 NLP 文本)")
    print("   - 特性: 多租户隔离, 真实点击流, 情感分析数据")
    
    conn.close()

if __name__ == "__main__":
    upgrade_to_enterprise()
