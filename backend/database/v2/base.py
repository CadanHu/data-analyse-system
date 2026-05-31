"""v2 数据库连接 / engine / init_db。

复刻 backend/database/session_db.py 的 SessionDatabase 模式，但指向独立物理库 MYSQL_V2_DATABASE。
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_V2_DATABASE
)
from utils.json_utils import json_dumps

V2Base = declarative_base()


class V2Database:
    """v2 库连接管理 (data_pulse_v2)。"""

    def __init__(self):
        self.url = (
            f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
            f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_V2_DATABASE}?charset=utf8mb4"
        )
        # 复用 session_db.py 的连接池规模
        # json_serializer=json_dumps:让 JSON 列序列化时能处理 date/Decimal/numpy 等类型
        # (默认 json.dumps 碰到 date 会抛 TypeError;SQL 查询返回的 row 经常带 date)
        self.engine = create_async_engine(
            self.url,
            echo=False,
            pool_recycle=3600,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_timeout=60,
            json_serializer=json_dumps,
        )
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def _ensure_db_exists(self):
        """MySQL 特有：连接前先确保库存在。"""
        import pymysql
        conn = pymysql.connect(
            host=MYSQL_HOST, port=MYSQL_PORT,
            user=MYSQL_USER, password=MYSQL_PASSWORD,
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"CREATE DATABASE IF NOT EXISTS {MYSQL_V2_DATABASE} CHARACTER SET utf8mb4"
                )
            conn.commit()
        finally:
            conn.close()

    # 轻量加列迁移表：create_all 只建缺失的表，不会给已存在的表补列。
    # 每项 = (表名, 列名, ALTER 后半段 DDL)。幂等：列已存在则跳过。
    # NOT NULL DEFAULT 会自动回填现有行，无需单独 UPDATE。
    _COLUMN_MIGRATIONS = [
        ('alert_rules', 'dedupe_minutes', 'INT NOT NULL DEFAULT 5'),
    ]

    async def _ensure_columns(self, conn):
        """对 _COLUMN_MIGRATIONS 里每列查 information_schema，缺则 ALTER TABLE ADD COLUMN。"""
        from sqlalchemy import text
        for table, column, ddl in self._COLUMN_MIGRATIONS:
            exists = await conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_schema = :db AND table_name = :t AND column_name = :c"
                ),
                {'db': MYSQL_V2_DATABASE, 't': table, 'c': column},
            )
            if exists.first() is None:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                print(f"  ↳ [v2 migrate] {table}.{column} 已补建 ({ddl})")

    async def init_db(self):
        """建库 + create_all 所有 v2 表 + 轻量加列迁移。"""
        try:
            await self._ensure_db_exists()
            # import models 模块触发 V2Base.metadata 注册
            from . import models  # noqa: F401
            async with self.engine.begin() as conn:
                await conn.run_sync(V2Base.metadata.create_all)
                await self._ensure_columns(conn)
            print(f"✅ v2 数据库初始化完成: {MYSQL_V2_DATABASE}")
        except Exception as e:
            print(f"⚠️ [v2 警告] 初始化 v2 数据库失败，MySQL 可能未启动。v2 功能受限: {e}")


v2_db = V2Database()
