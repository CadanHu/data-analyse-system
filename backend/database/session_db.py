"""
基于 SQLAlchemy 的异步会话数据库操作 (支持 MySQL/PostgreSQL)
"""
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, text, Index, Boolean
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
    
    # 🚀 模式持久化字段
    enable_data_science = Column(Boolean, default=False)
    enable_thinking = Column(Boolean, default=False)
    enable_rag = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (Index('idx_user', 'user_id'),)

class MessageModel(Base):
    __tablename__ = 'messages'
    id = Column(String(64), primary_key=True)
    session_id = Column(String(64), ForeignKey('sessions.id'), nullable=False)
    parent_id = Column(String(64), nullable=True) # 父消息 ID，用于支持对话分支
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    sql = Column(Text)
    chart_cfg = Column(Text)
    thinking = Column(Text)
    data = Column(Text)
    is_current = Column(Integer, default=1) # 1 为当前活跃分支，0 为历史分支
    feedback = Column(Integer, default=0)   # 1: 点赞, -1: 点踩
    feedback_text = Column(Text, nullable=True) # 问题反馈内容
    tokens_prompt = Column(Integer, default=0) # 提问消耗 Token
    tokens_completion = Column(Integer, default=0) # 回答消耗 Token
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_session', 'session_id'),)

