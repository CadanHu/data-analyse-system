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
        """设置当前使用的数据库（支持静态配置 + 动态注册的用户数据源）"""
        # 静态配置中存在
        if db_key in DATABASES:
            if cls._current_db_key != db_key:
                print(f"🔄 [Schema] 数据库切换: {cls._current_db_key} -> {db_key}")
                cls._current_db_key = db_key
            DatabaseManager.register_database(db_key, DATABASES[db_key])
            return
        # 动态注册的用户数据源（db_key 已由 database_router 提前注册）
        if DatabaseManager.get_config(db_key):
            if cls._current_db_key != db_key:
                print(f"🔄 [Schema] 数据库切换(用户数据源): {cls._current_db_key} -> {db_key}")
                cls._current_db_key = db_key

    @classmethod
    def get_current_db_key(cls) -> Optional[str]:
        """返回当前库 key;用户尚未显式选库时惰性兜底到首个可用数据源。

        DEFAULT_BUSINESS_DB 默认 None(设计上强制手动选),但部分老路径
        (如 process_question_with_history)会在选库前就取 schema,导致
        _current_db_key=None → schema 提取全空(DAT-40 根因)。这里兜底并
        写回,保证后续 get_full_schema 等读到一致的 key,且警告只打一次。
        """
        if cls._current_db_key:
            return cls._current_db_key
        fallback = cls._resolve_fallback_db_key()
        if fallback:
            print(f"⚠️ [Schema] 未显式选库,fallback 到首个可用数据源: {fallback}")
            cls._current_db_key = fallback
        return cls._current_db_key

    @classmethod
    def _resolve_fallback_db_key(cls) -> Optional[str]:
        """选库兜底顺序: settings 默认 → DatabaseManager 已注册首个 → 静态 DATABASES 首个。"""
        # 1) settings 配置的默认库(DEFAULT_BUSINESS_DB,默认 None 时跳过)
        if DEFAULT_BUSINESS_DB and (
            DEFAULT_BUSINESS_DB in DATABASES
            or DatabaseManager.get_config(DEFAULT_BUSINESS_DB)
        ):
            return DEFAULT_BUSINESS_DB
        # 2) DatabaseManager 已注册(含用户动态数据源)的首个
        registered = DatabaseManager.get_configs()
        if registered:
            return next(iter(registered))
        # 3) 静态配置 DATABASES 首个
        if DATABASES:
            return next(iter(DATABASES))
        return None

    @classmethod
    async def get_table_names(cls) -> List[str]:
        """获取所有表名 (支持多库独立缓存)"""
        db_key = cls.get_current_db_key()
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
        db_key = cls.get_current_db_key()
        
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
        adapter = DatabaseManager.get_adapter(cls.get_current_db_key())
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            return await adapter.get_create_table_sql(table_name) or f"-- 无法获取 {table_name} 结构"
        return ""

    @classmethod
    async def get_db_version(cls) -> str:
        """获取当前数据库版本"""
        adapter = DatabaseManager.get_adapter(cls.get_current_db_key())
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            return await adapter.get_database_version()
        return "unknown"

    @classmethod
    async def get_sample_data(cls, table_name: str, limit: int = 3) -> str:
        adapter = DatabaseManager.get_adapter(cls.get_current_db_key())
        if not adapter or not adapter.connected: return ""
        try:
            rows = await adapter.execute_query(f"SELECT * FROM `{table_name}` LIMIT {limit}")
            if not rows: return ""
            return "\n".join([f"  {list(row.values())}" for row in rows])
        except:
            return ""

    @classmethod
    async def get_partial_schema(cls, table_names: List[str], include_sample: bool = True) -> str:
        """只获取指定表的 Schema（两阶段注入用）"""
        db_key = cls.get_current_db_key()
        schemas = []
        for table in table_names:
            table_schema = await cls.get_table_schema(table)
            if include_sample:
                sample_data = await cls.get_sample_data(table, limit=3)
                if sample_data:
                    table_schema += f"\n\n/*\n样本数据 ({table}):\n{sample_data}\n*/"
            schemas.append(table_schema)
        return "\n\n".join(schemas)

    @classmethod
    def clear_cache(cls):
        """手动清空所有缓存"""
        cls._cached_schemas.clear()
        cls._cached_tables.clear()
        print("🧹 [Schema] 所有数据库缓存已清空")
