# RFC · metric.expression DSL 形态选型

- Linear: DAT-42(Spike,parent DAT-34)
- 状态: **草案 → 待评审**
- 关联模型: `MetricModel.expression`(现为 `Text`,字符串字面量)、`MetricSynonymModel`、`MetricLineageModel`
- 目标: 为 `metric.expression` 选定 DSL 形态,供后续 DAT-43(parser/AST)、DAT-44(evaluator)实现。

---

## 1. 背景

阶段 8 只建了 `metrics` 表,`expression` 当普通字符串存,没有解析/求值能力(见 `models.py:647` 注释「暂用普通字符串,未来加 DSL 解析」)。`semantic_services.search_metrics` 也只做子串匹配。要让指标「真能跑」,先得定 expression 的语法形态。

约束:
- **多方言**:`DatabaseManager` 支持 MySQL / PostgreSQL / MongoDB,DSL 不能绑死单一 SQL 方言。
- **安全**:expression 由用户(workspace 管理员)填写,绝不能直接拼进 SQL 造成注入。
- **可组合**:指标常引用其他指标(已有 `MetricLineageModel`,`to_type=metric`),DSL 要能表达「指标引用指标」。
- **够用即可**:90% 的业务指标是 `聚合(列) [filter] [按时间粒度]`,不必一上来支持图灵完备表达式。

---

## 2. 候选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. SQL fragment** | 学习成本低、表达力强、直接拼查询 | 注入风险高、跨方言难(函数名/日期函数各异)、难静态校验、难做指标引用 |
| **B. jq-like 表达式链** | 灵活、函数式可组合 | 学习成本高、要自研词法/语法、跑在应用层而非下推到 DB(性能差) |
| **C. YAML/JSON 声明式 + 受限算子** | 无注入(结构化)、易静态校验(pydantic)、可下推编译成各方言 SQL、易表达指标引用 | 表达力受限于内置算子,复杂场景需 escape hatch |

---

## 3. 决策:采用 **方案 C(声明式)+ 受限 raw_sql 逃生舱**

理由:
1. **安全是硬约束**。声明式结构天然杜绝注入——所有标识符(表/列)都要在编译期对照 schema 白名单校验,字面量走参数化绑定。
2. **覆盖度足够**。调研内部指标:绝大多数是「聚合 + 过滤 + 时间粒度 + 指标间四则运算」,声明式算子集即可覆盖。
3. **可下推、可跨方言**。声明式 AST 由 compiler 按 `db_type` 生成对应方言 SQL(日期截断 MySQL `DATE_FORMAT` vs PG `date_trunc`),求值下推到 DB,性能好。
4. **逃生舱**:确实表达不了的,允许 `raw_sql` 字段,但**仅 admin 可写**且审计标记,避免声明式的「短板」变成阻塞。

---

## 4. 语法定义(YAML,存库时序列化为 JSON 字符串塞进 `expression`)

```yaml
# 顶层
kind: metric            # metric | ratio | derived
source:                 # 数据来源
  db_key: classic_business
  table: orders
aggregate:              # 聚合算子
  op: sum               # sum | avg | count | count_distinct | min | max
  column: amount
filters:                # 可选,AND 连接
  - { column: status, op: eq, value: paid }
  - { column: created_at, op: gte, value: "${period_start}" }   # 参数占位
time_grain: day         # 可选: day | week | month | quarter | year(决定 GROUP BY 的时间截断)
```

### 算子集(白名单)
- 聚合 `op`: `sum / avg / count / count_distinct / min / max`
- 过滤 `op`: `eq / ne / gt / gte / lt / lte / in / between / like`
- `derived`(指标间运算): `expr: "A / B"`,其中 `A`/`B` 是 `refs` 里声明的指标 id(对应 `MetricLineageModel`)

### 指标引用(ratio / derived)
```yaml
kind: ratio
refs:
  numerator:   m_paid_orders      # metric_id
  denominator: m_total_orders
expr: "numerator / denominator"   # 仅允许 + - * / 与 refs 名,parser 强校验
```

### 参数占位
`${period_start}` / `${period_end}` / `${workspace_id}` 等由 evaluator 在求值时参数化绑定(不字符串替换)。

---

## 5. 五个典型示例

| # | 业务含义 | 形态 |
|---|---|---|
| 1 | 本月已支付订单数 | `count` of orders, filter `status=paid` + `created_at∈[期初,期末]` |
| 2 | 客单价 | `derived`: `sum(amount) / count_distinct(user_id)` |
| 3 | 支付转化率 | `ratio`: `m_paid_orders / m_visits` |
| 4 | 按月活跃用户 | `count_distinct(user_id)`,`time_grain=month` |
| 5 | 高价订单占比(复杂) | `raw_sql`(逃生舱,admin):`SUM(amount>1000)/COUNT(*)` |

(完整 5 例的 YAML 落在 DAT-43 的测试夹具里。)

---

## 6. parser / 求值选型(交给 DAT-43 / DAT-44)

- **parser**: 用 **pydantic v2** 定义 AST 模型(`MetricAST`、`Aggregate`、`Filter`、`Derived`),YAML→dict→pydantic 校验。**不自研词法分析器**——声明式结构让 pydantic 直接当 parser + 校验器,错误信息也由 pydantic 给。唯一需要自研的小 parser 是 `derived.expr` 的四则运算(用 Python `ast.parse` + 白名单 NodeVisitor,禁止函数调用/属性访问)。
- **compiler**: AST → 方言 SQL,按 `source.db_key` 查 `DatabaseManager.get_config()` 拿 `type` 选方言模板。
- **校验**: 编译期对照 `SchemaService` 的表/列做白名单校验,未知表/列直接拒绝。
- **缓存**: evaluator 结果按 `metric_id + 参数 hash` 缓存(DAT-44)。
- **循环引用**: `refs` 构成 DAG,编译期拓扑排序检测环(复用/扩展 `MetricLineageModel`)。

---

## 7. DoD

- [ ] 本 RFC 评审通过
- [ ] DAT-34(metric DSL Epic)据此拆分:DAT-43 parser+AST、DAT-44 evaluator、DAT-45 前端预览
- [ ] 5 个示例的 YAML 形态在评审中确认可表达
