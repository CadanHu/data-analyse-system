"""
用户数据库操作 - 支持 SQLite 和 MySQL
"""
import aiosqlite
import aiomysql
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

from config import (
    SESSION_DB_PATH, USE_MYSQL_FOR_SESSIONS,
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_SESSION_DATABASE
)

class UserDatabase:
    """用户数据库基类"""
    async def init_db(self):
        pass
    async def create_user(self, user_data: Dict[str, Any]) -> int:
        pass
    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        pass
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        pass
    async def update_last_login(self, user_id: int):
        pass
    async def save_verification_code(self, email: str, code: str, expires_at: datetime):
        pass
    async def get_verification_code(self, email: str) -> Optional[Dict[str, Any]]:
        pass

class SQLiteUserDatabase(UserDatabase):
    def __init__(self, db_path: Path = SESSION_DB_PATH):
        self.db_path = db_path

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    avatar_url TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT,
                    last_login TEXT
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS verification_codes (
                    email TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
            """)
            await db.commit()

    async def create_user(self, user_data: Dict[str, Any]) -> int:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "INSERT INTO users (username, email, password_hash, created_at, is_active) VALUES (?, ?, ?, ?, ?)",
                (user_data["username"], user_data["email"], user_data["password_hash"], datetime.now().isoformat(), 1)
            )
            await db.commit()
            return cursor.lastrowid

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE username = ?", (username,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_last_login(self, user_id: int):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("UPDATE users SET last_login = ? WHERE id = ?", (datetime.now().isoformat(), user_id))
            await db.commit()

    async def save_verification_code(self, email: str, code: str, expires_at: datetime):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)",
                (email, code, expires_at.isoformat())
            )
            await db.commit()

    async def get_verification_code(self, email: str) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM verification_codes WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

class MySQLUserDatabase(UserDatabase):
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

    async def init_db(self):
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    avatar_url VARCHAR(255),
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME,
                    last_login DATETIME
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """)
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS verification_codes (
                    email VARCHAR(100) PRIMARY KEY,
                    code VARCHAR(10) NOT NULL,
                    expires_at DATETIME NOT NULL
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """)
        conn.close()

    async def create_user(self, user_data: Dict[str, Any]) -> int:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO users (username, email, password_hash, created_at, is_active) VALUES (%s, %s, %s, %s, %s)",
                (user_data["username"], user_data["email"], user_data["password_hash"], datetime.now(), 1)
            )
            user_id = cur.lastrowid
        conn.close()
        return user_id

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            row = await cur.fetchone()
            conn.close()
            return row

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            row = await cur.fetchone()
            conn.close()
            return row

    async def update_last_login(self, user_id: int):
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute("UPDATE users SET last_login = %s WHERE id = %s", (datetime.now(), user_id))
        conn.close()

    async def save_verification_code(self, email: str, code: str, expires_at: datetime):
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO verification_codes (email, code, expires_at) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE code=%s, expires_at=%s",
                (email, code, expires_at, code, expires_at)
            )
        conn.close()

    async def get_verification_code(self, email: str) -> Optional[Dict[str, Any]]:
        conn = await aiomysql.connect(**self.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM verification_codes WHERE email = %s", (email,))
            row = await cur.fetchone()
            conn.close()
            return row

# 根据配置选择数据库实例
if USE_MYSQL_FOR_SESSIONS:
    user_db = MySQLUserDatabase()
else:
    user_db = SQLiteUserDatabase()
