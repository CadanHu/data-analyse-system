"""DAT-29 — billing_pricing 纯函数单测(无 IO,可在裸 CI 跑)。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.billing_pricing import compute_invoice, PLAN_BASE_CENTS


def test_team_base_plus_usage():
    amount, items = compute_invoice('team', {
        'asks_count': 100, 'tokens_total': 5000,
        'compute_seconds_total': 600, 'storage_bytes_avg': 0,
    })
    # 9900 + 100*10 + (5000//1000)*1 + round(600/60)*5 = 9900+1000+5+50
    assert amount == 10955
    assert sum(li['amount_cents'] for li in items) == amount


def test_free_base_is_zero():
    amount, items = compute_invoice('free', {})
    assert PLAN_BASE_CENTS['free'] == 0
    assert amount == 0
    assert items[0]['kind'] == 'plan_base' and items[0]['amount_cents'] == 0


def test_total_always_equals_line_items_sum():
    amount, items = compute_invoice('business', {
        'asks_count': 7, 'tokens_total': 123456,
        'compute_seconds_total': 3661, 'storage_bytes_avg': 2 * 1024 ** 3,
    })
    assert amount == sum(li['amount_cents'] for li in items)


def test_tokens_floor_per_1k():
    # 不足 1 千 token 不计费
    _, items = compute_invoice('free', {'tokens_total': 999})
    tok = next(li for li in items if li['kind'] == 'tokens')
    assert tok['qty'] == 0 and tok['amount_cents'] == 0
    _, items2 = compute_invoice('free', {'tokens_total': 1000})
    tok2 = next(li for li in items2 if li['kind'] == 'tokens')
    assert tok2['qty'] == 1


def test_unknown_plan_falls_back_to_zero_base():
    amount, items = compute_invoice('mystery', {})
    assert items[0]['amount_cents'] == 0
    assert amount == 0
