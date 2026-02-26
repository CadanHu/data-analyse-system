"""
基于 SQLAlchemy 的异步用户数据库操作 (支持 MySQL/PostgreSQL)
"""
from datetime import datetime
from typing import Optional, Dict, Any
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

    def _to_dict(self, model_obj):
        if not model_obj: return None
        return {c.name: getattr(model_obj, c.name) for c in model_obj.__table__.columns}

# 全局单例
user_db = UserDatabase()
