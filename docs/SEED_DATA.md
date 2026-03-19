# 仿真数据库说明 (Seed Data Guide)

> 最后更新：2026-03-19
> 适用分支：`main` / `feature/offline-local-sync`

系统通过 `scripts/setup_all_data.py` 在首次 Docker 启动时自动生成全部仿真数据，无需手动操作。

---

## 一、执行流程

```
docker-compose up
  └─ db-seed 容器
       └─ setup_all_data.py（任一脚本失败即中止）
            ├─ init_classic_business.py      # classic_business 库基础数据
            ├─ init_global_analysis.py       # global_analysis 库基础数据
            ├─ inject_test_data.py           # global_analysis 专项图表数据
            ├─ inject_2024_data.py           # global_analysis 历史销售分布
            ├─ upgrade_to_enterprise_db.py   # classic_business 企业级扩展
            ├─ ultimate_db_optimization.py   # 各库补充优化表
            ├─ full_db_enterprise_sync.py    # 各库统一补齐 + PostgreSQL
            ├─ inject_2025_2026_data.py      # classic_business 近期订单 + 经纬度
            └─ seed_test_user.py             # 创建默认登录账号
```

**预计耗时**：3～8 分钟（取决于机器性能）

**默认账号**：
- 邮箱：`demo@example.com`
- 密码：`password123`

---

## 二、数据库总览

系统共维护 4 个数据库，对应 `config.py` 中的 4 个连接 key：

| config key | 数据库引擎 | 数据库名 | 定位 |
|------------|-----------|---------|------|
| `mysql_example` | MySQL 8.0 | `test` | 财务/预算分析场景 |
| `classic_business` | MySQL 8.0 | `classic_business` | 电商业务全链路场景 |
| `global_analysis` | MySQL 8.0 | `global_analysis` | 多维数据分析 + 图表专项场景 |
| `postgres_example` | PostgreSQL 15 | `knowledge_base` | 地理空间 + 审计日志场景 |

---

## 三、各库详细说明

### 3.1 classic_business（电商业务库）

