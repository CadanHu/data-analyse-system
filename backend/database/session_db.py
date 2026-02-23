"""
会话数据库操作 - 支持 SQLite 和 MySQL
"""
import aiosqlite
import aiomysql
import uuid
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path

from config import (
    SESSION_DB_PATH, USE_MYSQL_FOR_SESSIONS,
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_SESSION_DATABASE
)


def get_now_iso():
    """获取当前时间的 ISO 格式字符串 (本地时间 + 时区偏移)"""
    # 显式加上北京时间 +08:00 偏移，防止前端误判为 UTC
    return datetime.now().replace(microsecond=0).isoformat() + "+08:00"


class SQLiteSessionDatabase:
    """SQLite 会话数据库管理类"""
    
    def __init__(self, db_path: Path = SESSION_DB_PATH):
        self.db_path = db_path
    
    async def init_db(self):
        """初始化数据库表"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    database_key TEXT DEFAULT 'business',
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
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
                    created_at TEXT,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
            """)
            await db.commit()
    
    async def create_session(self, title: Optional[str] = None, database_key: Optional[str] = 'business') -> str:
        session_id = str(uuid.uuid4())
        now = get_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO sessions (id, title, database_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (session_id, title, database_key, now, now)
            )
            await db.commit()
        return session_id
    
    async def set_session_database(self, session_id: str, database_key: str) -> bool:
        now = get_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET database_key = ?, updated_at = ? WHERE id = ?",
                (database_key, now, session_id)
            )
            await db.commit()
            return db.total_changes > 0

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_all_sessions(self) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sessions ORDER BY updated_at DESC") as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_session_database(self, session_id: str) -> Optional[str]:
        session = await self.get_session(session_id)
        return session.get("database_key") if session else None

    async def update_session_title(self, session_id: str, title: str) -> bool:
        now = get_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, session_id)
            )
            await db.commit()
            return db.total_changes > 0

    async def delete_session(self, session_id: str) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            await db.commit()
            return True

    async def create_message(self, message_data: Dict[str, Any]) -> str:
        message_id = message_data.get("id", str(uuid.uuid4()))
        now = message_data.get("created_at", get_now_iso())
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO messages (id, session_id, role, content, sql, chart_cfg, thinking, data, created_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    message_id, message_data.get("session_id"), message_data.get("role"),
                    message_data.get("content"), message_data.get("sql"), message_data.get("chart_cfg"),
                    message_data.get("thinking"), message_data.get("data"), now
                )
            )
            await db.commit()
        return message_id

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def update_session_updated_at(self, session_id: str) -> bool:
        now = get_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
            await db.commit()
            return True


class MySQLSessionDatabase:
    """MySQL 会话数据库管理类"""
    
    def __init__(self):
        self.config = {
            "host": MYSQL_HOST,
            "port": MYSQL_PORT,
            "user": MYSQL_USER,
            "password": MYSQL_PASSWORD,
            "db": MYSQL_SESSION_DATABASE,
            "autocommit": True,
            "charset": "utf8mb4"
        }

    async def _ensure_db_exists(self):
        """确保数据库存在并使用 utf8mb4"""
        conn = await aiomysql.connect(
            host=MYSQL_HOST, port=MYSQL_PORT,
            user=MYSQL_USER, password=MYSQL_PASSWORD
        )
        async with conn.cursor() as cur:
            await cur.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_SESSION_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.close()

    async def init_db(self):
        await self._ensure_db_exists()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(255),
                    database_key VARCHAR(64) DEFAULT 'business',
                    created_at VARCHAR(64),
                    updated_at VARCHAR(64)
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """)
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(64) NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    content TEXT NOT NULL,
                    `sql` TEXT,
                    chart_cfg TEXT,
                    thinking TEXT,
                    `data` TEXT,
                    created_at VARCHAR(64),
                    INDEX idx_session (session_id)
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """)
        conn.close()

    async def create_session(self, title: Optional[str] = None, database_key: Optional[str] = 'business') -> str:
        session_id = str(uuid.uuid4())
        now = get_now_iso()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO sessions (id, title, database_key, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
                (session_id, title, database_key, now, now)
            )
        conn.close()
        return session_id

    async def set_session_database(self, session_id: str, database_key: str) -> bool:
        now = get_now_iso()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET database_key = %s, updated_at = %s WHERE id = %s",
                (database_key, now, session_id)
            )
            affected = cur.rowcount
        conn.close()
        return affected > 0

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM sessions WHERE id = %s", (session_id,))
            row = await cur.fetchone()
            conn.close()
            return row

    async def get_all_sessions(self) -> List[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM sessions ORDER BY updated_at DESC")
            rows = await cur.fetchall()
            conn.close()
            return rows

    async def get_session_database(self, session_id: str) -> Optional[str]:
        session = await self.get_session(session_id)
        return session.get("database_key") if session else None

    async def update_session_title(self, session_id: str, title: str) -> bool:
        now = get_now_iso()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET title = %s, updated_at = %s WHERE id = %s",
                (title, now, session_id)
            )
            affected = cur.rowcount
        conn.close()
        return affected > 0

    async def delete_session(self, session_id: str) -> bool:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM messages WHERE session_id = %s", (session_id,))
            await cur.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
        conn.close()
        return True

    async def create_message(self, message_data: Dict[str, Any]) -> str:
        message_id = message_data.get("id", str(uuid.uuid4()))
        now = message_data.get("created_at", get_now_iso())
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO messages (id, session_id, role, content, `sql`, chart_cfg, thinking, `data`, created_at) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    message_id, message_data.get("session_id"), message_data.get("role"),
                    message_data.get("content"), message_data.get("sql"), message_data.get("chart_cfg"),
                    message_data.get("thinking"), message_data.get("data"), now
                )
            )
        conn.close()
        return message_id

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT * FROM messages WHERE session_id = %s ORDER BY created_at ASC",
                (session_id,)
            )
            rows = await cur.fetchall()
            conn.close()
            return rows

    async def update_session_updated_at(self, session_id: str) -> bool:
        now = get_now_iso()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("UPDATE sessions SET updated_at = %s WHERE id = %s", (now, session_id))
        conn.close()
        return True


# 根据配置选择数据库实例
if USE_MYSQL_FOR_SESSIONS:
    print(f"🚀 使用 MySQL 存储会话: {MYSQL_SESSION_DATABASE}")
    session_db = MySQLSessionDatabase()
else:
    print("🚀 使用 SQLite 存储会话")
    session_db = SQLiteSessionDatabase()

SessionDB = session_db.__class__
