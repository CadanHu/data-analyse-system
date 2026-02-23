"""
Schema 提取服务
"""
from typing import List, Dict, Optional
from pathlib import Path
from config import DATABASES, BUSINESS_DB_PATH
from databases.database_manager import DatabaseManager


class SchemaService:
    _cached_schema: Optional[str] = None
    _cached_tables: Optional[List[str]] = None
    _current_db_key: str = "business"

    @classmethod
    def set_database(cls, db_key: str = "business"):
        """设置当前使用的数据库"""
        if db_key in DATABASES:
            cls._current_db_key = db_key
            cls.clear_cache()
            DatabaseManager.register_database(db_key, DATABASES[db_key])

    @classmethod
    def get_current_db_path(cls) -> Optional[Path]:
        """获取当前数据库路径（仅 SQLite）"""
        if cls._current_db_key in DATABASES:
            config = DATABASES[cls._current_db_key]
            if config.get("type") == "sqlite":
                return config.get("path")
        return BUSINESS_DB_PATH

    @classmethod
    def get_current_db_key(cls) -> str:
        """获取当前数据库key"""
        return cls._current_db_key

    @classmethod
    async def get_table_names(cls) -> List[str]:
        """获取所有表名"""
        if cls._cached_tables is not None:
            return cls._cached_tables

        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            tables = await adapter.get_tables()
            table_names = [t.name for t in tables]
            cls._cached_tables = table_names
            return table_names
        
        return []

    @classmethod
    async def get_table_schema(cls, table_name: str) -> str:
        """获取表结构"""
        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if adapter:
            if not adapter.connected:
                await adapter.connect()
            columns = await adapter.get_table_schema(table_name)
            schema_parts = [f"CREATE TABLE {table_name} ("]
            col_defs = []
            for col in columns:
                col_def = f"  {col.name} {col.type}"
                if not col.nullable:
                    col_def += " NOT NULL"
                if col.primary_key:
                    col_def += " PRIMARY KEY"
                col_defs.append(col_def)
            schema_parts.append(",\n".join(col_defs))
            schema_parts.append(");")
            return "\n".join(schema_parts)
        
        return ""

    @classmethod
    async def get_full_schema(cls) -> str:
        """获取完整数据库结构"""
        if cls._cached_schema is not None:
            return cls._cached_schema

        tables = await cls.get_table_names()
        schemas = []
        for table in tables:
            table_schema = await cls.get_table_schema(table)
            schemas.append(table_schema)

        full_schema = "\n\n".join(schemas)
        
        # 限制 schema 大小，避免 token 超限
        max_chars = 40000
        if len(full_schema) > max_chars:
            full_schema = full_schema[:max_chars] + "\n\n-- (schema truncated due to size limit)"
        
        cls._cached_schema = full_schema
        return full_schema

    @classmethod
    async def get_sample_data(cls, table_name: str, limit: int = 3) -> str:
        """获取表的样本数据"""
        adapter = DatabaseManager.get_adapter(cls._current_db_key)
        if not adapter:
            return ""
        
        if not adapter.connected:
            await adapter.connect()
        
        try:
            rows = await adapter.execute_query(f"SELECT * FROM {table_name} LIMIT {limit}")
            if not rows:
                return ""
            columns = list(rows[0].keys()) if rows else []
            sample_lines = []
            for row in rows:
                values = []
                for col in columns:
                    val = row[col]
                    if val is None:
                        values.append("NULL")
                    elif isinstance(val, str):
                        values.append(f"'{val}'")
                    else:
                        values.append(str(val))
                sample_lines.append(f"  ({', '.join(values)})")
            return "\n".join(sample_lines)
        except Exception as e:
            print(f"获取样本数据失败: {e}")
            return ""

    @classmethod
    def clear_cache(cls):
        """清除缓存"""
        cls._cached_schema = None
        cls._cached_tables = None
