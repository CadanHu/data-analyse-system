"""
用户数据源管理 - CRUD + Fernet 密码加密
"""
import uuid
import hashlib
import base64
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, text, Index
from sqlalchemy.future import select

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD,
    MYSQL_SESSION_DATABASE, SECRET_KEY
)

Base = declarative_base()


def _get_fernet():
    """从 SECRET_KEY 派生 Fernet 对称加密实例"""
    from cryptography.fernet import Fernet
    # SHA-256 → 32 bytes → base64url → Fernet key
    key_bytes = hashlib.sha256(SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_password(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(enc: str) -> str:
    return _get_fernet().decrypt(enc.encode()).decode()


class UserDatasourceModel(Base):
    __tablename__ = 'user_datasources'
    id          = Column(String(64),  primary_key=True)
    user_id     = Column(Integer,     nullable=False)
    name        = Column(String(255), nullable=False)           # 用户自定义显示名
    type        = Column(String(32),  nullable=False)           # mysql / postgresql
    host        = Column(String(255), nullable=False)
    port        = Column(Integer,     nullable=False)
    db_name     = Column(String(255), nullable=False)           # 数据库名
    username    = Column(String(255), nullable=False)
    password_enc = Column(Text,       nullable=False)           # Fernet 加密
    description = Column(Text,        nullable=True)
    created_at  = Column(DateTime,    default=datetime.utcnow)
    updated_at  = Column(DateTime,    default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index('idx_ds_user', 'user_id'),)


class DatasourceDB:
    def __init__(self):
        url = (
            f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
            f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_SESSION_DATABASE}?charset=utf8mb4"
        )
        self.engine = create_async_engine(
            url, echo=False, pool_recycle=3600, pool_pre_ping=True
        )
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def init_db(self):
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("✅ 数据源表初始化完成")
        except Exception as e:
            print(f"⚠️ [DatasourceDB] 初始化失败，将继续运行: {e}")

    # ── 内部：把 ORM 对象转为对外 dict（密码脱敏）─────────────────────────────
    @staticmethod
    def _to_dict(row: UserDatasourceModel, mask_password: bool = True) -> Dict[str, Any]:
        return {
            "id":          row.id,
            "user_id":     row.user_id,
            "name":        row.name,
            "type":        row.type,
            "host":        row.host,
            "port":        row.port,
            "db_name":     row.db_name,
            "username":    row.username,
            "password":    "***" if mask_password else decrypt_password(row.password_enc),
            "description": row.description,
            "db_key":      f"user_ds_{row.id}",
            "created_at":  row.created_at.isoformat() if row.created_at else None,
            "updated_at":  row.updated_at.isoformat() if row.updated_at else None,
        }

    # ── 创建 ─────────────────────────────────────────────────────────────────
    async def create(self, user_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        ds_id = str(uuid.uuid4())
        row = UserDatasourceModel(
            id           = ds_id,
            user_id      = user_id,
            name         = data["name"],
            type         = data["type"],
            host         = data["host"],
            port         = int(data["port"]),
            db_name      = data["db_name"],
            username     = data["username"],
            password_enc = encrypt_password(data["password"]),
            description  = data.get("description"),
        )
        async with self.async_session() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
        return self._to_dict(row)

    # ── 列表（当前用户） ───────────────────────────────────────────────────────
    async def list_by_user(self, user_id: int) -> List[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(UserDatasourceModel)
                .where(UserDatasourceModel.user_id == user_id)
                .order_by(UserDatasourceModel.created_at)
            )
            rows = result.scalars().all()
        return [self._to_dict(r) for r in rows]

    # ── 单条（含解密密码，仅内部建立连接用）────────────────────────────────────
    async def get(self, ds_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(UserDatasourceModel).where(
                    UserDatasourceModel.id      == ds_id,
                    UserDatasourceModel.user_id == user_id,
                )
            )
            row = result.scalar_one_or_none()
        return self._to_dict(row, mask_password=False) if row else None

    # ── 通过 db_key 查（无需 user_id，内部注册连接用）──────────────────────────
    async def get_by_key(self, db_key: str) -> Optional[Dict[str, Any]]:
        """db_key = 'user_ds_{id}'，返回含明文密码的配置（用于建立连接）"""
        if not db_key.startswith("user_ds_"):
            return None
        ds_id = db_key[len("user_ds_"):]
        async with self.async_session() as session:
            result = await session.execute(
                select(UserDatasourceModel).where(UserDatasourceModel.id == ds_id)
            )
            row = result.scalar_one_or_none()
        return self._to_dict(row, mask_password=False) if row else None

    # ── 更新 ─────────────────────────────────────────────────────────────────
    async def update(self, ds_id: str, user_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(UserDatasourceModel).where(
                    UserDatasourceModel.id      == ds_id,
                    UserDatasourceModel.user_id == user_id,
                )
            )
            row = result.scalar_one_or_none()
            if not row:
                return None
            for field in ("name", "type", "host", "db_name", "username", "description"):
                if field in data:
                    setattr(row, field, data[field])
            if "port" in data:
                row.port = int(data["port"])
            if "password" in data and data["password"] and data["password"] != "***":
                row.password_enc = encrypt_password(data["password"])
            row.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(row)
        return self._to_dict(row)

    # ── 删除 ─────────────────────────────────────────────────────────────────
    async def delete(self, ds_id: str, user_id: int) -> bool:
        async with self.async_session() as session:
            result = await session.execute(
                select(UserDatasourceModel).where(
                    UserDatasourceModel.id      == ds_id,
                    UserDatasourceModel.user_id == user_id,
                )
            )
            row = result.scalar_one_or_none()
            if not row:
                return False
            await session.delete(row)
            await session.commit()

        # 同步清理 DatabaseManager 中的 adapter 缓存
        db_key = f"user_ds_{ds_id}"
        try:
            from databases.database_manager import DatabaseManager
            await DatabaseManager.disconnect(db_key)
        except Exception:
            pass
        return True

    # ── 将数据源 config 转为 DatabaseManager 可注册格式 ───────────────────────
    @staticmethod
    def to_db_config(ds: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type":     ds["type"],
            "host":     ds["host"],
            "port":     ds["port"],
            "database": ds["db_name"],
            "user":     ds["username"],
            "password": ds["password"],   # 明文
            "name":     ds["name"],
        }


datasource_db = DatasourceDB()
