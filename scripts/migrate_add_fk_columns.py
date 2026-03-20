"""
migrate_add_fk_columns.py — 向 global_analysis 库增加外键关联列

幂等操作：会检测列是否已存在，重复执行安全。

新增列：
  ad_attribution    → org_id INT, product_id INT
  user_behavior_logs → org_id INT, product_id INT

关联关系：
  *.org_id     → organizations.org_id     (1–5)
  *.product_id → product_performance.product_id (1–8)
"""

import os
import pymysql

ORGS_COUNT = 5
PRODUCTS_COUNT = 8

# 渠道到产品的映射（使广告数据更有业务意义）
CHANNEL_PRODUCT_MAP = {
    'TikTok':    [1, 2],   # 移动端App、Web控制台
    'Google':    [3, 4],   # API网关、推荐引擎
    'Facebook':  [5, 6],   # 搜索服务、支付模块
    'Direct':    [7, 8],   # 数据分析平台、消息推送服务
}

# 行为事件到产品的映射
EVENT_PRODUCT_MAP = {
    'click':     [1, 2, 3],
    'view':      [1, 2, 4, 7],
    'purchase':  [5, 6],
    'search':    [4, 5],
    'signup':    [1, 8],
}


def column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column)
    )
    return cur.fetchone()[0] > 0


def migrate():
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

    # ── ad_attribution ──────────────────────────────────────────────────────────
    print("🔧 处理 ad_attribution ...")

    if not column_exists(cur, "ad_attribution", "touchpoint_date"):
        cur.execute("ALTER TABLE ad_attribution ADD COLUMN touchpoint_date DATE COMMENT '广告触点日期，用于按季度/月度分析'")
        # 用随机日期回填 2024-01 ~ 2025-12
        cur.execute("""
            UPDATE ad_attribution
               SET touchpoint_date = DATE_ADD('2024-01-01', INTERVAL FLOOR(RAND() * 730) DAY)
             WHERE touchpoint_date IS NULL
        """)
        print("  ✅ touchpoint_date 列已添加并填充")
    else:
        print("  ⏭  touchpoint_date 列已存在，跳过")

    if not column_exists(cur, "ad_attribution", "org_id"):
        cur.execute("ALTER TABLE ad_attribution ADD COLUMN org_id INT COMMENT '所属组织 → organizations.org_id'")
        # 同一用户始终属于同一组织（user_id mod 5 + 1）
        cur.execute("UPDATE ad_attribution SET org_id = (user_id MOD %s) + 1", (ORGS_COUNT,))
        print("  ✅ org_id 列已添加并填充")
    else:
        print("  ⏭  org_id 列已存在，跳过")

    if not column_exists(cur, "ad_attribution", "product_id"):
        cur.execute("ALTER TABLE ad_attribution ADD COLUMN product_id INT COMMENT '推广产品 → product_performance.product_id'")
        # 按渠道分配产品，每个渠道对应 2 款产品，轮流分配
        for channel, pids in CHANNEL_PRODUCT_MAP.items():
            cur.execute(
                """
                UPDATE ad_attribution
                   SET product_id = CASE WHEN touchpoint_id MOD 2 = 0 THEN %s ELSE %s END
                 WHERE channel = %s
                """,
                (pids[0], pids[1], channel)
            )
        # 兜底：未匹配渠道的行随机分配
        cur.execute(
            "UPDATE ad_attribution SET product_id = (touchpoint_id MOD %s) + 1 WHERE product_id IS NULL",
            (PRODUCTS_COUNT,)
        )
        print("  ✅ product_id 列已添加并填充")
    else:
        print("  ⏭  product_id 列已存在，跳过")

    # ── user_behavior_logs ──────────────────────────────────────────────────────
    print("🔧 处理 user_behavior_logs ...")

    if not column_exists(cur, "user_behavior_logs", "org_id"):
        cur.execute("ALTER TABLE user_behavior_logs ADD COLUMN org_id INT COMMENT '用户所属组织 → organizations.org_id'")
        cur.execute("UPDATE user_behavior_logs SET org_id = (user_id MOD %s) + 1", (ORGS_COUNT,))
        print("  ✅ org_id 列已添加并填充")
    else:
        print("  ⏭  org_id 列已存在，跳过")

    if not column_exists(cur, "user_behavior_logs", "product_id"):
        cur.execute("ALTER TABLE user_behavior_logs ADD COLUMN product_id INT COMMENT '操作的产品 → product_performance.product_id'")
        for event, pids in EVENT_PRODUCT_MAP.items():
            placeholders = ",".join(["%s"] * len(pids))
            # 在该事件类型的 pids 中轮转
            cur.execute(
                f"""
                UPDATE user_behavior_logs
                   SET product_id = ELT((log_id MOD {len(pids)}) + 1, {placeholders})
                 WHERE event_type = %s
                """,
                (*pids, event)
            )
        # 兜底
        cur.execute(
            "UPDATE user_behavior_logs SET product_id = (log_id MOD %s) + 1 WHERE product_id IS NULL",
            (PRODUCTS_COUNT,)
        )
        print("  ✅ product_id 列已添加并填充")
    else:
        print("  ⏭  product_id 列已存在，跳过")

    # ── 索引 ────────────────────────────────────────────────────────────────────
    print("🔧 创建索引 ...")
    for idx_sql in [
        "CREATE INDEX idx_ad_org ON ad_attribution(org_id)",
        "CREATE INDEX idx_ad_product ON ad_attribution(product_id)",
        "CREATE INDEX idx_logs_org ON user_behavior_logs(org_id)",
        "CREATE INDEX idx_logs_product ON user_behavior_logs(product_id)",
    ]:
        try:
            cur.execute(idx_sql)
        except pymysql.err.OperationalError:
            pass  # 索引已存在

    # ── 验证 ────────────────────────────────────────────────────────────────────
    print("\n📊 验证结果：")
    cur.execute("SELECT COUNT(*), MIN(org_id), MAX(org_id), MIN(product_id), MAX(product_id) FROM ad_attribution")
    row = cur.fetchone()
    print(f"  ad_attribution      : {row[0]} 行, org_id [{row[1]}–{row[2]}], product_id [{row[3]}–{row[4]}]")

    cur.execute("SELECT COUNT(*), MIN(org_id), MAX(org_id), MIN(product_id), MAX(product_id) FROM user_behavior_logs")
    row = cur.fetchone()
    print(f"  user_behavior_logs  : {row[0]} 行, org_id [{row[1]}–{row[2]}], product_id [{row[3]}–{row[4]}]")

    print("\n✅ 迁移完成！现在可以重新同步手机数据。")
    conn.close()


if __name__ == "__main__":
    migrate()
