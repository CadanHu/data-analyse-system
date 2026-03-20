"""
add_product_performance.py — 向 global_analysis 库追加产品多维性能表

不删库，幂等操作（IF NOT EXISTS + TRUNCATE 重建数据）。
雷达图维度：响应速度、可用性、吞吐量、稳定性、错误率（越低越好→倒置为得分）、用户满意度
"""

import os
import pymysql
import random

PRODUCTS = [
    # (product_name, category, base_scores: response, availability, throughput, stability, error_score, satisfaction)
    ("移动端 App",      "客户端",  88, 99, 72, 91, 95, 87),
    ("Web 控制台",      "客户端",  92, 98, 85, 89, 93, 90),
    ("API 网关",        "基础设施", 95, 99, 96, 97, 91, 85),
    ("推荐引擎",        "算法服务", 78, 95, 88, 82, 88, 92),
    ("搜索服务",        "算法服务", 90, 97, 93, 94, 96, 88),
    ("支付模块",        "交易链路", 85, 99, 70, 98, 99, 94),
    ("数据分析平台",    "数据服务", 76, 96, 89, 87, 90, 89),
    ("消息推送服务",    "基础设施", 82, 98, 91, 90, 94, 83),
]

DIMENSIONS = [
    "response_speed_score",   # 响应速度 (ms 倒置为0-100分)
    "availability_score",     # 可用性 %
    "throughput_score",       # 吞吐量得分
    "stability_score",        # 稳定性
    "error_rate_score",       # 错误率倒置得分 (100 - error_rate%)
    "satisfaction_score",     # 用户满意度
]


def add_product_performance():
    conn = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "root"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        database="global_analysis",
        charset="utf8mb4",
        autocommit=True,
    )
    cur = conn.cursor()

    # 1. 建表（幂等）
    cur.execute("""
    CREATE TABLE IF NOT EXISTS product_performance (
        product_id            INT PRIMARY KEY AUTO_INCREMENT,
        product_name          VARCHAR(64)    NOT NULL,
        category              VARCHAR(32)    NOT NULL,
        response_speed_score  DECIMAL(5,2)   COMMENT '响应速度得分 0-100（越高越快）',
        availability_score    DECIMAL(5,2)   COMMENT '可用性得分 0-100',
        throughput_score      DECIMAL(5,2)   COMMENT '吞吐量得分 0-100',
        stability_score       DECIMAL(5,2)   COMMENT '稳定性得分 0-100',
        error_rate_score      DECIMAL(5,2)   COMMENT '错误率倒置得分 100-错误率%',
        satisfaction_score    DECIMAL(5,2)   COMMENT '用户满意度 0-100',
        snapshot_date         DATE           NOT NULL COMMENT '快照日期'
    ) CHARACTER SET utf8mb4
    """)
    print("✅ 表 product_performance 已确保存在")

    # 2. 清空旧数据，重新插入（幂等）
    cur.execute("TRUNCATE TABLE product_performance")

    rows = []
    from datetime import date, timedelta

    # 生成最近 6 个月的月度快照（用于趋势分析）
    today = date.today()
    for month_offset in range(5, -1, -1):
        snap_date = (today.replace(day=1) - timedelta(days=month_offset * 28)).replace(day=1)
        for pid, (name, cat, rs, av, th, st, er, sa) in enumerate(PRODUCTS, start=1):
            # 每月加随机波动 ±5，模拟真实波动
            def jitter(base, lo=0, hi=100):
                return round(min(hi, max(lo, base + random.uniform(-5, 5))), 2)

            rows.append((
                name, cat,
                jitter(rs), jitter(av, 90, 100), jitter(th),
                jitter(st), jitter(er, 80, 100), jitter(sa),
                snap_date,
            ))

    cur.executemany("""
        INSERT INTO product_performance
          (product_name, category,
           response_speed_score, availability_score, throughput_score,
           stability_score, error_rate_score, satisfaction_score,
           snapshot_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, rows)

    print(f"✅ 已写入 {len(rows)} 条产品性能记录（{len(PRODUCTS)} 个产品 × 6 个月快照）")
    print()
    print("📊 可用雷达图查询示例：")
    print("   SELECT product_name, response_speed_score, availability_score,")
    print("          throughput_score, stability_score, error_rate_score, satisfaction_score")
    print("   FROM product_performance")
    print("   WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM product_performance);")

    conn.close()


if __name__ == "__main__":
    add_product_performance()
