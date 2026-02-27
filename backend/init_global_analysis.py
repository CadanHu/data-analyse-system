import pymysql
import random
import math
from datetime import datetime, timedelta

def setup_global_analysis_db():
    conn = pymysql.connect(
        host='localhost', user='root', password='root', port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    
    # 1. 创建全能商业分析库 (Global Business Analytics)
    cur.execute("DROP DATABASE IF EXISTS global_analysis")
    cur.execute("CREATE DATABASE global_analysis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    cur.execute("USE global_analysis")
    
    print("🚀 正在构建全场景、多维可视化测试数据库 (v1.7.0)...")

    # --- 1. 趋势与时间序列 (Trends & Time Series) ---
    # 销售趋势与用户增长 (Line, Area)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS daily_metrics (
        date DATE PRIMARY KEY,
        revenue DECIMAL(12, 2),
        cumulative_revenue DECIMAL(15, 2),
        new_users INT,
        active_users INT
    )""")
    
    metrics_data = []
    cum_rev = 0
    start_date = datetime(2025, 1, 1)
    for i in range(365):
        curr_date = start_date + timedelta(days=i)
        rev = random.uniform(5000, 15000) + (math.sin(i/10) * 2000) # 模拟波动
        cum_rev += rev
        new_users = random.randint(50, 200) + int(i/5) # 模拟增长趋势
        active_users = new_users * random.randint(5, 10)
        metrics_data.append((curr_date.date(), rev, cum_rev, new_users, active_users))
    cur.executemany("INSERT INTO daily_metrics VALUES (%s, %s, %s, %s, %s)", metrics_data)

    # 股价波动 (Candlestick)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS stock_market (
        trade_date DATE PRIMARY KEY,
        open DECIMAL(10, 2),
        close DECIMAL(10, 2),
        high DECIMAL(10, 2),
        low DECIMAL(10, 2),
        volume INT
    )""")
    stock_data = []
    curr_price = 150.0
    for i in range(100):
        t_date = start_date + timedelta(days=i)
        o = curr_price + random.uniform(-2, 2)
        c = o + random.uniform(-5, 5)
        h = max(o, c) + random.uniform(0, 3)
        l = min(o, c) - random.uniform(0, 3)
        curr_price = c
        stock_data.append((t_date.date(), o, c, h, l, random.randint(100000, 500000)))
    cur.executemany("INSERT INTO stock_market VALUES (%s, %s, %s, %s, %s, %s)", stock_data)

    # --- 2. 比较与排名 (Comparison & Ranking) ---
    # 地区销售对比 (Bar/Column)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS regional_sales (
        region VARCHAR(50) PRIMARY KEY,
        sales_amount DECIMAL(12, 2),
        target_amount DECIMAL(12, 2),
        province VARCHAR(50)
    )""")
    regions = [
        ('华东', 1200000, 1000000, '上海'),
        ('华南', 950000, 900000, '广东'),
        ('华北', 800000, 850000, '北京'),
        ('西南', 600000, 550000, '四川'),
        ('中部', 500000, 480000, '湖北')
    ]
    cur.executemany("INSERT INTO regional_sales VALUES (%s, %s, %s, %s)", regions)

    # 产品多维度对比 (Radar)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS product_radar (
        product_name VARCHAR(50) PRIMARY KEY,
        performance INT,
        durability INT,
        design INT,
        price_score INT,
        service INT
    )""")
    radar_data = [
        ('Model X', 95, 80, 90, 60, 85),
        ('Model Y', 85, 90, 75, 80, 80),
        ('Model Z', 70, 75, 85, 95, 70)
    ]
    cur.executemany("INSERT INTO product_radar VALUES (%s, %s, %s, %s, %s, %s)", radar_data)

    # --- 3. 占比与构成 (Proportion & Composition) ---
    # 市场份额 (Pie), 渠道构成 (Stacked Bar), 类目占比 (Treemap)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS market_structure (
        category VARCHAR(50),
        channel VARCHAR(50),
        revenue DECIMAL(12, 2),
        share_pct DECIMAL(5, 2)
    )""")
    market_data = [
        ('手机', '线上', 500000, 35.0),
        ('手机', '线下', 300000, 20.0),
        ('电脑', '线上', 400000, 25.0),
        ('电脑', '线下', 150000, 10.0),
        ('配件', '线上', 100000, 6.0),
        ('配件', '线下', 40000, 4.0)
    ]
    cur.executemany("INSERT INTO market_structure VALUES (%s, %s, %s, %s)", market_data)

    # --- 4. 分布与相关性 (Distribution & Correlation) ---
    # 广告投入 vs 转化率 (Scatter, Bubble)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS ad_performance (
        campaign_id INT PRIMARY KEY AUTO_INCREMENT,
        spend DECIMAL(10, 2),
        conversions INT,
        roi DECIMAL(5, 2),
        impressions INT
    )""")
    ad_data = []
    for i in range(50):
        spend = random.uniform(1000, 10000)
        conv = int(spend / random.uniform(50, 100))
        roi = (conv * 150) / spend
        ad_data.append((spend, conv, roi, int(spend * 100)))
    cur.executemany("INSERT INTO ad_performance (spend, conversions, roi, impressions) VALUES (%s, %s, %s, %s)", ad_data)

    # 行为热力图 (Heatmap)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_activity_heatmap (
        day_of_week INT,
        hour_of_day INT,
        user_count INT,
        PRIMARY KEY (day_of_week, hour_of_day)
    )""")
    heatmap_data = []
    for day in range(7):
        for hour in range(24):
            # 模拟白天活跃，周末更活跃
            base = 100 if 9 <= hour <= 22 else 20
            if day >= 5: base *= 1.5
            val = int(base + random.uniform(-10, 10))
            heatmap_data.append((day, hour, val))
    cur.executemany("INSERT INTO user_activity_heatmap VALUES (%s, %s, %s)", heatmap_data)

    # --- 5. 地理与空间 (Geographic) ---
    # 区域销售密度 (Map Heatmap)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS geo_sales (
        province VARCHAR(50) PRIMARY KEY,
        sales_volume DECIMAL(12, 2),
        store_count INT,
        latitude DECIMAL(10, 6),
        longitude DECIMAL(10, 6)
    )""")
    geo_data = [
        ('广东', 5000000, 120, 23.1291, 113.2644),
        ('浙江', 4200000, 95, 30.2741, 120.1551),
        ('江苏', 4000000, 110, 32.0603, 118.7969),
        ('上海', 3800000, 80, 31.2304, 121.4737),
        ('北京', 3500000, 75, 39.9042, 116.4074),
        ('四川', 2800000, 65, 30.5728, 104.0668)
    ]
    cur.executemany("INSERT INTO geo_sales VALUES (%s, %s, %s, %s, %s)", geo_data)

    # --- 6. 流程与关系 (Process & Relationship) ---
    # 转化漏斗 (Funnel)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS conversion_funnel (
        step_name VARCHAR(50) PRIMARY KEY,
        step_order INT,
        user_count INT
    )""")
    funnel_data = [
        ('访问首页', 1, 10000),
        ('查看产品', 2, 6000),
        ('加入购物车', 3, 2500),
        ('提交订单', 4, 1200),
        ('完成支付', 5, 800)
    ]
    cur.executemany("INSERT INTO conversion_funnel VALUES (%s, %s, %s)", funnel_data)

    # 流量来源/流失 (Sankey)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS traffic_flow (
        source VARCHAR(50),
        target VARCHAR(50),
        value INT
    )""")
    sankey_data = [
        ('搜索引擎', '首页', 4000),
        ('社交媒体', '首页', 3000),
        ('直接访问', '首页', 3000),
        ('首页', '详情页', 6000),
        ('首页', '跳出', 4000),
        ('详情页', '购物车', 2500),
        ('详情页', '跳出', 3500)
    ]
    cur.executemany("INSERT INTO traffic_flow VALUES (%s, %s, %s)", sankey_data)

    # --- 7. 进阶分析 (Advanced) ---
    # 利润构成 (Waterfall)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS profit_breakdown (
        item_name VARCHAR(50),
        amount DECIMAL(12, 2),
        item_order INT
    )""")
    waterfall_data = [
        ('总营收', 1000000, 1),
        ('产品成本', -400000, 2),
        ('营销费用', -150000, 3),
        ('人力成本', -200000, 4),
        ('其他杂项', -50000, 5),
        ('净利润', 200000, 6)
    ]
    cur.executemany("INSERT INTO profit_breakdown VALUES (%s, %s, %s)", waterfall_data)

    # 项目进度 (Gantt)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS project_tasks (
        task_id INT PRIMARY KEY AUTO_INCREMENT,
        task_name VARCHAR(100),
        start_date DATE,
        end_date DATE,
        progress INT
    )""")
    gantt_data = [
        ('需求分析', '2025-01-01', '2025-01-15', 100),
        ('原型设计', '2025-01-16', '2025-01-31', 80),
        ('前端开发', '2025-02-01', '2025-03-15', 40),
        ('后端开发', '2025-02-01', '2025-03-20', 30),
        ('系统测试', '2025-03-21', '2025-04-10', 0)
    ]
    cur.executemany("INSERT INTO project_tasks (task_name, start_date, end_date, progress) VALUES (%s, %s, %s, %s)", gantt_data)

    print("✅ 全场景商业分析库 'global_analysis' 初始化成功！")
    print("✨ 已覆盖 15+ 种图表所需的测试数据：")
    print("   - 时间序列 (daily_metrics, stock_market)")
    print("   - 排名对比 (regional_sales, product_radar)")
    print("   - 构成分布 (market_structure, ad_performance, user_activity_heatmap)")
    print("   - 地理空间 (geo_sales)")
    print("   - 流程关系 (conversion_funnel, traffic_flow)")
    print("   - 进阶分析 (profit_breakdown, project_tasks)")
    
    conn.close()

if __name__ == "__main__":
    setup_global_analysis_db()
