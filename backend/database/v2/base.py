"""v2 数据库连接 / engine / init_db。

复刻 backend/database/session_db.py 的 SessionDatabase 模式，但指向独立物理库 MYSQL_V2_DATABASE。
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_V2_DATABASE
)

V2Base = declarative_base()


class V2Database:
    """v2 库连接管理 (data_pulse_v2)。"""

    def __init__(self):
        self.url = (
            f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
            f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_V2_DATABASE}?charset=utf8mb4"
        )
        # 复用 session_db.py 的连接池规模
        self.engine = create_async_engine(
            self.url,
            echo=False,
            pool_recycle=3600,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_timeout=60,
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

    async def init_db(self):
        """建库 + create_all 所有 v2 表。"""
        try:
            await self._ensure_db_exists()
            # import models 模块触发 V2Base.metadata 注册
            from . import models  # noqa: F401
            async with self.engine.begin() as conn:
                await conn.run_sync(V2Base.metadata.create_all)
            print(f"✅ v2 数据库初始化完成: {MYSQL_V2_DATABASE}")
        except Exception as e:
            print(f"⚠️ [v2 警告] 初始化 v2 数据库失败，MySQL 可能未启动。v2 功能受限: {e}")


v2_db = V2Database()
