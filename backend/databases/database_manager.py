from typing import Any, Dict, Optional
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from .base_adapter import BaseDatabaseAdapter, DatabaseType
from .mysql_adapter import MySQLAdapter
from .postgresql_adapter import PostgreSQLAdapter
from .mongodb_adapter import MongoDBAdapter


class DatabaseManager:
    """数据库管理器 - 统一管理多种数据库连接 (SQLAlchemy 驱动)"""

    _adapters: Dict[str, BaseDatabaseAdapter] = {}
    _configs: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register_database(cls, db_key: str, config: Dict[str, Any]) -> None:
        """注册数据库配置"""
        cls._configs[db_key] = config

    @classmethod
    def get_adapter(cls, db_key: str) -> Optional[BaseDatabaseAdapter]:
        """获取数据库适配器"""
        if db_key in cls._adapters:
            return cls._adapters[db_key]

        if db_key not in cls._configs:
            return None

        config = cls._configs[db_key]
        db_type = config.get("type")

        adapter = None
        if db_type == DatabaseType.MYSQL:
            adapter = MySQLAdapter(config)
        elif db_type == DatabaseType.POSTGRESQL:
            adapter = PostgreSQLAdapter(config)
        elif db_type == DatabaseType.MONGODB:
            adapter = MongoDBAdapter(config)

        if adapter:
            cls._adapters[db_key] = adapter

        return adapter

    @classmethod
    async def connect(cls, db_key: str) -> bool:
        """连接到指定数据库"""
        adapter = cls.get_adapter(db_key)
        if not adapter:
            print(f"❌ 数据库未注册: {db_key}")
            return False
        return await adapter.connect()

    @classmethod
    async def disconnect(cls, db_key: str) -> None:
        """断开指定数据库连接"""
        if db_key in cls._adapters:
            await cls._adapters[db_key].disconnect()
            del cls._adapters[db_key]

    @classmethod
    async def disconnect_all(cls) -> None:
        """断开所有数据库连接"""
        for db_key in list(cls._adapters.keys()):
            await cls.disconnect(db_key)

    @classmethod
    def get_configs(cls) -> Dict[str, Dict[str, Any]]:
        """获取所有数据库配置"""
        return cls._configs.copy()

    @classmethod
    def get_config(cls, db_key: str) -> Optional[Dict[str, Any]]:
        """获取指定数据库配置"""
        return cls._configs.get(db_key)
