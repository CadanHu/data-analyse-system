"""阶段 4 — 统一通知收件箱 (notifications) CRUD。

设计:
- 单表 + type 字段，渲染层按 type 选模板
- 已读 / 已操作 分两个时间戳，方便区分 read != actioned
- payload_json 自由格式，写入方决定结构
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete, func

from .base import v2_db
from .models import NotificationModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def list_for_user(
    user_id: int,
    only_unread: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(NotificationModel).where(NotificationModel.recipient_user_id == user_id)
        if only_unread:
            stmt = stmt.where(NotificationModel.read_at.is_(None))
        stmt = stmt.order_by(NotificationModel.created_at.desc()).limit(limit).offset(offset)
        res = await s.execute(stmt)
        return [_to_dict(n) for n in res.scalars().all()]


async def count_unread(user_id: int) -> int:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(func.count(NotificationModel.id))
            .where(NotificationModel.recipient_user_id == user_id)
            .where(NotificationModel.read_at.is_(None))
        )
        return int(res.scalar() or 0)


async def create(
    recipient_user_id: int,
    type: str,
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    nid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        n = NotificationModel(
            id=nid, recipient_user_id=recipient_user_id, type=type,
            source_type=source_type, source_id=source_id,
            payload_json=payload, created_at=datetime.utcnow(),
        )
        s.add(n)
        await s.commit()
        return _to_dict(n)


async def mark_read(notification_id: str, user_id: int) -> bool:
    """标记为已读。返回 True 如果更新成功（防止跨用户篡改）。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(NotificationModel).where(
                NotificationModel.id == notification_id,
                NotificationModel.recipient_user_id == user_id,
            )
        )
        n = res.scalar_one_or_none()
        if not n:
            return False
        if n.read_at is None:
            n.read_at = datetime.utcnow()
            await s.commit()
        return True


async def mark_all_read(user_id: int) -> int:
    """批量标记所有未读为已读，返回处理数量。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(NotificationModel)
            .where(NotificationModel.recipient_user_id == user_id)
            .where(NotificationModel.read_at.is_(None))
        )
        rows = res.scalars().all()
        now = datetime.utcnow()
        for n in rows:
            n.read_at = now
        if rows:
            await s.commit()
        return len(rows)


async def delete(notification_id: str, user_id: int) -> bool:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(NotificationModel.id).where(
                NotificationModel.id == notification_id,
                NotificationModel.recipient_user_id == user_id,
            )
        )
        if not res.scalar_one_or_none():
            return False
        await s.execute(sa_delete(NotificationModel).where(NotificationModel.id == notification_id))
        await s.commit()
        return True
