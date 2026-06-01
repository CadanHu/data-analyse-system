"""阶段 6 — audit_logs 服务。

设计：所有 v2 写操作都该 fire-and-forget 写一条审计日志。
本阶段先提供 write/list 工具；自动审计 middleware 留到后续。
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import func

from .base import v2_db
from .models import AuditLogModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def write(
    actor_user_id: int,
    action: str,
    *,
    workspace_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    diff: Optional[Dict[str, Any]] = None,
    ip: Optional[str] = None,
    ua: Optional[str] = None,
    request_id: Optional[str] = None,
) -> str:
    """写一条审计日志。返回 log id。"""
    lid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        s.add(AuditLogModel(
            id=lid, actor_user_id=actor_user_id,
            workspace_id=workspace_id, action=action,
            target_type=target_type, target_id=target_id,
            diff_json=diff, ip=ip, ua=ua, request_id=request_id,
            created_at=datetime.utcnow(),
        ))
        await s.commit()
    return lid


async def list_logs(
    workspace_id: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    since_days: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(AuditLogModel)
        if workspace_id:
            stmt = stmt.where(AuditLogModel.workspace_id == workspace_id)
        if actor_user_id is not None:
            stmt = stmt.where(AuditLogModel.actor_user_id == actor_user_id)
        if target_type:
            stmt = stmt.where(AuditLogModel.target_type == target_type)
        if target_id:
            stmt = stmt.where(AuditLogModel.target_id == target_id)
        if since_days:
            stmt = stmt.where(AuditLogModel.created_at >= datetime.utcnow() - timedelta(days=since_days))
        stmt = stmt.order_by(AuditLogModel.created_at.desc()).limit(limit).offset(offset)
        res = await s.execute(stmt)
        return [_to_dict(l) for l in res.scalars().all()]


async def stats_by_action(workspace_id: Optional[str] = None, since_days: int = 30) -> List[Dict[str, Any]]:
    """按动作类型聚合。workspace_id 省略时统计全部(含平台级 workspace_id=null)。"""
    async with v2_db.async_session() as s:
        stmt = (
            select(AuditLogModel.action, func.count(AuditLogModel.id).label('n'))
            .where(AuditLogModel.created_at >= datetime.utcnow() - timedelta(days=since_days))
            .group_by(AuditLogModel.action)
            .order_by(func.count(AuditLogModel.id).desc())
        )
        if workspace_id:
            stmt = stmt.where(AuditLogModel.workspace_id == workspace_id)
        res = await s.execute(stmt)
        return [{'action': r[0], 'count': r[1]} for r in res.all()]
