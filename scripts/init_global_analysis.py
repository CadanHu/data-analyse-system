import pymysql
import random
import math
from datetime import datetime, timedelta

def setup_enhanced_global_analysis():
    conn = pymysql.connect(
        host='localhost', user='root', password='root', port=3306,
        charset='utf8mb4', autocommit=True
    )
    cur = conn.cursor()
    
    cur.execute("DROP DATABASE IF EXISTS global_analysis")
    cur.execute("CREATE DATABASE global_analysis CHARACTER SET utf8mb4")
    cur.execute("USE global_analysis")
    
    print("🚀 正在构建增强版全场景分析库 (含异常检测与多维关联数据)...")

    # --- 1. 趋势与时间序列 (增加异常点) ---
    cur.execute("""
    CREATE TABLE daily_metrics (
        date DATE PRIMARY KEY,
        revenue DECIMAL(12, 2),
        new_users INT,
        active_users INT,
        server_latency_ms INT -- 模拟性能指标
    )""")
    
    metrics_data = []
    start_date = datetime(2024, 1, 1)
    for i in range(500):
        curr_date = start_date + timedelta(days=i)
        # 基础营收 + 季节性波动
        base_rev = 10000 + (math.sin(i/15) * 3000)
        
        # 注入异常点 (Outliers): 每 50 天出现一次巨大的数据尖峰或暴跌
        if i % 50 == 0:
            base_rev *= random.choice([0.1, 5.0]) 
            
        metrics_data.append((curr_date.date(), base_rev, random.randint(100, 1000), random.randint(5000, 20000), random.randint(20, 500)))
    cur.executemany("INSERT INTO daily_metrics VALUES (%s, %s, %s, %s, %s)", metrics_data)

    # --- 2. 行为热力图 (增加真实周期性) ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_activity_heatmap (
        day_of_week INT,
        hour_of_day INT,
        user_count INT,
        cpu_load DECIMAL(5, 2) -- 关联系统负载
    )""")
    heatmap_data = []
    for day in range(7):
        for hour in range(24):
            # 模拟：深夜流量极低，午后和晚间流量极高
            val = int(500 * math.exp(-((hour-18)**2)/32) + 100) 
            if day >= 5: val *= 1.4 # 周末加成
            load = (val / 1000) * 80 + random.uniform(0, 10)
            heatmap_data.append((day, hour, val, load))
    cur.executemany("INSERT INTO user_activity_heatmap VALUES (%s, %s, %s, %s)", heatmap_data)

    # --- 3. 广告归因分析 (多维关联) ---
    cur.execute("""
    CREATE TABLE ad_attribution (
        touchpoint_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        channel VARCHAR(50),
        cost DECIMAL(10, 2),
        is_converted BOOLEAN,
        revenue_generated DECIMAL(12, 2)
    )""")
    attr_data = []
    channels = [('TikTok', 0.5), ('Google', 1.2), ('Facebook', 0.8), ('Direct', 0.0)]
    for i in range(1000):
        ch, cost_base = random.choice(channels)
        cost = random.uniform(5, 50) * cost_base
        conv = random.random() < (0.1 * cost_base)
        rev = random.uniform(100, 1000) if conv else 0
        attr_data.append((i, ch, cost, conv, rev))
    cur.executemany("INSERT INTO ad_attribution (user_id, channel, cost, is_converted, revenue_generated) VALUES (%s, %s, %s, %s, %s)", attr_data)

    print("✅ 全场景库 'global_analysis' 增强完毕！")
    conn.close()

if __name__ == "__main__":
    setup_enhanced_global_analysis()
