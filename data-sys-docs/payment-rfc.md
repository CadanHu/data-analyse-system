# RFC · 支付方案优先级 + 沙盒 + invoices 状态机改造

- Linear: DAT-49(Spike,parent DAT-37)
- 状态: **草案 → 待评审**
- 现状: 计费 4 表已落地(阶段 6),但 `invoices.status` 是纯本地状态机,靠手工 `_seed` / `updateInvoiceStatus` 流转;DAT-29 已加月度结算 worker 自动生成 draft。
- 目标: 定 Stripe 与微信支付的优先级、沙盒账号、`invoices` 状态机迁移路径,供 DAT-50(Stripe)、DAT-51(微信)、DAT-52(前端)实施。

---

## 1. 优先级决策:**Stripe 先,微信支付后**

理由:
1. **接入成本**:Stripe 沙盒(test mode)即开即用、SDK / webhook 文档成熟、本地用 Stripe CLI 可转发 webhook 调试;微信支付需**服务商/商户号申请**(审核周期以周计),不能即时联调。
2. **解耦**:先用 Stripe 把「本地草稿 → 第三方驱动 paid/failed」这套**状态机改造**打通并测稳,微信支付复用同一状态机,只换 provider adapter。
3. **并行**:微信商户号申请走流程的同时,Stripe already 能让计费闭环跑起来。

> 即:状态机改造 + Stripe(DAT-50)先做,微信(DAT-51)在商户号到位后按同一抽象接入。

---

## 2. 沙盒账号(需文档化落地)

| Provider | 沙盒 | 准备项 |
|---|---|---|
| Stripe | test mode（`sk_test_` / `pk_test_`) | 测试 API key、webhook signing secret(`whsec_`)、Stripe CLI(`stripe listen --forward-to`)转发到本地 |
| 微信支付 | 微信支付沙箱 / 服务商沙盒 | 商户号 mchid、APIv3 key、商户私钥/证书、平台证书(申请中,先占位) |

密钥走环境变量(参考 `config.py` 现有 `os.getenv` 模式),**不入库、不入 git**。

---

## 3. invoices 状态机迁移

### 现状(本地)
`draft → issued → paid`(手工点按钮流转,见 BillingLiveBar)。

### 目标(第三方驱动)
```
draft ──issue──▶ pending ──(webhook: succeeded)──▶ paid
   │                 │
   │                 ├──(webhook: failed)──▶ failed ──retry──▶ pending
   │                 └──(超时/取消)────────▶ canceled
   └──(无需收款,如 0 元/手工核销)─────────▶ paid(admin)
paid ──(webhook: refunded)──▶ refunded
```

- `draft`:DAT-29 worker 生成,可编辑/合并。
- `pending`:已创建第三方 Checkout/支付单,等回调。
- `paid` / `failed` / `refunded`:**由 webhook 驱动**,不由前端按钮决定(前端按钮仅 admin 兜底核销)。
- 需给 `invoices` 加列:`provider`(stripe|wechat|manual)、`provider_ref`(payment_intent / out_trade_no)、`paid_at`、`failure_reason`。加列走 `backend/database/v2/base.py` 的 `_ensure_columns` + `_COLUMN_MIGRATIONS`(见已有基建)。

---

## 4. webhook 设计(DAT-50 / DAT-51 共用约定)

- **签名校验**:Stripe 用 `Stripe-Signature` + `whsec_`;微信用 `Wechatpay-Signature` + 平台证书(SHA256-RSA)。**校验失败直接 4xx 拒绝,不处理。**
- **幂等**:每个 webhook event 有唯一 id(Stripe `event.id` / 微信通知 id)。新增 `payment_webhook_events` 表存已处理 event_id;重复直接 200 跳过。
- **事件分发**:`payment_intent.succeeded` / `.payment_failed` / `charge.refunded`(Stripe);微信对应通知类型 → 统一映射成状态机迁移。
- **失败重试 + dead letter**:webhook 处理内部异常时返回非 2xx 让 provider 重投;超过 N 次仍失败写 dead letter 表 + 告警(可复用 alert worker)。

---

## 5. 退款流程

- admin 在 AdminBilling 发起退款 → 调 provider 退款 API → 状态置 `refunding`(中间态)→ 收到退款 webhook → `refunded`。
- 退款也落审计(v2 audit middleware)。

---

## 6. 抽象:PaymentProvider 接口

为让微信复用,定义统一接口,Stripe / 微信各实现:
```
class PaymentProvider(Protocol):
    async def create_checkout(invoice) -> {provider_ref, pay_url}
    async def verify_webhook(headers, body) -> Event | None     # 含签名校验
    async def refund(invoice, amount) -> {refund_ref}
```
状态机迁移逻辑只认 `Event`,与 provider 无关。

---

## 7. DoD

- [ ] 本 RFC 评审通过,Stripe 优先确认
- [ ] Stripe test mode + webhook secret 文档化、可本地联调
- [ ] DAT-50(Stripe webhook + 状态机)、DAT-51(微信)、DAT-52(前端状态展示+重试)据此拆分实施
