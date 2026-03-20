#!/usr/bin/env python3
"""
generate_demo_ts.py — 生成 frontend/src/services/demoData.ts
使用固定随机种子确保每次生成结果一致
运行: cd scripts && python generate_demo_ts.py
"""

import random
import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = 42
random.seed(SEED)

OUTPUT = Path(__file__).parent.parent / "frontend" / "src" / "services" / "demoData.ts"

# ── 城市坐标 ──────────────────────────────────────────────────────────────────
CITY_COORDS = {
    '北京':  ('北京', 39.9042, 116.4074),
    '上海':  ('上海', 31.2304, 121.4737),
    '广州':  ('广东', 23.1291, 113.2644),
    '深圳':  ('广东', 22.5431, 114.0579),
    '杭州':  ('浙江', 30.2741, 120.1551),
    '武汉':  ('湖北', 30.5928, 114.3055),
    '成都':  ('四川', 30.5728, 104.0668),
    '南京':  ('江苏', 32.0603, 118.7969),
    '西安':  ('陕西', 34.3416, 108.9398),
    '重庆':  ('重庆', 29.5630, 106.5516),
    '苏州':  ('江苏', 31.2990, 120.5853),
    '郑州':  ('河南', 34.7472, 113.6249),
}
CITIES = list(CITY_COORDS.keys())

CATEGORIES = ['Electronics', 'Clothing', 'Home', 'Sports', 'Food', 'Books', 'Toys', 'Beauty']
SEGMENTS   = ['Consumer', 'Corporate', 'Home Office']
PAYMENT    = ['Alipay', 'WeChat', 'Credit Card', 'Cash', 'Bank Transfer']
STATUSES   = ['Shipped', 'Delivered', 'Processing', 'Cancelled', 'Returned']
RETURN_REASONS = ['Defective', 'Wrong Item', 'Changed Mind', 'Better Price', 'Not as Described']

START_DATE = date(2024, 1, 1)
END_DATE   = date(2025, 12, 31)
TOTAL_DAYS = (END_DATE - START_DATE).days

def rand_date() -> str:
    return (START_DATE + timedelta(days=random.randint(0, TOTAL_DAYS))).isoformat()

def rand_date_after(iso: str) -> str:
    d = date.fromisoformat(iso)
    delta = (END_DATE - d).days
    if delta <= 0:
        return iso
    return (d + timedelta(days=random.randint(1, min(delta, 30)))).isoformat()

# ── products (50 rows) ────────────────────────────────────────────────────────
def make_products():
    cols = [
        {'name': 'product_id',       'sqliteType': 'INTEGER'},
        {'name': 'product_name',     'sqliteType': 'TEXT'},
        {'name': 'category',         'sqliteType': 'TEXT'},
        {'name': 'buy_price',        'sqliteType': 'REAL'},
        {'name': 'msrp',             'sqliteType': 'REAL'},
        {'name': 'quantity_in_stock','sqliteType': 'INTEGER'},
        {'name': 'tags',             'sqliteType': 'TEXT'},
        {'name': 'created_at',       'sqliteType': 'TEXT'},
    ]
    rows = []
    for i in range(1, 51):
        cat = random.choice(CATEGORIES)
        buy = round(random.uniform(20, 500), 2)
        msrp = round(buy * random.uniform(1.4, 2.5), 2)
        stock = random.randint(0, 500)
        tags = json.dumps(random.sample(['hot', 'new', 'sale', 'limited', 'popular'], k=random.randint(0, 2))) if random.random() > 0.3 else None
        rows.append([i, f'Prod_{cat}_{i}', cat, buy, msrp, stock, tags, rand_date()])
    return cols, rows

