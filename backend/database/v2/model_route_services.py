"""阶段 6 — model_routes / model_budgets / api_keys_v2 服务。

注意：
- 真正的"按 intent_pattern 路由 LLM 调用"逻辑没接入到 chat_router；
  本阶段先支持 CRUD + 列表 + 简单的 evaluate(intent) 接口
- api_keys_v2 是组织级 Key，**与旧 user_api_keys (个人离线模式 Key) 完全不同**
"""
import uuid
import hashlib
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import ModelRouteModel, ModelBudgetModel, ApiKeyV2Model


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ============================================================
# model_routes
# ============================================================

async def list_routes(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ModelRouteModel)
            .where(ModelRouteModel.workspace_id == workspace_id)
            .order_by(ModelRouteModel.priority.desc())
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def create_route(
    workspace_id: str,
    intent_pattern: str,
    target_model: str,
    priority: int = 100,
    enabled: bool = True,
) -> Dict[str, Any]:
    rid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        r = ModelRouteModel(
            id=rid, workspace_id=workspace_id,
            intent_pattern=intent_pattern, target_model=target_model,
            priority=priority, enabled=enabled,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(r)
        await s.commit()
        return _to_dict(r)


async def update_route(route_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ALLOWED = {'intent_pattern', 'target_model', 'priority', 'enabled'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return None
    async with v2_db.async_session() as s:
        res = await s.execute(select(ModelRouteModel).where(ModelRouteModel.id == route_id))
        r = res.scalar_one_or_none()
        if not r:
            return None
        for k, v in cleaned.items():
            setattr(r, k, v)
        await s.commit()
        return _to_dict(r)


async def delete_route(route_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(ModelRouteModel).where(ModelRouteModel.id == route_id))
        await s.commit()


async def evaluate(workspace_id: str, intent: str) -> Optional[str]:
    """简单匹配：按 priority 降序找第一个 intent_pattern 包含的 enabled 规则的 target_model。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ModelRouteModel)
            .where(ModelRouteModel.workspace_id == workspace_id)
            .where(ModelRouteModel.enabled.is_(True))
            .order_by(ModelRouteModel.priority.desc())
        )
        for r in res.scalars().all():
            # MVP：子串匹配。后续可改正则
            if r.intent_pattern in intent:
                return r.target_model
    return None


# ============================================================
# model_budgets
# ============================================================

def _current_yyyymm() -> str:
    return datetime.utcnow().strftime('%Y-%m')


async def list_budgets(workspace_id: str, period: Optional[str] = None) -> List[Dict[str, Any]]:
    p = period or _current_yyyymm()
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ModelBudgetModel)
            .where(ModelBudgetModel.workspace_id == workspace_id)
            .where(ModelBudgetModel.period_yyyymm == p)
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def set_budget(
    workspace_id: str, model_name: str,
    monthly_cap_usd_cents: int,
    alert_threshold_pct: int = 80,
    period: Optional[str] = None,
) -> Dict[str, Any]:
    p = period or _current_yyyymm()
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ModelBudgetModel).where(
                ModelBudgetModel.workspace_id == workspace_id,
                ModelBudgetModel.model_name == model_name,
                ModelBudgetModel.period_yyyymm == p,
            )
        )
        b = res.scalar_one_or_none()
        if not b:
            b = ModelBudgetModel(
                workspace_id=workspace_id, model_name=model_name, period_yyyymm=p,
                monthly_cap_usd_cents=monthly_cap_usd_cents, used_cents=0,
                alert_threshold_pct=alert_threshold_pct,
            )
            s.add(b)
        else:
            b.monthly_cap_usd_cents = monthly_cap_usd_cents
            b.alert_threshold_pct = alert_threshold_pct
        await s.commit()
        return _to_dict(b)


async def increment_used(workspace_id: str, model_name: str, cents: int) -> Dict[str, Any]:
    p = _current_yyyymm()
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ModelBudgetModel).where(
                ModelBudgetModel.workspace_id == workspace_id,
                ModelBudgetModel.model_name == model_name,
                ModelBudgetModel.period_yyyymm == p,
            )
        )
        b = res.scalar_one_or_none()
        if not b:
            b = ModelBudgetModel(
                workspace_id=workspace_id, model_name=model_name, period_yyyymm=p,
                monthly_cap_usd_cents=0, used_cents=cents,
                alert_threshold_pct=80,
            )
            s.add(b)
        else:
            b.used_cents = (b.used_cents or 0) + cents
        await s.commit()
        return _to_dict(b)


# ============================================================
# api_keys_v2
# ============================================================

def _gen_key() -> Tuple[str, str, str]:
    """生成 (raw_key, prefix, hash)。raw_key 只在创建时返回一次。"""
    raw = 'dpv2_' + secrets.token_urlsafe(32)
    prefix = raw[:12]
    h = hashlib.sha256(raw.encode()).hexdigest()
    return raw, prefix, h


async def list_keys(workspace_id: str, include_revoked: bool = False) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(ApiKeyV2Model).where(ApiKeyV2Model.workspace_id == workspace_id)
        if not include_revoked:
            stmt = stmt.where(ApiKeyV2Model.revoked_at.is_(None))
        stmt = stmt.order_by(ApiKeyV2Model.created_at.desc())
        res = await s.execute(stmt)
        out = []
        for k in res.scalars().all():
            d = _to_dict(k)
            d.pop('key_hash', None)   # 永不返回 hash
            out.append(d)
        return out


async def create_key(
    workspace_id: str,
    created_by_user_id: int,
    name: str,
    scopes: Optional[List[str]] = None,
    rotated_from_id: Optional[str] = None,
) -> Dict[str, Any]:
    raw, prefix, h = _gen_key()
    kid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        k = ApiKeyV2Model(
            id=kid, workspace_id=workspace_id, name=name,
            key_prefix=prefix, key_hash=h,
            scopes_json=scopes, created_by_user_id=created_by_user_id,
            rotated_from_id=rotated_from_id,
            created_at=datetime.utcnow(),
        )
        s.add(k)
        await s.commit()
        d = _to_dict(k)
        d.pop('key_hash', None)
        # 只在创建时一次性返回 raw_key
        d['key_plaintext'] = raw
        return d


async def revoke_key(key_id: str) -> None:
    async with v2_db.async_session() as s:
        res = await s.execute(select(ApiKeyV2Model).where(ApiKeyV2Model.id == key_id))
        k = res.scalar_one_or_none()
        if k and k.revoked_at is None:
            k.revoked_at = datetime.utcnow()
            await s.commit()


async def rotate_key(old_key_id: str, created_by_user_id: int) -> Optional[Dict[str, Any]]:
    """新建一条 + 旧的 revoke + 链接关系。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(ApiKeyV2Model).where(ApiKeyV2Model.id == old_key_id))
        old = res.scalar_one_or_none()
        if not old:
            return None
    # 新建（独立 session）
    new_k = await create_key(
        workspace_id=old.workspace_id,
        created_by_user_id=created_by_user_id,
        name=f"{old.name} (rotated)",
        scopes=old.scopes_json,
        rotated_from_id=old.id,
    )
    await revoke_key(old.id)
    return new_k
