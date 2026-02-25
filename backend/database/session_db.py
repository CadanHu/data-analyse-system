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

class SessionDatabase:
    """会话数据库基类"""
    async def init_db(self): pass
    async def create_session(self, user_id: int, title: str = None, database_key: str = 'business') -> str: pass
    async def get_all_sessions(self, user_id: int) -> List[Dict[str, Any]]: pass
    async def get_session(self, session_id: str, user_id: int) -> Optional[Dict[str, Any]]: pass
    async def delete_session(self, session_id: str, user_id: int) -> bool: pass
    async def update_session_title(self, session_id: str, user_id: int, title: str) -> bool: pass
    async def update_session_database(self, session_id: str, user_id: int, database_key: str) -> bool: pass
    async def create_message(self, message_data: Dict[str, Any]) -> str: pass
    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]: pass
    async def update_session_updated_at(self, session_id: str) -> bool: pass
    async def get_session_database(self, session_id: str) -> Optional[str]: pass

class SQLiteSessionDatabase(SessionDatabase):
    def __init__(self, db_path: Path = SESSION_DB_PATH):
        self.db_path = db_path

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    title TEXT,
                    database_key TEXT DEFAULT 'business',
                    status TEXT DEFAULT 'active',
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

    async def create_session(self, user_id: int, title: str = None, database_key: str = 'business') -> str:
        session_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO sessions (id, user_id, title, database_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, user_id, title, database_key, now, now)
            )
            await db.commit()
        return session_id

    async def get_all_sessions(self, user_id: int) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_session(self, session_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def delete_session(self, session_id: str, user_id: int) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            # 校验归属权
            async with db.execute("SELECT id FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id)) as cursor:
                if not await cursor.fetchone(): return False
            await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            await db.commit()
            return True

    async def update_session_title(self, session_id: str, user_id: int, title: str) -> bool:
        now = datetime.now().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (title, now, session_id, user_id)
            )
            await db.commit()
            return db.changes > 0

    async def update_session_database(self, session_id: str, user_id: int, database_key: str) -> bool:
        now = datetime.now().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET database_key = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (database_key, now, session_id, user_id)
            )
            await db.commit()
            return db.changes > 0

    async def update_session_updated_at(self, session_id: str) -> bool:
        now = datetime.now().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id)
            )
            await db.commit()
            return db.changes > 0

    async def get_session_database(self, session_id: str) -> Optional[str]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT database_key FROM sessions WHERE id = ?", (session_id,)) as cursor:
                row = await cursor.fetchone()
                return row["database_key"] if row else None

    async def create_message(self, message_data: Dict[str, Any]) -> str:
        message_id = message_data.get("id", str(uuid.uuid4()))
        now = datetime.now().isoformat()
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
            async with db.execute("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

class MySQLSessionDatabase(SessionDatabase):
    def __init__(self):
        self.config = {
            "host": MYSQL_HOST, "port": MYSQL_PORT, "user": MYSQL_USER, "password": MYSQL_PASSWORD,
            "db": MYSQL_SESSION_DATABASE, "autocommit": True, "charset": "utf8mb4"
        }

    async def _ensure_db_exists(self):
        conn = await aiomysql.connect(host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD)
        async with conn.cursor() as cur:
            await cur.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_SESSION_DATABASE} CHARACTER SET utf8mb4")
        conn.close()

    async def init_db(self):
        await self._ensure_db_exists()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id INT NOT NULL,
                    title VARCHAR(255),
                    database_key VARCHAR(64) DEFAULT 'business',
                    status VARCHAR(20) DEFAULT 'active',
                    created_at DATETIME,
                    updated_at DATETIME,
                    INDEX idx_user (user_id)
                ) CHARACTER SET utf8mb4
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
                    created_at DATETIME,
                    INDEX idx_session (session_id)
                ) CHARACTER SET utf8mb4
            """)
        conn.close()

    async def create_session(self, user_id: int, title: str = None, database_key: str = 'business') -> str:
        session_id = str(uuid.uuid4())
        now = datetime.now()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO sessions (id, user_id, title, database_key, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (session_id, user_id, title, database_key, now, now)
            )
        conn.close()
        return session_id

    async def get_all_sessions(self, user_id: int) -> List[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM sessions WHERE user_id = %s ORDER BY updated_at DESC", (user_id,))
            rows = await cur.fetchall()
            conn.close()
            return rows

    async def get_session(self, session_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM sessions WHERE id = %s AND user_id = %s", (session_id, user_id))
            row = await cur.fetchone()
            conn.close()
            return row

    async def delete_session(self, session_id: str, user_id: int) -> bool:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE id = %s AND user_id = %s)", (session_id, user_id))
            await cur.execute("DELETE FROM sessions WHERE id = %s AND user_id = %s", (session_id, user_id))
            affected = cur.rowcount
        conn.close()
        return affected > 0

    async def update_session_title(self, session_id: str, user_id: int, title: str) -> bool:
        now = datetime.now()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET title = %s, updated_at = %s WHERE id = %s AND user_id = %s",
                (title, now, session_id, user_id)
            )
            affected = cur.rowcount
        conn.close()
        return affected > 0

    async def update_session_database(self, session_id: str, user_id: int, database_key: str) -> bool:
        now = datetime.now()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET database_key = %s, updated_at = %s WHERE id = %s AND user_id = %s",
                (database_key, now, session_id, user_id)
            )
            affected = cur.rowcount
        conn.close()
        return affected > 0
    
    async def update_session_updated_at(self, session_id: str) -> bool:
        now = datetime.now()
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET updated_at = %s WHERE id = %s",
                (now, session_id)
            )
            affected = cur.rowcount
        conn.close()
        return affected > 0

    async def get_session_database(self, session_id: str) -> Optional[str]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT database_key FROM sessions WHERE id = %s", (session_id,))
            row = await cur.fetchone()
            conn.close()
            return row["database_key"] if row else None
            
    async def create_message(self, message_data: Dict[str, Any]) -> str:
        message_id = message_data.get("id", str(uuid.uuid4()))
        now = datetime.now()
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
            await cur.execute("SELECT * FROM messages WHERE session_id = %s ORDER BY created_at ASC", (session_id,))
            rows = await cur.fetchall()
            conn.close()
            return rows

if USE_MYSQL_FOR_SESSIONS:
    session_db = MySQLSessionDatabase()
else:
    session_db = SQLiteSessionDatabase()

# 为了兼容 chat_router.py 等文件的导入
SessionDB = session_db.__class__