# ── customers (300 rows) ──────────────────────────────────────────────────────
def make_customers():
    cols = [
        {'name': 'customer_id',   'sqliteType': 'INTEGER'},
        {'name': 'customer_name', 'sqliteType': 'TEXT'},
        {'name': 'segment',       'sqliteType': 'TEXT'},
        {'name': 'city',          'sqliteType': 'TEXT'},
        {'name': 'province',      'sqliteType': 'TEXT'},
        {'name': 'email',         'sqliteType': 'TEXT'},
        {'name': 'phone',         'sqliteType': 'TEXT'},
        {'name': 'latitude',      'sqliteType': 'REAL'},
        {'name': 'longitude',     'sqliteType': 'REAL'},
    ]
    rows = []
    for i in range(1, 301):
        city = random.choice(CITIES)
        province, lat, lon = CITY_COORDS[city]
        # slight jitter
        lat  = round(lat  + random.uniform(-0.15, 0.15), 6)
        lon  = round(lon  + random.uniform(-0.15, 0.15), 6)
        seg  = random.choice(SEGMENTS)
        rows.append([
            i,
            f'Customer_{i}',
            seg,
            city,
            province,
            f'customer{i}@example.com',
            f'1{random.randint(30,99)}{random.randint(10000000,99999999)}',
            lat,
            lon,
        ])
    return cols, rows

# ── marketing_campaigns (3 rows) ──────────────────────────────────────────────
def make_campaigns():
    cols = [
        {'name': 'campaign_id',   'sqliteType': 'INTEGER'},
        {'name': 'campaign_name', 'sqliteType': 'TEXT'},
        {'name': 'start_date',    'sqliteType': 'TEXT'},
        {'name': 'end_date',      'sqliteType': 'TEXT'},
        {'name': 'budget',        'sqliteType': 'REAL'},
    ]
    rows = [
        [1, '双十一大促',   '2024-11-01', '2024-11-11', 500000.0],
        [2, '618年中大促',  '2025-06-01', '2025-06-18', 300000.0],
        [3, '春节特惠',     '2025-01-20', '2025-02-05', 200000.0],
    ]
    return cols, rows

# ── orders (3000 rows) ────────────────────────────────────────────────────────
def make_orders(n_customers=300, n_campaigns=3):
    cols = [
        {'name': 'order_id',       'sqliteType': 'INTEGER'},
        {'name': 'order_date',     'sqliteType': 'TEXT'},
        {'name': 'customer_id',    'sqliteType': 'INTEGER'},
        {'name': 'campaign_id',    'sqliteType': 'INTEGER'},
        {'name': 'status',         'sqliteType': 'TEXT'},
        {'name': 'shipping_cost',  'sqliteType': 'REAL'},
        {'name': 'payment_method', 'sqliteType': 'TEXT'},
    ]
    rows = []
    for i in range(1, 3001):
        cid = random.randint(1, n_customers)
        camp = random.randint(1, n_campaigns) if random.random() < 0.6 else None
        rows.append([
            i,
            rand_date(),
            cid,
            camp,
            random.choice(STATUSES),
            round(random.uniform(0, 50), 2),
            random.choice(PAYMENT),
        ])
    return cols, rows

# ── order_details (9000 rows) ─────────────────────────────────────────────────
def make_order_details(n_orders=3000, n_products=50):
    cols = [
        {'name': 'detail_id',      'sqliteType': 'INTEGER'},
        {'name': 'order_id',       'sqliteType': 'INTEGER'},
        {'name': 'product_id',     'sqliteType': 'INTEGER'},
        {'name': 'quantity_ordered','sqliteType': 'INTEGER'},
        {'name': 'price_each',     'sqliteType': 'REAL'},
        {'name': 'discount_amount','sqliteType': 'REAL'},
    ]
    rows = []
    detail_id = 1
    # 3 details per order on average, but random
    order_ids = list(range(1, n_orders + 1))
    random.shuffle(order_ids)
    # we want exactly 9000 rows — 3 per order
    for oid in order_ids:
        for _ in range(3):
            pid = random.randint(1, n_products)
            qty = random.randint(1, 10)
            price = round(random.uniform(20, 500), 2)
            disc  = round(price * random.uniform(0, 0.2), 2) if random.random() < 0.3 else 0.0
            rows.append([detail_id, oid, pid, qty, price, disc])
            detail_id += 1
    return cols, rows

