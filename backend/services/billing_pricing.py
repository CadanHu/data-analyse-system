"""DAT-29 — 月度账单定价(纯函数,无 IO,可单测)。

计费模型:套餐月费 + 用量分项。
- 套餐月费按 plan 取固定值(PLAN_BASE_CENTS)
- 用量按 usage_counters 各指标单价计费
- storage 暂不计费(line 显示 unit=0,留待以后)

金额一律用「分」(int)避免浮点累计误差;line_items 各行 amount_cents 之和 == 发票 total。
"""
from __future__ import annotations
from typing import Any, Dict, List, Tuple

# 套餐月费(分)
PLAN_BASE_CENTS: Dict[str, int] = {
    'free': 0,
    'team': 9900,          # ¥99
    'business': 49900,     # ¥499
    'enterprise': 199900,  # ¥1999
}

# 用量单价(分)
ASK_UNIT_CENTS = 10          # ¥0.10 / 次提问
TOKEN_PER_1K_CENTS = 1       # ¥0.01 / 千 token
COMPUTE_PER_MIN_CENTS = 5    # ¥0.05 / 分钟算力


def compute_invoice(plan: str, usage: Dict[str, Any]) -> Tuple[int, List[Dict[str, Any]]]:
    """按套餐 + 用量算账单。返回 (amount_cents, line_items)。

    usage: 来自 billing_services.get_usage,含 asks_count / tokens_total /
           compute_seconds_total / storage_bytes_avg。
    """
    plan = (plan or 'free').lower()
    base_cents = PLAN_BASE_CENTS.get(plan, 0)

    asks = int(usage.get('asks_count') or 0)
    tokens = int(usage.get('tokens_total') or 0)
    compute_seconds = int(usage.get('compute_seconds_total') or 0)
    storage_bytes = int(usage.get('storage_bytes_avg') or 0)

    token_k = tokens // 1000                       # 不足 1 千 token 不计
    compute_min = round(compute_seconds / 60)
    storage_gb = round(storage_bytes / (1024 ** 3), 2)

    line_items: List[Dict[str, Any]] = [
        _line('plan_base', f'套餐月费 ({plan})', 1, base_cents),
        _line('asks', '提问次数', asks, ASK_UNIT_CENTS),
        _line('tokens', 'Token 用量 (千)', token_k, TOKEN_PER_1K_CENTS),
        _line('compute', '算力 (分钟)', compute_min, COMPUTE_PER_MIN_CENTS),
        _line('storage', '存储 (GB·月均)', storage_gb, 0),
    ]
    amount_cents = sum(li['amount_cents'] for li in line_items)
    return amount_cents, line_items


def _line(kind: str, label: str, qty, unit_cents: int) -> Dict[str, Any]:
    return {
        'kind': kind,
        'label': label,
        'qty': qty,
        'unit_cents': unit_cents,
        'amount_cents': int(round(qty * unit_cents)),
    }
