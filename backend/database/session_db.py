"""
基于 SQLAlchemy 的异步会话数据库操作 (支持 MySQL/PostgreSQL)
"""
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, text, Index
from sqlalchemy.future import select
from sqlalchemy import delete as sqlalchemy_delete

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_SESSION_DATABASE
)

Base = declarative_base()

class SessionModel(Base):
    __tablename__ = 'sessions'
    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, nullable=False)
    title = Column(String(255))
    database_key = Column(String(64), default='business')
    status = Column(String(20), default='active')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (Index('idx_user', 'user_id'),)

class MessageModel(Base):
    __tablename__ = 'messages'
    id = Column(String(64), primary_key=True)
    session_id = Column(String(64), ForeignKey('sessions.id'), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    sql = Column(Text)
    chart_cfg = Column(Text)
    thinking = Column(Text)
    data = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_session', 'session_id'),)

class SessionDatabase:
    """使用 SQLAlchemy 实现的会话数据库"""
    
    def __init__(self):
        # 默认使用 MySQL 驱动
        self.url = f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_SESSION_DATABASE}?charset=utf8mb4"
        self.engine = create_async_engine(self.url, echo=False)
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def _ensure_db_exists(self):
        """确保数据库存在 (MySQL 特有逻辑)"""
        import pymysql
        conn = pymysql.connect(host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD)
        try:
            with conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_SESSION_DATABASE} CHARACTER SET utf8mb4")
            conn.commit()
        finally:
            conn.close()

    async def init_db(self):
        """初始化表结构"""
        await self._ensure_db_exists()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print(f"✅ 会话数据库已通过 SQLAlchemy 初始化: {MYSQL_SESSION_DATABASE}")

    async def create_session(self, user_id: int, title: str = None, database_key: str = 'classic_business') -> str:
        session_id = str(uuid.uuid4())
        async with self.async_session() as session:
            new_session = SessionModel(
                id=session_id,
                user_id=user_id,
                title=title,
                database_key=database_key,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            session.add(new_session)
            await session.commit()
        return session_id

    async def get_all_sessions(self, user_id: int) -> List[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(SessionModel).where(SessionModel.user_id == user_id).order_by(SessionModel.updated_at.desc())
            )
            sessions = result.scalars().all()
            return [self._to_dict(s) for s in sessions]

    async def get_session(self, session_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user_id)
            )
            s = result.scalar_one_or_none()
            return self._to_dict(s) if s else None

    async def delete_session(self, session_id: str, user_id: int) -> bool:
        async with self.async_session() as session:
            # 校验权限
            res = await session.execute(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user_id))
            if not res.scalar_one_or_none():
                return False
            
            # 删除消息和会话
            await session.execute(sqlalchemy_delete(MessageModel).where(MessageModel.session_id == session_id))
            await session.execute(sqlalchemy_delete(SessionModel).where(SessionModel.id == session_id))
            await session.commit()
            return True

    async def update_session_title(self, session_id: str, user_id: int, title: str) -> bool:
        async with self.async_session() as session:
            result = await session.execute(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user_id))
            s = result.scalar_one_or_none()
            if s:
                s.title = title
                s.updated_at = datetime.utcnow()
                await session.commit()
                return True
            return False

    async def update_session_database(self, session_id: str, user_id: int, database_key: str) -> bool:
        async with self.async_session() as session:
            result = await session.execute(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user_id))
            s = result.scalar_one_or_none()
            if s:
                s.database_key = database_key
                s.updated_at = datetime.utcnow()
                await session.commit()
                return True
            return False

    async def update_session_updated_at(self, session_id: str) -> bool:
        async with self.async_session() as session:
            result = await session.execute(select(SessionModel).where(SessionModel.id == session_id))
            s = result.scalar_one_or_none()
            if s:
                s.updated_at = datetime.utcnow()
                await session.commit()
                return True
            return False

    async def get_session_database(self, session_id: str) -> Optional[str]:
        async with self.async_session() as session:
            result = await session.execute(select(SessionModel.database_key).where(SessionModel.id == session_id))
            return result.scalar_one_or_none()

    async def create_message(self, message_data: Dict[str, Any]) -> str:
        message_id = message_data.get("id", str(uuid.uuid4()))
        async with self.async_session() as session:
            new_msg = MessageModel(
                id=message_id,
                session_id=message_data.get("session_id"),
                role=message_data.get("role"),
                content=message_data.get("content"),
                sql=message_data.get("sql"),
                chart_cfg=message_data.get("chart_cfg"),
                thinking=message_data.get("thinking"),
                data=message_data.get("data"),
                created_at=datetime.utcnow()
            )
            session.add(new_msg)
            # 同时更新会话的 updated_at
            stmt = select(SessionModel).where(SessionModel.id == message_data.get("session_id"))
            res = await session.execute(stmt)
            s = res.scalar_one_or_none()
            if s:
                s.updated_at = datetime.utcnow()
            
            await session.commit()
        return message_id

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(MessageModel).where(MessageModel.session_id == session_id).order_by(MessageModel.created_at.asc())
            )
            messages = result.scalars().all()
            return [self._to_dict(m) for m in messages]

    def _to_dict(self, model_obj):
        if not model_obj: return None
        return {c.name: getattr(model_obj, c.name) for c in model_obj.__table__.columns}

# 全局单例
session_db = SessionDatabase()
# 导出类名供其他模块引用
SessionDB = SessionDatabase