# ── returns (90 rows) ─────────────────────────────────────────────────────────
def make_returns(orders_rows):
    cols = [
        {'name': 'return_id',     'sqliteType': 'INTEGER'},
        {'name': 'order_id',      'sqliteType': 'INTEGER'},
        {'name': 'product_id',    'sqliteType': 'INTEGER'},
        {'name': 'return_date',   'sqliteType': 'TEXT'},
        {'name': 'reason',        'sqliteType': 'TEXT'},
        {'name': 'refund_amount', 'sqliteType': 'REAL'},
    ]
    # pick 90 random orders
    sample_orders = random.sample(orders_rows, 90)
    rows = []
    for idx, order in enumerate(sample_orders, start=1):
        order_id, order_date = order[0], order[1]
        rows.append([
            idx,
            order_id,
            random.randint(1, 50),
            rand_date_after(order_date),
            random.choice(RETURN_REASONS),
            round(random.uniform(20, 500), 2),
        ])
    return cols, rows

# ── global_analysis tables ────────────────────────────────────────────────────

GA_START = date(2024, 1, 1)
GA_END   = date(2025, 12, 31)
GA_DAYS  = (GA_END - GA_START).days

def ga_rand_date() -> str:
    return (GA_START + timedelta(days=random.randint(0, GA_DAYS))).isoformat()

def make_ga_organizations():
    cols = [
        {'name': 'org_id',        'sqliteType': 'INTEGER'},
        {'name': 'org_name',      'sqliteType': 'TEXT'},
        {'name': 'region',        'sqliteType': 'TEXT'},
        {'name': 'currency',      'sqliteType': 'TEXT'},
        {'name': 'exchange_rate', 'sqliteType': 'REAL'},
    ]
    rows = [
        [1, 'Global_HQ',   'Global',      'USD', 1.0],
        [2, 'China_Region', 'Asia',        'CNY', 7.2],
        [3, 'EU_Region',    'Europe',      'EUR', 0.92],
        [4, 'APAC_Region',  'Asia Pacific','SGD', 1.35],
        [5, 'US_West',      'North America','USD', 1.0],
    ]
    return cols, rows

def make_ga_product_performance():
    cols = [
        {'name': 'product_id',          'sqliteType': 'INTEGER'},
        {'name': 'product_name',         'sqliteType': 'TEXT'},
        {'name': 'category',             'sqliteType': 'TEXT'},
        {'name': 'response_speed_score', 'sqliteType': 'REAL'},
        {'name': 'availability_score',   'sqliteType': 'REAL'},
        {'name': 'throughput_score',     'sqliteType': 'REAL'},
        {'name': 'stability_score',      'sqliteType': 'REAL'},
        {'name': 'error_rate_score',     'sqliteType': 'REAL'},
        {'name': 'satisfaction_score',   'sqliteType': 'REAL'},
        {'name': 'snapshot_date',        'sqliteType': 'TEXT'},
    ]
    products = [
        (1, '移动端 App',   '客户端'),
        (2, 'Web 平台',     '客户端'),
        (3, 'API 网关',     '服务端'),
        (4, '数据管道',     '基础设施'),
        (5, '推荐引擎',     '算法服务'),
        (6, '支付模块',     '服务端'),
        (7, '消息推送',     '基础设施'),
        (8, '搜索服务',     '算法服务'),
    ]
    rows = []
    snapshot_dates = ['2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01']
    for snap in snapshot_dates:
        for pid, pname, cat in products:
            rows.append([
                pid, pname, cat,
                round(random.uniform(70, 99), 2),
                round(random.uniform(85, 99), 2),
                round(random.uniform(55, 95), 2),
                round(random.uniform(80, 99), 2),
                round(random.uniform(75, 99), 2),
                round(random.uniform(70, 95), 2),
                snap,
            ])
    return cols, rows

def make_ga_daily_metrics():
    cols = [
        {'name': 'date',              'sqliteType': 'TEXT'},
        {'name': 'revenue',           'sqliteType': 'REAL'},
        {'name': 'new_users',         'sqliteType': 'INTEGER'},
        {'name': 'active_users',      'sqliteType': 'INTEGER'},
        {'name': 'server_latency_ms', 'sqliteType': 'INTEGER'},
    ]
    rows = []
    for i in range(500):
        d = GA_START + timedelta(days=i)
        base_rev = 10000 + math.sin(i / 15) * 3000
        if i % 50 == 0:
            base_rev *= random.choice([0.1, 5.0])
        rows.append([
            d.isoformat(),
            round(base_rev, 2),
            random.randint(100, 1000),
            random.randint(5000, 20000),
            random.randint(20, 500),
        ])
    return cols, rows

