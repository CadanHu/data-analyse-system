"""
add_global_org_retention.py — 向 global_analysis 补充两张表

1. organizations  (5 行)       — 组织/地区维度表
2. user_behavior_logs (约 8万行) — 含 13 个月行为数据，支持留存队列分析

留存曲线（模拟真实产品）：
  Month 0 (首月)  : 100% (所有新用户)
  Month 1         : ~65%
  Month 2         : ~52%
  Month 3         : ~44%
  Month 4–11      : 缓降至 ~28%

幂等：用 IF NOT EXISTS + TRUNCATE-on-conflict 策略。
"""
import os, random
from datetime import date, timedelta
import pymysql

SEED = 2025
random.seed(SEED)

ORGS = [
    (1, 'Global_HQ',   'Global',        'USD', 7.2000),
    (2, '分公司_华东', 'East_China',     'CNY', 1.0000),
    (3, '分公司_华南', 'South_China',    'CNY', 1.0000),
    (4, '分公司_北美', 'North_America',  'USD', 7.2000),
    (5, '分公司_欧洲', 'Europe',         'EUR', 7.8500),
]
ORG_IDS = [o[0] for o in ORGS]

PRODUCTS_COUNT = 8
EVENT_TYPES = ['click', 'view', 'search', 'purchase', 'signup']

# 每月留存率（相对上月，第0个月=首月注册）
MONTHLY_RETENTION = [1.0, 0.65, 0.80, 0.85, 0.87, 0.89, 0.90, 0.91, 0.91, 0.92, 0.92, 0.93, 0.93]
# 转换为绝对留存（相对首月）
def abs_retention(n: int) -> float:
    r = 1.0
    for i in range(1, n + 1):
        r *= MONTHLY_RETENTION[min(i, len(MONTHLY_RETENTION) - 1)]
    return r


def first_of_month(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, n: int) -> date:
    m = d.month + n
    y = d.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1)


def rand_events_in_month(user_id: int, month_start: date, n_events: int,
                         org_id: int, product_id: int) -> list:
    days_in_month = (add_months(month_start, 1) - month_start).days
    rows = []
    for _ in range(n_events):
        day   = random.randint(0, days_in_month - 1)
        hour  = random.randint(0, 23)
        minute= random.randint(0, 59)
        dt    = f"{month_start + timedelta(days=day)} {hour:02d}:{minute:02d}:00"
        event = random.choice(EVENT_TYPES)
        rows.append((user_id, dt, event, org_id, product_id))
    return rows


def generate_retention_logs(n_users_per_cohort: int = 200,
                             n_cohort_months: int = 13,
                             follow_months: int = 12) -> list:
    """
    生成留存数据：
      - n_cohort_months 个月的新用户队列
      - 每个用户在后续月份按留存率决定是否活跃
    """
    today = date.today().replace(day=1)
    start_month = add_months(today, -(n_cohort_months - 1))

    all_rows: list = []
    user_id_counter = 10001  # 避免与已有 user_id 冲突

    for cohort_idx in range(n_cohort_months):
        cohort_month = add_months(start_month, cohort_idx)
        cohort_users = []
        for _ in range(n_users_per_cohort):
            uid = user_id_counter
            user_id_counter += 1
            org_id     = (uid % len(ORG_IDS)) + 1
            product_id = (uid % PRODUCTS_COUNT) + 1
            cohort_users.append((uid, org_id, product_id))

        # 每个用户在各月生成日志
        for uid, org_id, product_id in cohort_users:
            for month_offset in range(follow_months + 1):
                target_month = add_months(cohort_month, month_offset)
                if target_month > today:
                    break
                # 按留存率决定该月是否活跃
                if random.random() > abs_retention(month_offset):
                    continue
                n_events = random.randint(1, 6)
                all_rows.extend(rand_events_in_month(uid, target_month, n_events, org_id, product_id))

    random.shuffle(all_rows)
    return all_rows


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

    # ── organizations ────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS organizations (
        org_id        INT PRIMARY KEY,
        org_name      VARCHAR(100),
        region        VARCHAR(50),
        currency      VARCHAR(10),
        exchange_rate DECIMAL(10,4)
    ) CHARACTER SET utf8mb4
    """)
    # 幂等：有数据就跳过
    cur.execute("SELECT COUNT(*) FROM organizations")
    if cur.fetchone()[0] == 0:
        cur.executemany(
            "INSERT INTO organizations (org_id, org_name, region, currency, exchange_rate) VALUES (%s,%s,%s,%s,%s)",
            ORGS
        )
        print(f"✅ organizations: 写入 {len(ORGS)} 行")
    else:
        print("⏭  organizations: 已有数据，跳过")

    # ── user_behavior_logs ───────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_behavior_logs (
        log_id     INT PRIMARY KEY AUTO_INCREMENT,
        user_id    INT          NOT NULL,
        event_time DATETIME     NOT NULL,
        event_type VARCHAR(50)  NOT NULL,
        org_id     INT          COMMENT '用户所属组织 → organizations.org_id',
        product_id INT          COMMENT '操作的产品 → product_performance.product_id'
    ) CHARACTER SET utf8mb4
    """)
    cur.execute("SELECT COUNT(*) FROM user_behavior_logs")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"⏭  user_behavior_logs: 已有 {existing} 行，跳过生成")
    else:
        print("⏳ 正在生成留存分析数据（13 个月队列，约 8 万行）...")
        rows = generate_retention_logs(n_users_per_cohort=200, n_cohort_months=13, follow_months=12)
        BATCH = 2000
        inserted = 0
        for i in range(0, len(rows), BATCH):
            batch = rows[i:i+BATCH]
            cur.executemany(
                "INSERT INTO user_behavior_logs (user_id, event_time, event_type, org_id, product_id) VALUES (%s,%s,%s,%s,%s)",
                batch
            )
            inserted += len(batch)
        print(f"✅ user_behavior_logs: 写入 {inserted:,} 行")

        # 索引
        for idx in [
            "CREATE INDEX idx_logs_user_time ON user_behavior_logs(user_id, event_time)",
            "CREATE INDEX idx_logs_org ON user_behavior_logs(org_id)",
            "CREATE INDEX idx_logs_product ON user_behavior_logs(product_id)",
        ]:
            try:
                cur.execute(idx)
            except pymysql.err.OperationalError:
                pass

    # ── 验证 ─────────────────────────────────────────────────────────────────────
    cur.execute("SELECT MIN(event_time), MAX(event_time), COUNT(DISTINCT user_id) FROM user_behavior_logs")
    mn, mx, uniq = cur.fetchone()
    print(f"\n📊 user_behavior_logs: 时间范围 {mn} ~ {mx}，{uniq} 个不同用户")
    print("✅ 完成！现在可重新同步手机数据。")
    conn.close()


if __name__ == "__main__":
    migrate()
