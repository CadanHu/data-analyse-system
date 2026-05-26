"""阶段 7 — user_2fa / user_login_sessions / oauth_authorized_apps 服务。

注意：
- 2FA 真实 TOTP 验证需要 pyotp 库；这里 verify 用最小实现 (任意 6 位数字接受)，生产换 pyotp.TOTP(secret).verify(code)
- login_sessions 应该由登录链路自动写；本阶段提供 list / revoke + _seed 测试端点
- oauth_authorized_apps 同上：list + revoke + _seed
"""
import uuid
import hashlib
import secrets as _secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

import pyotp

from .base import v2_db
from .models import User2FAModel, UserLoginSessionModel, OAuthAuthorizedAppModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ============================================================
# user_2fa
# ============================================================

def _generate_totp_secret() -> str:
    """生成 base32 TOTP secret (兼容标准 Authenticator app)。"""
    return pyotp.random_base32()


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def get_2fa_status(user_id: int) -> Dict[str, Any]:
    """返回 {enabled, enabled_at, last_used_at, backup_codes_remaining}。不暴露 secret。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if not r:
            return {'enabled': False, 'enabled_at': None, 'last_used_at': None, 'backup_codes_remaining': 0}
        codes = r.backup_codes_hash or []
        return {
            'enabled': r.enabled_at is not None,
            'enabled_at': r.enabled_at,
            'last_used_at': r.last_used_at,
            'backup_codes_remaining': len(codes),
        }


async def setup_2fa(user_id: int) -> Dict[str, Any]:
    """开始设置 2FA：生成 secret + 10 个备份码。返回明文 secret + 备份码（只此一次）。

    用户需要用 authenticator app 扫码 (otpauth URL)，然后 verify_and_enable 验证一次激活码才真正启用。
    """
    secret = _generate_totp_secret()
    plain_codes = [_secrets.token_urlsafe(6)[:8] for _ in range(10)]
    hashed_codes = [_hash_code(c) for c in plain_codes]

    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if r:
            r.secret = secret
            r.backup_codes_hash = hashed_codes
            r.enabled_at = None     # 重置启用状态，要再 verify
            r.last_used_at = None
        else:
            r = User2FAModel(
                user_id=user_id, secret=secret,
                backup_codes_hash=hashed_codes,
                enabled_at=None, last_used_at=None,
            )
            s.add(r)
        await s.commit()

    return {
        'secret': secret,                        # 明文，只此一次
        'otpauth_url': f"otpauth://totp/DataPulse:{user_id}?secret={secret}&issuer=DataPulse",
        'backup_codes': plain_codes,             # 明文，只此一次
    }


async def verify_and_enable_2fa(user_id: int, code: str) -> bool:
    """验证用户提供的 TOTP 码并启用 2FA。

    用 pyotp.TOTP 真实校验 (RFC 6238)。
    valid_window=1 容忍 ±30s 时钟漂移。
    """
    if not code or not (code.isdigit() and len(code) == 6):
        return False
    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if not r:
            return False
        # 真实校验
        if not pyotp.TOTP(r.secret).verify(code, valid_window=1):
            # 失败可能也是用户用了备份码：尝试备份码消费
            return await _consume_backup_code(user_id, code)
        r.enabled_at = r.enabled_at or datetime.utcnow()
        r.last_used_at = datetime.utcnow()
        await s.commit()
        return True


async def _consume_backup_code(user_id: int, code: str) -> bool:
    """尝试消费一个备份码（用 hash 比对）。成功返回 True。"""
    code_hash = _hash_code(code)
    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if not r or not r.backup_codes_hash:
            return False
        codes = list(r.backup_codes_hash)
        if code_hash not in codes:
            return False
        codes.remove(code_hash)
        r.backup_codes_hash = codes
        r.enabled_at = r.enabled_at or datetime.utcnow()
        r.last_used_at = datetime.utcnow()
        await s.commit()
        return True


async def verify_totp_only(user_id: int, code: str) -> bool:
    """登录链路用：只验证不改 enabled_at（已启用的用户每次登录都调）。"""
    if not code or not (code.isdigit() and len(code) == 6):
        return False
    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if not r or not r.enabled_at:
            return False
        ok = pyotp.TOTP(r.secret).verify(code, valid_window=1)
        if ok:
            r.last_used_at = datetime.utcnow()
            await s.commit()
            return True
        return await _consume_backup_code(user_id, code)


async def disable_2fa(user_id: int) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(User2FAModel).where(User2FAModel.user_id == user_id))
        await s.commit()


async def regenerate_backup_codes(user_id: int) -> List[str]:
    """生成新的 10 个备份码（替换旧的）。返回明文，只此一次。"""
    plain_codes = [_secrets.token_urlsafe(6)[:8] for _ in range(10)]
    hashed_codes = [_hash_code(c) for c in plain_codes]
    async with v2_db.async_session() as s:
        res = await s.execute(select(User2FAModel).where(User2FAModel.user_id == user_id))
        r = res.scalar_one_or_none()
        if not r:
            return []
        r.backup_codes_hash = hashed_codes
        await s.commit()
    return plain_codes


# ============================================================
# user_login_sessions
# ============================================================

async def list_login_sessions(user_id: int, only_active: bool = True) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(UserLoginSessionModel).where(UserLoginSessionModel.user_id == user_id)
        if only_active:
            stmt = stmt.where(UserLoginSessionModel.revoked_at.is_(None))
        stmt = stmt.order_by(UserLoginSessionModel.last_active_at.desc())
        res = await s.execute(stmt)
        return [_to_dict(r) for r in res.scalars().all()]


async def create_login_session(
    user_id: int, ip: Optional[str] = None, ua: Optional[str] = None, device_label: Optional[str] = None,
) -> Dict[str, Any]:
    """登录链路应该自动调这个 (本阶段仅由 _seed 端点和未来 hook 用)。"""
    sid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        ses = UserLoginSessionModel(
            id=sid, user_id=user_id, ip=ip, ua=ua, device_label=device_label,
            last_active_at=datetime.utcnow(), created_at=datetime.utcnow(),
        )
        s.add(ses)
        await s.commit()
        return _to_dict(ses)


async def revoke_login_session(session_id: str, user_id: int) -> bool:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(UserLoginSessionModel).where(
                UserLoginSessionModel.id == session_id,
                UserLoginSessionModel.user_id == user_id,
            )
        )
        r = res.scalar_one_or_none()
        if not r:
            return False
        if r.revoked_at is None:
            r.revoked_at = datetime.utcnow()
            await s.commit()
        return True


async def revoke_all_other_sessions(user_id: int, keep_session_id: Optional[str] = None) -> int:
    """撤销当前用户除指定 session 外的所有会话。"""
    async with v2_db.async_session() as s:
        stmt = select(UserLoginSessionModel).where(
            UserLoginSessionModel.user_id == user_id,
            UserLoginSessionModel.revoked_at.is_(None),
        )
        res = await s.execute(stmt)
        rows = [r for r in res.scalars().all() if r.id != keep_session_id]
        now = datetime.utcnow()
        for r in rows:
            r.revoked_at = now
        if rows:
            await s.commit()
        return len(rows)


# ============================================================
# oauth_authorized_apps
# ============================================================

async def list_authorized_apps(user_id: int, only_active: bool = True) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(OAuthAuthorizedAppModel).where(OAuthAuthorizedAppModel.user_id == user_id)
        if only_active:
            stmt = stmt.where(OAuthAuthorizedAppModel.revoked_at.is_(None))
        stmt = stmt.order_by(OAuthAuthorizedAppModel.authorized_at.desc())
        res = await s.execute(stmt)
        return [_to_dict(r) for r in res.scalars().all()]


async def grant_app_authorization(
    user_id: int, client_id: str, client_name: str, scope: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """登录 OAuth 流程应该自动调这个 (本阶段仅由 _seed 端点和未来 hook 用)。"""
    aid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        # 已授权同一 client_id 时返回旧的 (UniqueConstraint(user_id, client_id))
        res = await s.execute(
            select(OAuthAuthorizedAppModel).where(
                OAuthAuthorizedAppModel.user_id == user_id,
                OAuthAuthorizedAppModel.client_id == client_id,
            )
        )
        existing = res.scalar_one_or_none()
        if existing:
            existing.client_name = client_name
            existing.scope = scope
            existing.revoked_at = None
            existing.last_used_at = datetime.utcnow()
            await s.commit()
            return _to_dict(existing)
        app = OAuthAuthorizedAppModel(
            id=aid, user_id=user_id, client_id=client_id, client_name=client_name,
            scope=scope, authorized_at=datetime.utcnow(),
            last_used_at=datetime.utcnow(),
        )
        s.add(app)
        await s.commit()
        return _to_dict(app)


async def revoke_authorized_app(app_id: str, user_id: int) -> bool:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(OAuthAuthorizedAppModel).where(
                OAuthAuthorizedAppModel.id == app_id,
                OAuthAuthorizedAppModel.user_id == user_id,
            )
        )
        r = res.scalar_one_or_none()
        if not r:
            return False
        if r.revoked_at is None:
            r.revoked_at = datetime.utcnow()
            await s.commit()
        return True
