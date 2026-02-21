"""
会话数据库操作
"""
import aiosqlite
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path

from config import SESSION_DB_PATH


class SessionDatabase:
    """会话数据库管理类"""
    
    def __init__(self, db_path: Path = SESSION_DB_PATH):
        self.db_path = db_path
    
    async def init_db(self):
        """初始化数据库表"""
        async with aiosqlite.connect(self.db_path) as db:
            # 创建会话表
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 创建消息表
            await db.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sql TEXT,
                    chart_cfg TEXT,
                    thinking TEXT,
                    data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
            """)
            # 添加新字段（如果表已存在）
            try:
                await db.execute("ALTER TABLE messages ADD COLUMN thinking TEXT")
            except Exception:
                pass
            try:
                await db.execute("ALTER TABLE messages ADD COLUMN data TEXT")
            except Exception:
                pass
            
            # 创建索引
            await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)")
            
            await db.commit()
    
    async def create_session(self, title: Optional[str] = None) -> str:
        """创建新会话"""
        session_id = str(uuid.uuid4())
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO sessions (id, title) VALUES (?, ?)",
                (session_id, title)
            )
            await db.commit()
        return session_id
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取会话详情"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sessions WHERE id = ?",
                (session_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None
    
    async def get_all_sessions(self) -> List[Dict[str, Any]]:
        """获取所有会话列表"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sessions ORDER BY updated_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
    
    async def update_session(self, session_id: str, title: str) -> bool:
        """更新会话标题"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, session_id)
            )
            await db.commit()
            return db.total_changes > 0
    
    async def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        async with aiosqlite.connect(self.db_path) as db:
            # 先删除相关消息
            await db.execute(
                "DELETE FROM messages WHERE session_id = ?",
                (session_id,)
            )
            # 再删除会话
            await db.execute(
                "DELETE FROM sessions WHERE id = ?",
                (session_id,)
            )
            await db.commit()
            return db.total_changes > 0
    
    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        sql: Optional[str] = None,
        chart_cfg: Optional[str] = None
    ) -> str:
        """添加消息"""
        message_id = str(uuid.uuid4())
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO messages (id, session_id, role, content, sql, chart_cfg) 
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (message_id, session_id, role, content, sql, chart_cfg)
            )
            # 更新会话时间
            await db.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,)
            )
            await db.commit()
        return message_id
    
    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """获取会话的所有消息"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
    
    async def get_recent_messages(self, session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """获取最近 N 条消息"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT * FROM messages 
                   WHERE session_id = ? 
                   ORDER BY created_at DESC 
                   LIMIT ?""",
                (session_id, limit)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in reversed(rows)]

    async def create_message(self, message_data: Dict[str, Any]) -> str:
        """创建消息（兼容旧接口）"""
        message_id = message_data.get("id", str(uuid.uuid4()))
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO messages (id, session_id, role, content, sql, chart_cfg, thinking, data, created_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    message_id,
                    message_data.get("session_id"),
                    message_data.get("role"),
                    message_data.get("content"),
                    message_data.get("sql"),
                    message_data.get("chart_cfg"),
                    message_data.get("thinking"),
                    message_data.get("data"),
                    message_data.get("created_at", datetime.now().isoformat())
                )
            )
            await db.commit()
        return message_id

    async def update_session_updated_at(self, session_id: str) -> bool:
        """更新会话的最后更新时间"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,)
            )
            await db.commit()
            return db.total_changes > 0
    
    async def update_session_title(self, session_id: str, title: str) -> bool:
        """更新会话标题"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, session_id)
            )
            await db.commit()
            return db.total_changes > 0


# 全局数据库实例
session_db = SessionDatabase()
SessionDB = SessionDatabase
