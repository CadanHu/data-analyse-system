"""阶段 6 — subscriptions / org_seats / usage_counters / invoices CRUD。

注意：本阶段不接真实计费 (Stripe / 微信支付)。
- subscriptions.external_subscription_id 留位但不写
- invoices 用本地状态机模拟 (draft → issued → paid)
- usage_counters 由路由层主动累加（暂时不挂自动 middleware）
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import SubscriptionModel, OrgSeatsModel, UsageCounterModel, InvoiceModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ---------- subscriptions ----------

async def get_current_subscription(workspace_id: str) -> Optional[Dict[str, Any]]:
    """拿工作区当前最新订阅 (按 created_at 取最新)。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(SubscriptionModel)
            .where(SubscriptionModel.workspace_id == workspace_id)
            .order_by(SubscriptionModel.created_at.desc())
            .limit(1)
        )
        sub = res.scalar_one_or_none()
        return _to_dict(sub) if sub else None


async def upgrade_plan(
    workspace_id: str,
    plan: str,
    billing_cycle: str = 'monthly',
    auto_renew: bool = True,
) -> Dict[str, Any]:
    """新建一条 subscription 记录（旧的保留作历史）。"""
    sid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        sub = SubscriptionModel(
            id=sid, workspace_id=workspace_id, plan=plan,
            billing_cycle=billing_cycle, auto_renew=auto_renew,
            valid_from=datetime.utcnow(),
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(sub)
        await s.commit()
        return _to_dict(sub)


async def list_subscription_history(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(SubscriptionModel)
            .where(SubscriptionModel.workspace_id == workspace_id)
            .order_by(SubscriptionModel.created_at.desc())
        )
        return [_to_dict(r) for r in res.scalars().all()]


# ---------- org_seats ----------

async def get_seats(workspace_id: str) -> Dict[str, Any]:
    """没有则返回默认值（不写表，按需创建）。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(OrgSeatsModel).where(OrgSeatsModel.workspace_id == workspace_id))
        seat = res.scalar_one_or_none()
        return _to_dict(seat) if seat else {
            'workspace_id': workspace_id, 'used_count': 0, 'limit_count': 5,
            'updated_at': None,
        }


async def update_seats(workspace_id: str, used_count: Optional[int] = None, limit_count: Optional[int] = None) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(OrgSeatsModel).where(OrgSeatsModel.workspace_id == workspace_id))
        seat = res.scalar_one_or_none()
        if not seat:
            seat = OrgSeatsModel(workspace_id=workspace_id, used_count=used_count or 0, limit_count=limit_count or 5)
            s.add(seat)
        else:
            if used_count is not None:
                seat.used_count = used_count
            if limit_count is not None:
                seat.limit_count = limit_count
        await s.commit()
        return _to_dict(seat)


# ---------- usage_counters ----------

def _current_yyyymm() -> str:
    return datetime.utcnow().strftime('%Y-%m')


async def get_usage(workspace_id: str, period: Optional[str] = None) -> Dict[str, Any]:
    p = period or _current_yyyymm()
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(UsageCounterModel).where(
                UsageCounterModel.workspace_id == workspace_id,
                UsageCounterModel.period_yyyymm == p,
            )
        )
        row = res.scalar_one_or_none()
        return _to_dict(row) if row else {
            'workspace_id': workspace_id, 'period_yyyymm': p,
            'asks_count': 0, 'tokens_total': 0,
            'compute_seconds_total': 0, 'storage_bytes_avg': 0,
        }


async def increment_usage(
    workspace_id: str,
    *,
    asks: int = 0,
    tokens: int = 0,
    compute_seconds: int = 0,
) -> None:
    p = _current_yyyymm()
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(UsageCounterModel).where(
                UsageCounterModel.workspace_id == workspace_id,
                UsageCounterModel.period_yyyymm == p,
            )
        )
        row = res.scalar_one_or_none()
        if not row:
            row = UsageCounterModel(
                workspace_id=workspace_id, period_yyyymm=p,
                asks_count=asks, tokens_total=tokens,
                compute_seconds_total=compute_seconds,
            )
            s.add(row)
        else:
            row.asks_count = (row.asks_count or 0) + asks
            row.tokens_total = (row.tokens_total or 0) + tokens
            row.compute_seconds_total = (row.compute_seconds_total or 0) + compute_seconds
        await s.commit()


async def list_usage_history(workspace_id: str, limit: int = 12) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(UsageCounterModel)
            .where(UsageCounterModel.workspace_id == workspace_id)
            .order_by(UsageCounterModel.period_yyyymm.desc())
            .limit(limit)
        )
        return [_to_dict(r) for r in res.scalars().all()]


# ---------- invoices ----------

async def list_invoices(workspace_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(InvoiceModel)
            .where(InvoiceModel.workspace_id == workspace_id)
            .order_by(InvoiceModel.period_yyyymm.desc(), InvoiceModel.created_at.desc())
            .limit(limit)
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def create_invoice(
    workspace_id: str,
    period_yyyymm: str,
    amount_cents: int,
    currency: str = 'CNY',
    pdf_url: Optional[str] = None,
    status: str = 'draft',
) -> Dict[str, Any]:
    iid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        inv = InvoiceModel(
            id=iid, workspace_id=workspace_id, period_yyyymm=period_yyyymm,
            amount_cents=amount_cents, currency=currency,
            pdf_url=pdf_url, status=status,
            created_at=datetime.utcnow(),
        )
        s.add(inv)
        await s.commit()
        return _to_dict(inv)


async def update_invoice_status(invoice_id: str, status: str) -> Optional[Dict[str, Any]]:
    if status not in ('draft', 'issued', 'paid', 'void'):
        return None
    async with v2_db.async_session() as s:
        res = await s.execute(select(InvoiceModel).where(InvoiceModel.id == invoice_id))
        inv = res.scalar_one_or_none()
        if not inv:
            return None
        inv.status = status
        if status == 'paid' and not inv.paid_at:
            inv.paid_at = datetime.utcnow()
        await s.commit()
        return _to_dict(inv)
