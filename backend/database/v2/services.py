"""阶段 1 的 service 层 — workspace + user_profile + notification_prefs 的最小 CRUD。

不在阶段 1 的（2FA / login_sessions / oauth_apps）表已建好，service 后续补。
"""
import uuid
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import (
    WorkspaceModel, WorkspaceMemberModel,
    UserProfileModel, UserNotificationPrefModel,
)


def _model_to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _slugify(name: str, fallback: str) -> str:
    """name → URL slug。汉字保留，空格转 -，截断 32。"""
    s = re.sub(r'\s+', '-', name.strip())
    s = re.sub(r'[/\\?#&=]', '', s)
    s = s[:32] or fallback
    return s


# ============================================================
# Workspace
# ============================================================

async def list_workspaces_for_user(user_id: int) -> List[Dict[str, Any]]:
    """列出某用户所属（作为成员）的所有工作区。"""
    async with v2_db.async_session() as s:
        stmt = (
            select(WorkspaceModel)
            .join(WorkspaceMemberModel, WorkspaceMemberModel.workspace_id == WorkspaceModel.id)
            .where(WorkspaceMemberModel.user_id == user_id)
            .order_by(WorkspaceModel.created_at)
        )
        res = await s.execute(stmt)
        return [_model_to_dict(w) for w in res.scalars().all()]


async def get_workspace(workspace_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(WorkspaceModel).where(WorkspaceModel.id == workspace_id))
        w = res.scalar_one_or_none()
        return _model_to_dict(w) if w else None


async def create_workspace(name: str, owner_user_id: int, plan_tier: str = 'free') -> Dict[str, Any]:
    """新建工作区，自动把 owner 加为 role=owner 成员。"""
    ws_id = str(uuid.uuid4())
    base_slug = _slugify(name, fallback=ws_id[:8])
    async with v2_db.async_session() as s:
        # slug 冲突：循环加后缀直到唯一（实际开发场景冲突极低）
        slug = base_slug
        suffix = 1
        while True:
            exists = await s.execute(select(WorkspaceModel.id).where(WorkspaceModel.slug == slug))
            if exists.scalar_one_or_none() is None:
                break
            suffix += 1
            slug = f"{base_slug}-{suffix}"

        ws = WorkspaceModel(
            id=ws_id, name=name, slug=slug,
            owner_user_id=owner_user_id, plan_tier=plan_tier,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        mem = WorkspaceMemberModel(
            workspace_id=ws_id, user_id=owner_user_id,
            role='owner', joined_at=datetime.utcnow(),
            invited_by_user_id=None,
        )
        s.add_all([ws, mem])
        await s.commit()
        return _model_to_dict(ws)


async def get_or_create_default_workspace(user_id: int, default_name: str = '我的工作区') -> Dict[str, Any]:
    """v2 各页面首次进入时调：拿到当前用户的默认工作区，没有就建一个。"""
    existing = await list_workspaces_for_user(user_id)
    if existing:
        return existing[0]
    return await create_workspace(default_name, owner_user_id=user_id)


async def add_member(workspace_id: str, user_id: int, role: str, invited_by: Optional[int] = None) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        # 已是成员就更新 role
        existing = await s.execute(
            select(WorkspaceMemberModel).where(
                WorkspaceMemberModel.workspace_id == workspace_id,
                WorkspaceMemberModel.user_id == user_id,
            )
        )
        mem = existing.scalar_one_or_none()
        if mem:
            mem.role = role
        else:
            mem = WorkspaceMemberModel(
                workspace_id=workspace_id, user_id=user_id,
                role=role, joined_at=datetime.utcnow(),
                invited_by_user_id=invited_by,
            )
            s.add(mem)
        await s.commit()
        return _model_to_dict(mem)


async def list_members(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(WorkspaceMemberModel).where(WorkspaceMemberModel.workspace_id == workspace_id)
        )
        return [_model_to_dict(m) for m in res.scalars().all()]


async def get_member_role(workspace_id: str, user_id: int) -> Optional[str]:
    """权限校验工具：判断 user 在 workspace 里是什么角色，None 表示不是成员。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(WorkspaceMemberModel.role).where(
                WorkspaceMemberModel.workspace_id == workspace_id,
                WorkspaceMemberModel.user_id == user_id,
            )
        )
        return res.scalar_one_or_none()


# ============================================================
# User profile (1:1 扩展资料)
# ============================================================

async def get_profile(user_id: int) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(UserProfileModel).where(UserProfileModel.user_id == user_id))
        p = res.scalar_one_or_none()
        return _model_to_dict(p) if p else None


async def upsert_profile(user_id: int, updates: Dict[str, Any]) -> Dict[str, Any]:
    """没有则创建，有则部分更新。只允许更新白名单字段，避免恶意覆盖 user_id 等。"""
    ALLOWED = {'display_name', 'role', 'team_id', 'avatar_url', 'lang', 'theme', 'density', 'shortcuts_json'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    async with v2_db.async_session() as s:
        res = await s.execute(select(UserProfileModel).where(UserProfileModel.user_id == user_id))
        p = res.scalar_one_or_none()
        if p:
            for k, v in cleaned.items():
                setattr(p, k, v)
        else:
            p = UserProfileModel(user_id=user_id, **cleaned)
            s.add(p)
        await s.commit()
        await s.refresh(p)
        return _model_to_dict(p)


# ============================================================
# Notification prefs
# ============================================================

async def list_notification_prefs(user_id: int) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(UserNotificationPrefModel).where(UserNotificationPrefModel.user_id == user_id)
        )
        return [_model_to_dict(p) for p in res.scalars().all()]


async def upsert_notification_prefs(user_id: int, prefs: List[Dict[str, Any]]) -> int:
    """批量 upsert。prefs = [{channel, event_type, enabled, dnd_start_min?, dnd_end_min?}, ...]。返回写入条数。"""
    written = 0
    async with v2_db.async_session() as s:
        for item in prefs:
            channel = item.get('channel')
            event_type = item.get('event_type')
            if not channel or not event_type:
                continue
            res = await s.execute(
                select(UserNotificationPrefModel).where(
                    UserNotificationPrefModel.user_id == user_id,
                    UserNotificationPrefModel.channel == channel,
                    UserNotificationPrefModel.event_type == event_type,
                )
            )
            existing = res.scalar_one_or_none()
            if existing:
                existing.enabled = bool(item.get('enabled', existing.enabled))
                if 'dnd_start_min' in item:
                    existing.dnd_start_min = item['dnd_start_min']
                if 'dnd_end_min' in item:
                    existing.dnd_end_min = item['dnd_end_min']
            else:
                s.add(UserNotificationPrefModel(
                    user_id=user_id,
                    channel=channel,
                    event_type=event_type,
                    enabled=bool(item.get('enabled', True)),
                    dnd_start_min=item.get('dnd_start_min'),
                    dnd_end_min=item.get('dnd_end_min'),
                ))
            written += 1
        await s.commit()
    return written
