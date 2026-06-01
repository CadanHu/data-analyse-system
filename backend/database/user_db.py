"""
基于 SQLAlchemy 的异步用户数据库操作 (支持 MySQL/PostgreSQL)
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import Column, String, Integer, DateTime, SmallInteger, text
from sqlalchemy.future import select
from sqlalchemy.dialects.mysql import insert as mysql_insert

from .session_db import Base, session_db

class UserModel(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(String(255))
    is_active = Column(SmallInteger, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)

class VerificationCodeModel(Base):
    __tablename__ = 'verification_codes'
    email = Column(String(100), primary_key=True)
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)

class ApiTokenModel(Base):
    __tablename__ = 'api_tokens'
    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(100), nullable=False)          # 用户给 token 起的名字
    token_hash = Column(String(64), unique=True, nullable=False)  # SHA-256 hex
    scopes = Column(String(255), default="full")        # 权限范围，逗号分隔
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)        # NULL = 永不过期

class UserDatabase:
    """使用 SQLAlchemy 实现的用户数据库"""
    
    def __init__(self):
        self.async_session = session_db.async_session

    async def init_db(self):
        # 已经在 session_db.init_db() 中通过 Base.metadata.create_all 初始化
        pass

    async def create_user(self, user_data: Dict[str, Any]) -> int:
        async with self.async_session() as session:
            new_user = UserModel(
                username=user_data["username"],
                email=user_data["email"],
                password_hash=user_data["password_hash"],
                created_at=datetime.utcnow(),
                is_active=1
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)
            return new_user.id

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(select(UserModel).where(UserModel.username == username))
            u = result.scalar_one_or_none()
            return self._to_dict(u) if u else None

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(select(UserModel).where(UserModel.email == email))
            u = result.scalar_one_or_none()
            return self._to_dict(u) if u else None

    async def get_users_by_ids(self, user_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """批量按 id 查用户，返回 {id: {id, username, email, avatar_url}}。
        用于跨库场景下给只存 user_id 的表(如 v2 workspace_members)补充用户资料，
        一次 IN 查询避免 N+1。空列表直接返回 {}。"""
        if not user_ids:
            return {}
        async with self.async_session() as session:
            result = await session.execute(select(UserModel).where(UserModel.id.in_(list(set(user_ids)))))
            return {
                u.id: {'id': u.id, 'username': u.username, 'email': u.email, 'avatar_url': u.avatar_url}
                for u in result.scalars().all()
            }

    async def update_last_login(self, user_id: int):
        async with self.async_session() as session:
            result = await session.execute(select(UserModel).where(UserModel.id == user_id))
            u = result.scalar_one_or_none()
            if u:
                u.last_login = datetime.utcnow()
                await session.commit()

    async def save_verification_code(self, email: str, code: str, expires_at: datetime):
        async with self.async_session() as session:
            # 使用 MySQL 的 ON DUPLICATE KEY UPDATE 逻辑或简单的先删后加（跨库通用）
            from sqlalchemy import delete
            await session.execute(delete(VerificationCodeModel).where(VerificationCodeModel.email == email))
            new_code = VerificationCodeModel(email=email, code=code, expires_at=expires_at)
            session.add(new_code)
            await session.commit()

    async def get_verification_code(self, email: str) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(select(VerificationCodeModel).where(VerificationCodeModel.email == email))
            vc = result.scalar_one_or_none()
            return self._to_dict(vc) if vc else None

    async def create_api_token(self, user_id: int, name: str, scopes: str = "full", expires_days: Optional[int] = None) -> Dict[str, Any]:
        """生成 M2M API Token，返回明文（仅此一次）"""
        import secrets, hashlib, uuid
        from datetime import timedelta
        raw_token = "dp_" + secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(days=expires_days) if expires_days else None
        async with self.async_session() as session:
            record = ApiTokenModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                name=name,
                token_hash=token_hash,
                scopes=scopes,
                expires_at=expires_at,
            )
            session.add(record)
            await session.commit()
        return {
            "id": record.id,
            "name": name,
            "token": raw_token,   # 仅返回一次
            "scopes": scopes,
            "created_at": record.created_at.isoformat(),
            "expires_at": expires_at.isoformat() if expires_at else None,
        }

    async def get_api_token_by_hash(self, token_hash: str) -> Optional[Dict[str, Any]]:
        """通过 hash 查找 token 记录（用于鉴权）"""
        async with self.async_session() as session:
            result = await session.execute(
                select(ApiTokenModel).where(ApiTokenModel.token_hash == token_hash)
            )
            record = result.scalar_one_or_none()
            return self._to_dict(record) if record else None

    async def list_api_tokens(self, user_id: int) -> list:
        """列出用户的所有 token（不含 hash）"""
        async with self.async_session() as session:
            result = await session.execute(
                select(ApiTokenModel).where(ApiTokenModel.user_id == user_id)
                                     .order_by(ApiTokenModel.created_at.desc())
            )
            records = result.scalars().all()
            return [
                {
                    "id": r.id, "name": r.name, "scopes": r.scopes,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
                    "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                }
                for r in records
            ]

    async def revoke_api_token(self, token_id: str, user_id: int) -> bool:
        """撤销一个 token"""
        from sqlalchemy import delete
        async with self.async_session() as session:
            result = await session.execute(
                delete(ApiTokenModel).where(
                    ApiTokenModel.id == token_id,
                    ApiTokenModel.user_id == user_id
                )
            )
            await session.commit()
            return result.rowcount > 0

    async def touch_api_token(self, token_id: str):
        """更新最后使用时间"""
        async with self.async_session() as session:
            result = await session.execute(
                select(ApiTokenModel).where(ApiTokenModel.id == token_id)
            )
            record = result.scalar_one_or_none()
            if record:
                record.last_used_at = datetime.utcnow()
                await session.commit()

    def _to_dict(self, model_obj):
        if not model_obj: return None
        return {c.name: getattr(model_obj, c.name) for c in model_obj.__table__.columns}

# 全局单例
user_db = UserDatabase()