**数据时间范围**：2024-01-01 ~ 2026-03-19（含裂变历史数据回溯至 2021）

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `products` | 200 | 产品目录，含 6 大类目、买入价、零售价、库存 |
| `customers` | 2,000 | 客户信息，含城市/省份/**经纬度坐标**（±0.05° 随机偏移） |
| `orders` | ~160,000 | 订单主表，含状态、支付方式、运费、归属组织；脏数据率约 5% |
| `order_details` | ~480,000 | 订单详情，含商品数量、单价、折扣 |
| `returns` | ~14,000 | 退货记录，含原因文本、退款金额、客户情感评分（NLP） |
| `marketing_campaigns` | 3 | 营销活动（春节促销、双十一、618） |
| `organizations` | 5 | 多租户组织（全球总部 + 4 个区域分公司） |
| `users` | 2,000 | 系统用户表（独立于 customers），含性别、年龄、注册日期 |
| `product_price_history` | 1,000 | 产品调价记录，2024-01 ~ 2026-03 |
| `user_behavior_logs` | ~500,000 | 用户点击流（view/search/add_to_cart/checkout），70% 近三月 |

**关键字段**（AI 查询依赖）：
- 销售额公式：`SUM(od.quantity_ordered * (od.price_each - od.discount_amount))`
- 地图坐标：`customers.latitude` / `customers.longitude`
- 订单日期：`orders.order_date`（DATE 类型）

**数据特征**：
- 11月（双十一）和6月（618）订单密度约为平均值的 3～5 倍
- 约 1% 的订单状态为 NULL 或 `Error_99`（模拟脏数据）
- 约 3% 的订单有退货记录

---

### 3.2 global_analysis（全场景分析库）

**数据时间范围**：2024-01-01 ~ 2026-03-19

#### 时序与趋势

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `daily_metrics` | 810 | 每日营收/新增用户/活跃用户/服务器延迟；每 50 天注入一个异常尖峰 |
| `sales_forecast` | 180 | 销售额预测 vs 实际（2025-10-02 前为实际值，之后为预测+置信区间） |
| `user_activity_heatmap` | 168 | 7天×24小时的用户活跃热力图（无日期维度，统计规律用） |

#### 广告与营销

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `ad_attribution` | 5,000 | 广告归因，含渠道（TikTok/Google/WeChat/Bilibili 等）、日期、转化率 |
| `marketing_bubbles` | 11 | 产品线广告投入/ROI/转化数气泡图数据 |
| `sankey_traffic` | 11 | 用户流量桑基图（搜索→首页→详情→购物车→支付） |

#### 项目管理

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `gantt_projects` | 7 | 甘特图数据（2025系统升级项目，含7个阶段） |
| `project_tasks` | 16 | 详细任务甘特（A/B两个子项目，含进度百分比） |

#### 地理与分布

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `geo_market_data` | 20 | 全国 20 省市地图数据，含**经纬度/省份/活跃用户/总营收/同比增长率** |
| `regional_sales_distribution` | ~14,400 | 6大区×5产品线月度销售额，2024-01 ~ 2026-03，供箱线图/趋势图 |

#### K线图（candlestick 专用）

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `stock_prices` | ~2,200 | 4支模拟股票（TECH_A/TECH_B/BANK_A/CONS_A）2024-2026 日K线数据 |

**stock_prices 字段**（AI 查询 candlestick 时必须使用以下别名）：
```sql
SELECT trade_date,
       open_price  AS open,
       close_price AS close,
       low_price   AS low,
       high_price  AS high,
       volume
FROM stock_prices
WHERE symbol = 'TECH_A'
ORDER BY trade_date
```

**关键说明**：
- `daily_metrics.server_latency_ms`：服务器延迟（毫秒），可用于基础设施分析
- `ad_attribution.user_id` 范围 0~4999，与 `classic_business.customers` 无关联（独立场景）

---

### 3.3 mysql_example / test（财务分析库）

**数据时间范围**：2024-01-01 ~ 2025-12-31

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `financial_records` | 1,000 | 财务流水，含类型（Income/Expense）、**细分类别**（营业收入/成本/市场费用等）、**`record_date`**（DATE）、季度标签、年份 |
| `budget_vs_actual` | 7 | 部门预决算对比（R&D/Sales/Marketing/Operations，2024-2025） |
| `organizations` | 3 | 组织架构（仅在 `upgrade_to_enterprise_db.py` 未运行时创建） |
| `user_behavior_logs` | 100,000 | 行为日志（view/click/buy），时间范围 2024-01 ~ 2026-03 |

**`financial_records` 关键字段**：
- `record_date`：具体日期，支持按天/月/季度聚合查询
- `period`：季度标签（如 `2024-Q1`），供快速分组
- `category`：细分类别（营业收入/投资收益/其他收入/成本支出/市场费用/研发投入/行政费用/财务费用）

---

### 3.4 postgres_example / knowledge_base（PostgreSQL 库）

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `city_nodes` | 20 | 中国 20 个主要城市，含省份、**经纬度**、人口、城市等级（1-3线） |
| `organizations` | 3 | 组织架构 |
| `user_behavior_logs` | 100,000 | 行为日志（时间范围 2024-01 ~ 2026-03） |
| `audit_logs` | 3 | 审计日志，JSONB 格式，含 GIN 索引 |

**`city_nodes` 适用场景**：PostgreSQL 地理空间查询、与业务数据联表做城市维度分析。

---

## 四、图表类型与推荐数据源

| 图表类型 | 推荐数据源 | 示例问题 |
|---------|-----------|---------|
| line / area | `daily_metrics`、`regional_sales_distribution` | "最近半年每日营收趋势" |
| bar | `budget_vs_actual`、`ad_attribution` | "各部门预算执行情况" |
| pie | `orders.status`、`ad_attribution.channel` | "各渠道广告转化占比" |
| scatter | `marketing_bubbles`、`ad_attribution` | "广告投入与ROI关系" |
| map | `customers`（classic_business）、`geo_market_data` | "各省活跃用户分布" |
| candlestick | `stock_prices`（global_analysis）| "TECH_A 近三个月K线图" |
| heatmap | `user_activity_heatmap` | "一周各时段用户活跃热力图" |
| sankey | `sankey_traffic` | "用户流量转化路径" |
| boxplot | `regional_sales_distribution` | "各大区销售额分布箱线图" |
| gantt | `gantt_projects`、`project_tasks` | "2025系统升级项目进度" |
| waterfall | `financial_records` | "各收支类别对净利润的贡献" |
| radar | `marketing_bubbles` | "各产品线多维营销指标对比" |

---

## 五、手动重新生成数据

### 场景 A：Docker Volume 从未创建（首次部署）
```bash
docker-compose up --build
# seed 脚本会自动运行，无需任何额外操作
```

### 场景 B：需要在已有环境中重跑 seed
```bash
# 进入 seed 容器或直接运行
docker-compose run --rm db-seed python /app/scripts/setup_all_data.py
```

### 场景 C：全量清空重建（⚠️ 不可恢复）
```bash
docker-compose down -v          # 删除所有 Volume
docker-compose up --build       # 重新构建并初始化
```

### 场景 D：本地开发环境（非 Docker）手动运行
```bash
# 确保 MySQL 和 PostgreSQL 已启动
export MYSQL_HOST=localhost MYSQL_USER=root MYSQL_PASSWORD=root
export POSTGRES_HOST=localhost POSTGRES_USER=postgres POSTGRES_PASSWORD=root POSTGRES_DB=knowledge_base
cd scripts
python setup_all_data.py
```

---

## 六、数据质量说明

### 故意注入的脏数据（用于测试数据清洗场景）

| 位置 | 脏数据类型 | 比例 |
|------|-----------|------|
| `orders.status` | NULL 或 `Error_99` | ~5% |
| `order_details.price_each` | 异常高价 `99999.99` | ~1% |
| `daily_metrics.revenue` | 极值尖峰（0.1x 或 5x） | 每 50 天 1 次 |
| `returns.sentiment_score` | ±0.05 随机扰动 | 全量 |

### 数据约束说明

- 各表**无外键约束**（为保证 seed 脚本可重复运行），业务关联依赖应用层保证
- `order_details` 和 `returns` 使用 `INSERT IGNORE` 防止主键冲突
- 裂变生成的 ~140,000 条 orders 均有对应的 order_details（通过 Python ID 映射复制）