class SessionDatabase:
    """使用 SQLAlchemy 实现的会话数据库"""
    
    def __init__(self):
        # 默认使用 MySQL 驱动
        self.url = f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_SESSION_DATABASE}?charset=utf8mb4"
        # 增加连接池优化参数
        self.engine = create_async_engine(
            self.url, 
            echo=False,
            pool_recycle=3600,
            pool_pre_ping=True,
            pool_size=20,       # 增大至 20
            max_overflow=40,    # 增大至 40
            pool_timeout=60     # 等待连接超时增加到 60s
        )
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
        print(f"✅ 会话数据库初始化完成: {MYSQL_SESSION_DATABASE}")

    async def update_message_feedback(self, message_id: str, feedback: int, feedback_text: str = None) -> bool:
        """更新消息反馈"""
        async with self.async_session() as session:
            result = await session.execute(select(MessageModel).where(MessageModel.id == message_id))
            m = result.scalar_one_or_none()
            if m:
                m.feedback = feedback
                if feedback_text is not None:
                    m.feedback_text = feedback_text
                await session.commit()
                return True
            return False

    async def create_session(self, user_id: int, title: str = None, database_key: str = 'classic_business') -> str:
        session_id = str(uuid.uuid4())
        
        # 🚀 核心优化：后端自动处理重名序号
        if not title or title == "新会话":
            prefix = "新会话"
            async with self.async_session() as session:
                # 查找当前用户所有以 "新会话" 开头的标题
                result = await session.execute(
                    select(SessionModel.title).where(
                        SessionModel.user_id == user_id,
                        SessionModel.title.like(f"{prefix}%")
                    )
                )
                existing_titles = result.scalars().all()
                
                if not existing_titles:
                    title = prefix
                else:
                    # 提取数字后缀并找最大值
                    import re
                    nums = [0]
                    for t in existing_titles:
                        if t == prefix: nums.append(0)
                        else:
                            match = re.search(r"-(\d+)$", t)
                            if match: nums.append(int(match.group(1)))
                    
                    max_num = max(nums)
                    title = f"{prefix}-{max_num + 1}"

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

    async def update_session_modes(self, session_id: str, user_id: int, modes: Dict[str, bool]) -> bool:
        """更新会话模式 (科学家、思考、知识库)"""
        async with self.async_session() as session:
            result = await session.execute(
                select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user_id)
            )
            s = result.scalar_one_or_none()
            if s:
                if 'enable_data_science' in modes:
                    s.enable_data_science = modes['enable_data_science']
                if 'enable_thinking' in modes:
                    s.enable_thinking = modes['enable_thinking']
                if 'enable_rag' in modes:
                    s.enable_rag = modes['enable_rag']
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
        parent_id = message_data.get("parent_id")
        session_id = message_data.get("session_id")
        
        async with self.async_session() as session:
            # 分支功能优化逻辑：
            if parent_id:
                # 检查该 parent_id 是否已经有了子节点
                # 如果有了子节点，说明现在是在“旧位置”重新提问，产生了分叉
                result = await session.execute(
                    text("SELECT id FROM messages WHERE parent_id = :pid LIMIT 1"),
                    {"pid": parent_id}
                )
                has_existing_children = result.scalar_one_or_none() is not None
                
                if has_existing_children:
                    # 只有在产生分叉时，才需要切换活跃路径
                    # 将该 session 下所有消息设为 0，然后我们会在后面重新激活从根到当前的路径
                    # (由于递归更新比较复杂，这里采用简单策略：在切换分支时处理)
                    # 此时先标记所有为 0，确保新消息及其祖先是活跃的
                    await session.execute(
                        text("UPDATE messages SET is_current = 0 WHERE session_id = :sid"),
                        {"sid": session_id}
                    )
                    
                    # 递归激活祖先节点
                    curr_p_id = parent_id
                    while curr_p_id:
                        await session.execute(
                            text("UPDATE messages SET is_current = 1 WHERE id = :id"),
                            {"id": curr_p_id}
                        )
                        # 查找上一级
                        p_res = await session.execute(
                            text("SELECT parent_id FROM messages WHERE id = :id"),
                            {"id": curr_p_id}
                        )
                        curr_p_id = p_res.scalar_one_or_none()
                # 如果没有子节点，说明是正常对话延续，不需要执行任何 UPDATE，保持原样即可

            new_msg = MessageModel(
                id=message_id,
                session_id=session_id,
                parent_id=parent_id,
                role=message_data.get("role"),
                content=message_data.get("content"),
                sql=message_data.get("sql"),
                chart_cfg=message_data.get("chart_cfg"),
                thinking=message_data.get("thinking"),
                data=message_data.get("data"),
                is_current=1, # 新消息始终是活跃的
                created_at=datetime.utcnow()
            )
            session.add(new_msg)
            
            # 同时更新会话的 updated_at
            stmt = select(SessionModel).where(SessionModel.id == session_id)
            res = await session.execute(stmt)
            s = res.scalar_one_or_none()
            if s:
                s.updated_at = datetime.utcnow()
            
            await session.commit()
        return message_id

    async def get_messages(self, session_id: str, all_branches: bool = False) -> List[Dict[str, Any]]:
        """获取消息列表。默认仅获取当前活跃分支的消息链。"""
        async with self.async_session() as session:
            if all_branches:
                # 获取该会话下的所有消息，用于前端构建树
                query = select(MessageModel).where(
                    MessageModel.session_id == session_id
                ).order_by(MessageModel.created_at.asc())
            else:
                # 默认只获取 is_current=1 的当前活跃分支消息
                query = select(MessageModel).where(
                    MessageModel.session_id == session_id,
                    MessageModel.is_current == 1
                ).order_by(MessageModel.created_at.asc())
            
            result = await session.execute(query)
            messages = result.scalars().all()
            return [self._to_dict(m) for m in messages]

    async def activate_branch(self, session_id: str, message_ids: List[str]) -> bool:
        """激活指定的消息链分支，并自动激活该分支下的后续对话。"""
        async with self.async_session() as session:
            # 1. 全部设为非活跃
            await session.execute(
                text("UPDATE messages SET is_current = 0 WHERE session_id = :sid"),
                {"sid": session_id}
            )
            # 2. 激活指定的路径 (祖先 -> 当前节点)
            if message_ids:
                await session.execute(
                    text("UPDATE messages SET is_current = 1 WHERE id IN :ids"),
                    {"ids": tuple(message_ids)}
                )
                
                # 3. 核心修复：自动激活“当前节点”之下的所有后代
                # 我们沿着 parent_id 链条向下找，每次选择最新创建的子节点激活
                last_id = message_ids[-1]
                while True:
                    res = await session.execute(
                        text("SELECT id FROM messages WHERE parent_id = :pid ORDER BY created_at DESC LIMIT 1"),
                        {"pid": last_id}
                    )
                    child = res.fetchone()
                    if child:
                        child_id = child[0]
                        await session.execute(
                            text("UPDATE messages SET is_current = 1 WHERE id = :id"),
                            {"id": child_id}
                        )
                        last_id = child_id
                    else:
                        break
                        
            await session.commit()
            return True

    def _to_dict(self, model_obj):
        if not model_obj: return None
        return {c.name: getattr(model_obj, c.name) for c in model_obj.__table__.columns}

# 全局单例
session_db = SessionDatabase()
# 导出类名供其他模块引用
SessionDB = SessionDatabase
