"""
Schema 提取服务 (彻底根治缓存污染版)
"""
from typing import List, Dict, Optional
from config import DATABASES, DEFAULT_BUSINESS_DB
from databases.database_manager import DatabaseManager


class SchemaService:
    # 改为字典存储，确保不同数据库的缓存互不干扰
    _cached_schemas: Dict[str, str] = {}
    _cached_tables: Dict[str, List[str]] = {}
    _current_db_key: str = DEFAULT_BUSINESS_DB

    @classmethod
    def set_database(cls, db_key: str = DEFAULT_BUSINESS_DB):
        """设置当前使用的数据库"""
        if db_key in DATABASES:
            if cls._current_db_key != db_key:
                print(f"🔄 [Schema] 数据库切换: {cls._current_db_key} -> {db_key}")
                cls._current_db_key = db_key
            # 强制注册
            DatabaseManager.register_database(db_key, DATABASES[db_key])

    @classmethod
    def get_current_db_key(cls) -> str:
        return cls._current_db_key

    @classmethod
    async def get_table_names(cls) -> List[str]:
        """获取所有表名 (支持多库独立缓存)"""
        db_key = cls._current_db_key
        if db_key in cls._cached_tables:
            return cls._cached_tables[db_key]

        adapter = DatabaseManager.get_adapter(db_key)
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            tables = await adapter.get_tables()
            table_names = [t.name for t in tables]
            cls._cached_tables[db_key] = table_names
            return table_names
        
        return []

    @classmethod
    async def get_full_schema(cls, include_sample: bool = True) -> str:
        """获取完整数据库结构 (强制匹配当前 DB)"""
        db_key = cls._current_db_key
        
        # 增加严格校验，如果缓存中的 DB Key 不匹配，则强制刷新
        if db_key in cls._cached_schemas:
            return cls._cached_schemas[db_key]

        print(f"🔍 [Schema] 正在为 {db_key} 构建全新 Schema...")
        tables = await cls.get_table_names()
        schemas = []
        for table in tables:
            table_schema = await cls.get_table_schema(table)
            if include_sample:
                sample_data = await cls.get_sample_data(table, limit=3)
                if sample_data:
                    table_schema += f"\n\n/*\n样本数据 ({table}):\n{sample_data}\n*/"
            schemas.append(table_schema)

        full_schema = "\n\n".join(schemas)
        
        # 限制大小
        if len(full_schema) > 40000:
            full_schema = full_schema[:40000] + "\n\n-- (内容过长已截断)"
        
        cls._cached_schemas[db_key] = full_schema
        return full_schema

    @classmethod
    async def get_table_schema(cls, table_name: str) -> str:
        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            return await adapter.get_create_table_sql(table_name) or f"-- 无法获取 {table_name} 结构"
        return ""

    @classmethod
    async def get_db_version(cls) -> str:
        """获取当前数据库版本"""
        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            return await adapter.get_database_version()
        return "unknown"

    @classmethod
    async def get_sample_data(cls, table_name: str, limit: int = 3) -> str:
        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if not adapter or not adapter.connected: return ""
        try:
            rows = await adapter.execute_query(f"SELECT * FROM `{table_name}` LIMIT {limit}")
            if not rows: return ""
            return "\n".join([f"  {list(row.values())}" for row in rows])
        except:
            return ""

    @classmethod
    def clear_cache(cls):
        """手动清空所有缓存"""
        cls._cached_schemas.clear()
        cls._cached_tables.clear()
        print("🧹 [Schema] 所有数据库缓存已清空")
