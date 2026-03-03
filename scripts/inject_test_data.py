import pymysql
import random

def inject():
    try:
        conn = pymysql.connect(
            host='localhost', user='root', password='root', port=3306,
            charset='utf8mb4', autocommit=True
        )
        cur = conn.cursor()
        cur.execute("USE global_analysis")

        # 1. 甘特图数据 (Table: gantt_projects)
        cur.execute("DROP TABLE IF EXISTS gantt_projects")
        cur.execute("""
        CREATE TABLE gantt_projects (
            task_id INT PRIMARY KEY AUTO_INCREMENT,
            project_name VARCHAR(100),
            task_name VARCHAR(100),
            start_date DATE,
            end_date DATE,
            progress_pct INT,
            owner VARCHAR(50),
            priority VARCHAR(20)
        )""")
        gantt_data = [
            ('2025系统升级', '需求调研与架构设计', '2025-01-01', '2025-02-15', 100, '张总工', 'High'),
            ('2025系统升级', '数据库迁移(MySQL 8.0)', '2025-02-10', '2025-03-20', 85, '李架构', 'High'),
            ('2025系统升级', '后端 API 模块开发', '2025-03-01', '2025-05-15', 60, '王开发', 'Medium'),
            ('2025系统升级', '前端响应式 UI 重构', '2025-03-15', '2025-05-30', 45, '赵视觉', 'Medium'),
            ('2025系统升级', 'AI 推理模型集成', '2025-04-20', '2025-06-10', 20, '孙算法', 'High'),
            ('2025系统升级', '全路径压力测试', '2025-06-01', '2025-07-15', 0, '周测试', 'Low'),
            ('2025系统升级', '正式环境部署上线', '2025-07-10', '2025-07-30', 0, '运维组', 'High')
        ]
        cur.executemany("INSERT INTO gantt_projects (project_name, task_name, start_date, end_date, progress_pct, owner, priority) VALUES (%s, %s, %s, %s, %s, %s, %s)", gantt_data)

        # 1b. 进阶项目任务数据 (Table: project_tasks)
        cur.execute("DROP TABLE IF EXISTS project_tasks")
        cur.execute("""
        CREATE TABLE project_tasks (
            task_id INT PRIMARY KEY AUTO_INCREMENT,
            task_name VARCHAR(100),
            start_date DATE,
            end_date DATE,
            progress INT
        )""")
        tasks = [
            # 项目 A：电商系统升级
            ('A-需求分析', '2025-01-01', '2025-01-10', 100),
            ('A-架构设计', '2025-01-11', '2025-01-20', 100),
            ('A-UI/UX设计', '2025-01-15', '2025-01-30', 90),
            ('A-前端开发-PC端', '2025-02-01', '2025-03-10', 60),
            ('A-前端开发-移动端', '2025-02-05', '2025-03-15', 45),
            ('A-后端接口开发', '2025-02-01', '2025-03-20', 75),
            ('A-数据库优化', '2025-03-01', '2025-03-10', 100),
            ('A-系统集成测试', '2025-03-21', '2025-04-05', 20),
            ('A-安全漏洞扫描', '2025-04-01', '2025-04-07', 0),
            ('A-用户验收测试(UAT)', '2025-04-08', '2025-04-20', 0),
            ('A-正式上线准备', '2025-04-21', '2025-04-30', 0),
            # 项目 B：AI 分析插件开发
            ('B-算法预研', '2025-02-10', '2025-02-28', 100),
            ('B-模型训练', '2025-03-01', '2025-03-20', 80),
            ('B-API封装', '2025-03-15', '2025-03-25', 30),
            ('B-前端集成', '2025-03-20', '2025-04-05', 10),
            ('B-性能压力测试', '2025-04-06', '2025-04-15', 0)
        ]
        cur.executemany("INSERT INTO project_tasks (task_name, start_date, end_date, progress) VALUES (%s, %s, %s, %s)", tasks)

        # 2. 桑基图数据 (Table: sankey_traffic)
        cur.execute("DROP TABLE IF EXISTS sankey_traffic")
        cur.execute("""
        CREATE TABLE sankey_traffic (
            id INT PRIMARY KEY AUTO_INCREMENT,
            source_node VARCHAR(50),
            target_node VARCHAR(50),
            flow_value DECIMAL(12, 2)
        )""")
        sankey_data = [
            ('搜索引擎', '系统首页', 5000.00),
            ('社交媒体', '系统首页', 3000.00),
            ('外部广告', '系统首页', 2000.00),
            ('系统首页', '产品详情页', 6500.00),
            ('系统首页', '直接流失', 3500.00),
            ('产品详情页', '加入购物车', 2800.00),
            ('产品详情页', '跳出离开', 3700.00),
            ('加入购物车', '支付页面', 1500.00),
            ('加入购物车', '犹豫流失', 1300.00),
            ('支付页面', '支付成功', 1200.00),
            ('支付页面', '支付失败', 300.00)
        ]
        cur.executemany("INSERT INTO sankey_traffic (source_node, target_node, flow_value) VALUES (%s, %s, %s)", sankey_data)

        # 3. 箱线图数据 (Table: regional_sales_distribution)
        # 注意：此处为 inject_test_data 的默认部分，inject_2024_data 会补充 2024 数据
        cur.execute("DROP TABLE IF EXISTS regional_sales_distribution")
        cur.execute("""
        CREATE TABLE regional_sales_distribution (
            record_id INT PRIMARY KEY AUTO_INCREMENT,
            region_name VARCHAR(50),
            sale_amount DECIMAL(10, 2),
            product_line VARCHAR(50),
            sale_date DATE
        )""")
        for i in range(30):
            cur.execute("INSERT INTO regional_sales_distribution (region_name, sale_amount, product_line, sale_date) VALUES ('华东大区', %s, '智能终端', '2025-03-01')", (5000 + random.random() * 2000))
            cur.execute("INSERT INTO regional_sales_distribution (region_name, sale_amount, product_line, sale_date) VALUES ('华南大区', %s, '智能终端', '2025-03-01')", (2000 + random.random() * 8000))
            cur.execute("INSERT INTO regional_sales_distribution (region_name, sale_amount, product_line, sale_date) VALUES ('华北大区', %s, '智能终端', '2025-03-01')", (1000 + random.random() * 3000))
            cur.execute("INSERT INTO regional_sales_distribution (region_name, sale_amount, product_line, sale_date) VALUES ('西南大区', %s, '智能终端', '2025-03-01')", (3000 + random.random() * 1500))

        # 4. 地理地图数据
        cur.execute("DROP TABLE IF EXISTS geo_market_data")
        cur.execute("""
        CREATE TABLE geo_market_data (
            province_name VARCHAR(50) PRIMARY KEY,
            iso_code VARCHAR(10),
            latitude DECIMAL(10, 6),
            longitude DECIMAL(10, 6),
            active_users INT,
            total_revenue DECIMAL(15, 2)
        )""")
        geo_data = [
            ('广东', 'CN-GD', 23.1291, 113.2644, 85000, 12500000.00),
            ('上海', 'CN-SH', 31.2304, 121.4737, 62000, 18900000.00),
            ('北京', 'CN-BJ', 39.9042, 116.4074, 58000, 15600000.00),
            ('浙江', 'CN-ZJ', 30.2741, 120.1551, 45000, 9800000.00),
            ('四川', 'CN-SC', 30.5728, 104.0668, 32000, 4500000.00),
            ('湖北', 'CN-HB', 30.5928, 114.3055, 28000, 3200000.00)
        ]
        cur.executemany("INSERT INTO geo_market_data VALUES (%s, %s, %s, %s, %s, %s)", geo_data)

        # 5. 散点气泡图数据
        cur.execute("DROP TABLE IF EXISTS marketing_bubbles")
        cur.execute("""
        CREATE TABLE marketing_bubbles (
            campaign_id INT PRIMARY KEY AUTO_INCREMENT,
            product_line VARCHAR(50),
            ad_spend DECIMAL(12, 2),
            roi DECIMAL(5, 2),
            conversions INT
        )""")
        bubble_data = [
            ('消费电子', 5000.00, 5.2, 260),
            ('消费电子', 12000.00, 4.8, 580),
            ('消费电子', 55000.00, 3.5, 1900),
            ('消费电子', 120000.00, 2.8, 4200),
            ('高端服装', 3000.00, 8.1, 90),
            ('高端服装', 8000.00, 6.5, 480),
            ('高端服装', 25000.00, 4.2, 1050),
            ('高端服装', 60000.00, 3.9, 2340),
            ('母婴用品', 2000.00, 3.2, 60),
            ('母婴用品', 15000.00, 3.4, 480),
            ('母婴用品', 45000.00, 3.3, 1500)
        ]
        cur.executemany("INSERT INTO marketing_bubbles (product_line, ad_spend, roi, conversions) VALUES (%s, %s, %s, %s)", bubble_data)

        print("✅ [架构师] 6组商业分析测试数据已成功注入 global_analysis 数据库。")
        conn.close()
    except Exception as e:
        print(f"❌ 注入失败: {str(e)}")

if __name__ == "__main__":
    inject()
