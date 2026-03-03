
import pymysql
import random
import math
from datetime import datetime, timedelta

def inject_2024_data():
    try:
        conn = pymysql.connect(
            host='localhost', user='root', password='root', port=3306,
            charset='utf8mb4', autocommit=True
        )
        cur = conn.cursor()
        cur.execute("USE global_analysis")
        
        print("💉 正在为 2024 年注入测试数据...")

        # 1. daily_metrics (2024-01-01 到 2024-12-31)
        # 先检查是否已经有 2024 的数据
        cur.execute("SELECT COUNT(*) FROM daily_metrics WHERE date >= '2024-01-01' AND date <= '2024-12-31'")
        if cur.fetchone()[0] == 0:
            metrics_data = []
            cum_rev = 0
            start_date_2024 = datetime(2024, 1, 1)
            for i in range(366): # 2024 是闰年
                curr_date = start_date_2024 + timedelta(days=i)
                rev = random.uniform(4000, 12000) + (math.sin(i/10) * 1500) # 比 2025 略低
                cum_rev += rev
                new_users = random.randint(30, 150) + int(i/6)
                active_users = new_users * random.randint(4, 8)
                metrics_data.append((curr_date.date(), rev, cum_rev, new_users, active_users))
            cur.executemany("INSERT INTO daily_metrics VALUES (%s, %s, %s, %s, %s)", metrics_data)
            print(f"✅ 已注入 366 条 daily_metrics (2024) 数据。")

        # 2. regional_sales_distribution (2024-01-01 到 2024-12-31)
        # 每月每大区每产品线注入一些数据
        cur.execute("SELECT COUNT(*) FROM regional_sales_distribution WHERE sale_date >= '2024-01-01' AND sale_date <= '2024-12-31'")
        if cur.fetchone()[0] == 0:
            rsd_data = []
            regions = ['华东大区', '华南大区', '华北大区', '西南大区']
            product_lines = ['智能终端', '家用电器', '云计算服务']
            start_date_2024 = datetime(2024, 1, 1)
            
            # 为了让趋势图好看点，我们按月生成
            for month in range(1, 13):
                # 每个月每个组合生成 20 条数据
                days_in_month = 28 # 简化处理
                for region in regions:
                    for pl in product_lines:
                        for _ in range(5):
                            day = random.randint(0, days_in_month - 1)
                            sale_date = datetime(2024, month, day + 1)
                            # 模拟趋势：年中高，两头低
                            base = 5000 + (math.sin(month / 1.5) * 2000)
                            sale_amount = base + random.uniform(-1000, 1000)
                            rsd_data.append((region, sale_amount, pl, sale_date.date()))
            
            cur.executemany("INSERT INTO regional_sales_distribution (region_name, sale_amount, product_line, sale_date) VALUES (%s, %s, %s, %s)", rsd_data)
            print(f"✅ 已注入 {len(rsd_data)} 条 regional_sales_distribution (2024) 数据。")

        print("🎉 2024 年数据准备就绪！")
        conn.close()
    except Exception as e:
        print(f"❌ 注入失败: {str(e)}")

if __name__ == "__main__":
    inject_2024_data()
