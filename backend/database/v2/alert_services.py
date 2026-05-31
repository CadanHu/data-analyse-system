"""阶段 5 — alert_rules / alert_events / alert_subscriptions CRUD。

注意：本阶段不做 cron worker 实时评估告警规则。
- 评估逻辑 (规则 → SQL → 取值 → 对比阈值 → 触发事件) 是独立工程，留待 metrics 层 (阶段 8) 后做
- 现在提供 trigger_event 手动接口，供联调或者管理员强制触发
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import (
    AlertRuleModel, AlertEventModel, AlertSubscriptionModel,
    NotificationModel,
)


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ============================================================
# alert_rules
# ============================================================

async def list_rules(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(AlertRuleModel)
            .where(AlertRuleModel.workspace_id == workspace_id)
            .order_by(AlertRuleModel.created_at.desc())
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def get_rule(rule_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(AlertRuleModel).where(AlertRuleModel.id == rule_id))
        r = res.scalar_one_or_none()
        return _to_dict(r) if r else None


async def create_rule(
    workspace_id: str,
    owner_user_id: int,
    name: str,
    threshold: Dict[str, Any],
    description: Optional[str] = None,
    metric_id: Optional[str] = None,
    widget_id: Optional[str] = None,
    schedule_cron: Optional[str] = None,
    channels: Optional[List[Dict[str, Any]]] = None,
    enabled: bool = True,
    dedupe_minutes: int = 5,
) -> Dict[str, Any]:
    rid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        r = AlertRuleModel(
            id=rid, workspace_id=workspace_id, owner_user_id=owner_user_id,
            name=name, description=description,
            metric_id=metric_id, widget_id=widget_id,
            threshold_json=threshold, schedule_cron=schedule_cron,
            channels_json=channels, enabled=enabled,
            dedupe_minutes=dedupe_minutes,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(r)
        # 创建者默认订阅自己的规则
        s.add(AlertSubscriptionModel(
            rule_id=rid, user_id=owner_user_id,
            channel_overrides_json=None, subscribed_at=datetime.utcnow(),
        ))
        await s.commit()
        return _to_dict(r)


async def update_rule(rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ALLOWED = {'name', 'description', 'threshold_json', 'schedule_cron', 'channels_json', 'enabled', 'dedupe_minutes'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return await get_rule(rule_id)
    async with v2_db.async_session() as s:
        res = await s.execute(select(AlertRuleModel).where(AlertRuleModel.id == rule_id))
        r = res.scalar_one_or_none()
        if not r:
            return None
        for k, v in cleaned.items():
            setattr(r, k, v)
        await s.commit()
        return _to_dict(r)


async def delete_rule(rule_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(AlertEventModel).where(AlertEventModel.rule_id == rule_id))
        await s.execute(sa_delete(AlertSubscriptionModel).where(AlertSubscriptionModel.rule_id == rule_id))
        await s.execute(sa_delete(AlertRuleModel).where(AlertRuleModel.id == rule_id))
        await s.commit()


# ============================================================
# alert_events
# ============================================================

async def list_events(
    rule_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(AlertEventModel)
        if rule_id:
            stmt = stmt.where(AlertEventModel.rule_id == rule_id)
        elif workspace_id:
            # 通过 rules 反查
            stmt = stmt.join(AlertRuleModel, AlertEventModel.rule_id == AlertRuleModel.id)\
                       .where(AlertRuleModel.workspace_id == workspace_id)
        if status:
            stmt = stmt.where(AlertEventModel.status == status)
        stmt = stmt.order_by(AlertEventModel.fired_at.desc()).limit(limit)
        res = await s.execute(stmt)
        return [_to_dict(e) for e in res.scalars().all()]


async def get_last_event_fired_at(rule_id: str) -> Optional[datetime]:
    """取该规则最近一次事件的 fired_at；无事件返回 None。用于 cron 去重窗口判断。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(AlertEventModel.fired_at)
            .where(AlertEventModel.rule_id == rule_id)
            .order_by(AlertEventModel.fired_at.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()


async def trigger_event(
    rule_id: str,
    current_value: str,
    threshold_value: Optional[str] = None,
    severity: str = 'warn',
    attribution: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """触发一条告警事件 + 给所有订阅者发通知。"""
    eid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        ev = AlertEventModel(
            id=eid, rule_id=rule_id,
            current_value=current_value, threshold_value=threshold_value,
            severity=severity, attribution_json=attribution,
            status='open', fired_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        s.add(ev)

        # 拉规则名 + 订阅者列表
        rule_res = await s.execute(select(AlertRuleModel).where(AlertRuleModel.id == rule_id))
        rule = rule_res.scalar_one_or_none()
        rule_name = rule.name if rule else '(未知规则)'

        sub_res = await s.execute(
            select(AlertSubscriptionModel.user_id)
            .where(AlertSubscriptionModel.rule_id == rule_id)
        )
        for uid in sub_res.scalars().all():
            s.add(NotificationModel(
                id=str(uuid.uuid4()),
                recipient_user_id=uid,
                type='alert',
                source_type='alert_event',
                source_id=eid,
                payload_json={
                    'title': f'告警: {rule_name}',
                    'body': f'当前值 {current_value} {"超出阈值" if threshold_value else ""} {threshold_value or ""}',
                    'severity': severity,
                    'rule_id': rule_id,
                },
                created_at=datetime.utcnow(),
            ))
        await s.commit()
        return _to_dict(ev)


async def ack_event(event_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(AlertEventModel).where(AlertEventModel.id == event_id))
        e = res.scalar_one_or_none()
        if not e:
            return None
        if e.status == 'open':
            e.status = 'ack'
            e.acked_at = datetime.utcnow()
            e.acked_by_user_id = user_id
        await s.commit()
        return _to_dict(e)


async def resolve_event(event_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(AlertEventModel).where(AlertEventModel.id == event_id))
        e = res.scalar_one_or_none()
        if not e:
            return None
        if e.status != 'resolved':
            e.status = 'resolved'
            e.resolved_at = datetime.utcnow()
            e.resolved_by_user_id = user_id
        await s.commit()
        return _to_dict(e)


# ============================================================
# subscriptions
# ============================================================

async def subscribe(rule_id: str, user_id: int, channel_overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(AlertSubscriptionModel).where(
                AlertSubscriptionModel.rule_id == rule_id,
                AlertSubscriptionModel.user_id == user_id,
            )
        )
        sub = res.scalar_one_or_none()
        if sub:
            sub.channel_overrides_json = channel_overrides
        else:
            sub = AlertSubscriptionModel(
                rule_id=rule_id, user_id=user_id,
                channel_overrides_json=channel_overrides,
                subscribed_at=datetime.utcnow(),
            )
            s.add(sub)
        await s.commit()
        return _to_dict(sub)


async def unsubscribe(rule_id: str, user_id: int) -> None:
    async with v2_db.async_session() as s:
        await s.execute(
            sa_delete(AlertSubscriptionModel).where(
                AlertSubscriptionModel.rule_id == rule_id,
                AlertSubscriptionModel.user_id == user_id,
            )
        )
        await s.commit()


async def list_subscribers(rule_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(AlertSubscriptionModel).where(AlertSubscriptionModel.rule_id == rule_id)
        )
        return [_to_dict(sub) for sub in res.scalars().all()]


async def list_user_subscriptions(user_id: int) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(AlertSubscriptionModel).where(AlertSubscriptionModel.user_id == user_id)
        )
        return [_to_dict(sub) for sub in res.scalars().all()]