def make_ga_user_activity_heatmap():
    cols = [
        {'name': 'day_of_week', 'sqliteType': 'INTEGER'},
        {'name': 'hour_of_day', 'sqliteType': 'INTEGER'},
        {'name': 'user_count',  'sqliteType': 'INTEGER'},
        {'name': 'cpu_load',    'sqliteType': 'REAL'},
    ]
    rows = []
    for day in range(7):
        for hour in range(24):
            val = int(500 * math.exp(-((hour - 18) ** 2) / 32) + 100)
            if day >= 5:
                val = int(val * 1.4)
            load = round((val / 1000) * 80 + random.uniform(0, 10), 2)
            rows.append([day, hour, val, load])
    return cols, rows

def make_ga_sales_forecast():
    cols = [
        {'name': 'forecast_date',    'sqliteType': 'TEXT'},
        {'name': 'actual_value',     'sqliteType': 'REAL'},
        {'name': 'predicted_value',  'sqliteType': 'REAL'},
        {'name': 'upper_bound',      'sqliteType': 'REAL'},
        {'name': 'lower_bound',      'sqliteType': 'REAL'},
    ]
    rows = []
    base = date(2026, 1, 1)
    for i in range(90):
        d = base + timedelta(days=i)
        pred = 10000 + math.sin(i / 10) * 1500 + i * 30
        actual = pred * random.uniform(0.9, 1.1) if i < 30 else None
        rows.append([
            d.isoformat(),
            round(actual, 2) if actual else None,
            round(pred, 2),
            round(pred * 1.1, 2),
            round(pred * 0.9, 2),
        ])
    return cols, rows

def make_ga_user_behavior_logs():
    cols = [
        {'name': 'log_id',     'sqliteType': 'INTEGER'},
        {'name': 'user_id',    'sqliteType': 'INTEGER'},
        {'name': 'event_time', 'sqliteType': 'TEXT'},
        {'name': 'event_type', 'sqliteType': 'TEXT'},
        {'name': 'org_id',     'sqliteType': 'INTEGER'},
        {'name': 'product_id', 'sqliteType': 'INTEGER'},
    ]
    event_types = ['click', 'view', 'purchase', 'share', 'logout', 'search']
    rows = []
    log_start = datetime(2026, 1, 1)
    log_end   = datetime(2026, 3, 31)
    log_days  = (log_end - log_start).days * 24 * 3600
    for i in range(1, 1001):
        offset_sec = random.randint(0, log_days)
        evt_time = (log_start + timedelta(seconds=offset_sec)).strftime('%Y-%m-%dT%H:%M:%S')
        rows.append([i, random.randint(1, 500), evt_time, random.choice(event_types),
                     random.randint(1, 5), random.randint(1, 8)])
    return cols, rows

def make_ga_ad_attribution():
    cols = [
        {'name': 'touchpoint_id',     'sqliteType': 'INTEGER'},
        {'name': 'user_id',           'sqliteType': 'INTEGER'},
        {'name': 'channel',           'sqliteType': 'TEXT'},
        {'name': 'cost',              'sqliteType': 'REAL'},
        {'name': 'is_converted',      'sqliteType': 'INTEGER'},
        {'name': 'revenue_generated', 'sqliteType': 'REAL'},
        {'name': 'org_id',            'sqliteType': 'INTEGER'},
        {'name': 'product_id',        'sqliteType': 'INTEGER'},
        {'name': 'touchpoint_date',   'sqliteType': 'TEXT'},
    ]
    channel_products = {
        'TikTok': [1, 2], 'Google': [3, 4], 'Facebook': [5, 6], 'Direct': [7, 8]
    }
    channels = [('TikTok', 0.5), ('Google', 1.2), ('Facebook', 0.8), ('Direct', 0.0)]
    rows = []
    for i in range(1, 1001):
        ch, cost_base = random.choice(channels)
        cost = round(random.uniform(5, 50) * cost_base, 2)
        conv = 1 if random.random() < (0.1 * cost_base) else 0
        rev  = round(random.uniform(100, 1000), 2) if conv else 0.0
        org_id = (i % 5) + 1
        pids = channel_products[ch]
        product_id = pids[i % len(pids)]
        tp_date = ga_rand_date()
        rows.append([i, i % 500, ch, cost, conv, rev, org_id, product_id, tp_date])
    return cols, rows

