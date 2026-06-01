"""阶段 4 — 分享 (share_links + share_grants) CRUD。

权限模型:
- 只有 target 的 owner 才能创建 / revoke link
- 通过 token 公开访问的 endpoint 由路由层用 get_share_by_token 解析
- share_grants 让指定 user 获得 permission
"""
import uuid
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import ShareLinkModel, ShareGrantModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _gen_token() -> str:
    """生成 URL-safe 32 字节 token。"""
    return secrets.token_urlsafe(32)


# ============================================================
# share_links
# ============================================================

async def list_share_links(
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    created_by: Optional[int] = None,
) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(ShareLinkModel)
        if target_type:
            stmt = stmt.where(ShareLinkModel.target_type == target_type)
        if target_id:
            stmt = stmt.where(ShareLinkModel.target_id == target_id)
        if created_by is not None:
            stmt = stmt.where(ShareLinkModel.created_by == created_by)
        stmt = stmt.order_by(ShareLinkModel.created_at.desc())
        res = await s.execute(stmt)
        return [_to_dict(r) for r in res.scalars().all()]


async def get_share_by_token(token: str) -> Optional[Dict[str, Any]]:
    """通过 token 解析分享链接（公开 endpoint 用，不需要登录）。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(ShareLinkModel).where(ShareLinkModel.token == token))
        link = res.scalar_one_or_none()
        if not link:
            return None
        # 撤销 / 过期
        if link.revoked_at is not None:
            return None
        if link.expires_at and link.expires_at < datetime.utcnow():
            return None
        return _to_dict(link)


async def create_share_link(
    target_type: str,
    target_id: str,
    created_by: int,
    permission: str = 'view',
    expires_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    if target_type not in ('session', 'board', 'node'):
        raise ValueError(f"unsupported target_type: {target_type}")
    if permission not in ('view', 'comment', 'edit'):
        raise ValueError(f"unsupported permission: {permission}")
    sid = str(uuid.uuid4())
    token = _gen_token()
    async with v2_db.async_session() as s:
        link = ShareLinkModel(
            id=sid, target_type=target_type, target_id=target_id,
            token=token, permission=permission, expires_at=expires_at,
            created_by=created_by, created_at=datetime.utcnow(),
        )
        s.add(link)
        await s.commit()
        return _to_dict(link)


async def revoke_share_link(link_id: str) -> None:
    async with v2_db.async_session() as s:
        res = await s.execute(select(ShareLinkModel).where(ShareLinkModel.id == link_id))
        link = res.scalar_one_or_none()
        if link and link.revoked_at is None:
            link.revoked_at = datetime.utcnow()
            await s.commit()


async def delete_share_link(link_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(ShareLinkModel).where(ShareLinkModel.id == link_id))
        await s.commit()


# ============================================================
# share_grants
# ============================================================

async def list_grants(target_type: str, target_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ShareGrantModel)
            .where(ShareGrantModel.target_type == target_type)
            .where(ShareGrantModel.target_id == target_id)
            .order_by(ShareGrantModel.granted_at.desc())
        )
        return [_to_dict(g) for g in res.scalars().all()]


async def upsert_grant(
    target_type: str,
    target_id: str,
    user_id: int,
    permission: str,
    granted_by: int,
) -> Dict[str, Any]:
    """已有则更新权限，没有则新建。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ShareGrantModel).where(
                ShareGrantModel.target_type == target_type,
                ShareGrantModel.target_id == target_id,
                ShareGrantModel.user_id == user_id,
            )
        )
        g = res.scalar_one_or_none()
        if g:
            g.permission = permission
            g.granted_by = granted_by
        else:
            g = ShareGrantModel(
                id=str(uuid.uuid4()),
                target_type=target_type, target_id=target_id,
                user_id=user_id, permission=permission,
                granted_by=granted_by, granted_at=datetime.utcnow(),
            )
            s.add(g)
        await s.commit()
        return _to_dict(g)


async def remove_grant(grant_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(ShareGrantModel).where(ShareGrantModel.id == grant_id))
        await s.commit()


async def grants_for_user(user_id: int) -> List[Dict[str, Any]]:
    """某用户被授权访问的所有 target — 用于 "share/inbox" 视图。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ShareGrantModel)
            .where(ShareGrantModel.user_id == user_id)
            .order_by(ShareGrantModel.granted_at.desc())
        )
        return [_to_dict(g) for g in res.scalars().all()]