# ── Serialize to TypeScript ───────────────────────────────────────────────────
def ts_value(v) -> str:
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    # string — JSON-encode to safely escape quotes/newlines
    return json.dumps(v, ensure_ascii=False)

def ts_col_defs(cols) -> str:
    parts = [f'{{ name: {json.dumps(c["name"])}, sqliteType: {json.dumps(c["sqliteType"])} }}' for c in cols]
    return '[\n    ' + ',\n    '.join(parts) + '\n  ]'

def ts_row(row) -> str:
    return '[' + ', '.join(ts_value(v) for v in row) + ']'

def ts_rows(rows) -> str:
    return '[\n    ' + ',\n    '.join(ts_row(r) for r in rows) + '\n  ]'

def main():
    print("Generating demo data…")
    p_cols, p_rows = make_products()
    c_cols, c_rows = make_customers()
    m_cols, m_rows = make_campaigns()
    o_cols, o_rows = make_orders()
    d_cols, d_rows = make_order_details()
    r_cols, r_rows = make_returns(o_rows)

    tables = {
        'products':            (p_cols, p_rows),
        'customers':           (c_cols, c_rows),
        'marketing_campaigns': (m_cols, m_rows),
        'orders':              (o_cols, o_rows),
        'order_details':       (d_cols, d_rows),
        'returns':             (r_cols, r_rows),
    }

    # global_analysis demo tables
    ga_tables = {
        'organizations':        make_ga_organizations(),
        'product_performance':  make_ga_product_performance(),
        'daily_metrics':        make_ga_daily_metrics(),
        'user_activity_heatmap':make_ga_user_activity_heatmap(),
        'sales_forecast':       make_ga_sales_forecast(),
        'user_behavior_logs':   make_ga_user_behavior_logs(),
        'ad_attribution':       make_ga_ad_attribution(),
    }

    total = sum(len(rows) for _, rows in tables.values())
    ga_total = sum(len(rows) for _, rows in ga_tables.values())
    print(f"  Classic Business rows: {total}")
    print(f"  Global Analysis rows:  {ga_total}")

    lines = [
        '// AUTO-GENERATED by scripts/generate_demo_ts.py — DO NOT EDIT',
        '// Run: cd scripts && python generate_demo_ts.py',
        '',
        "export type ColDef = { name: string; sqliteType: string }",
        '',
        '// ── demo_classic_business ────────────────────────────────────────────',
        'export const DemoTables: Record<string, ColDef[]> = {',
    ]
    for tbl, (cols, _) in tables.items():
        lines.append(f'  {tbl}: {ts_col_defs(cols)},')
    lines += ['}', '', 'export const DemoRows: Record<string, (string | number | null)[][]> = {']
    for tbl, (_, rows) in tables.items():
        lines.append(f'  {tbl}: {ts_rows(rows)},')
    lines += ['}', '']

    # global_analysis exports
    lines += [
        '// ── global_analysis (离线演示，含 touchpoint_date) ───────────────────',
        'export const GlobalAnalysisTables: Record<string, ColDef[]> = {',
    ]
    for tbl, (cols, _) in ga_tables.items():
        lines.append(f'  {tbl}: {ts_col_defs(cols)},')
    lines += ['}', '', 'export const GlobalAnalysisRows: Record<string, (string | number | null)[][]> = {']
    for tbl, (_, rows) in ga_tables.items():
        lines.append(f'  {tbl}: {ts_rows(rows)},')
    lines += ['}', '']

    content = '\n'.join(lines)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(content, encoding='utf-8')
    print(f"  Written → {OUTPUT}")
    print("  [Classic Business]")
    for tbl, (_, rows) in tables.items():
        print(f"    {tbl}: {len(rows)} rows")
    print("  [Global Analysis]")
    for tbl, (_, rows) in ga_tables.items():
        print(f"    {tbl}: {len(rows)} rows")

if __name__ == '__main__':
    main()
