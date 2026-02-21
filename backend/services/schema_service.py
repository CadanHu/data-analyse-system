"""
Schema 提取服务
"""
import aiosqlite
from typing import List, Dict
from config import BUSINESS_DB_PATH


class SchemaService:
    _cached_schema: str = None
    _cached_tables: List[str] = None

    @classmethod
    async def get_table_names(cls) -> List[str]:
        if cls._cached_tables is not None:
            return cls._cached_tables

        async with aiosqlite.connect(BUSINESS_DB_PATH) as conn:
            async with conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ) as cursor:
                tables = [row[0] for row in await cursor.fetchall()]
                cls._cached_tables = tables
                return tables

    @classmethod
    async def get_table_schema(cls, table_name: str) -> str:
        async with aiosqlite.connect(BUSINESS_DB_PATH) as conn:
            async with conn.execute(f"PRAGMA table_info({table_name})") as cursor:
                columns = await cursor.fetchall()
                schema_parts = [f"CREATE TABLE {table_name} ("]
                col_defs = []
                for col in columns:
                    col_name = col[1]
                    col_type = col[2]
                    not_null = "NOT NULL" if col[3] else ""
                    default = f"DEFAULT {col[4]}" if col[4] is not None else ""
                    primary_key = "PRIMARY KEY" if col[5] else ""
                    col_def = f"  {col_name} {col_type}"
                    if not_null:
                        col_def += f" {not_null}"
                    if default:
                        col_def += f" {default}"
                    if primary_key:
                        col_def += f" {primary_key}"
                    col_defs.append(col_def)
                schema_parts.append(",\n".join(col_defs))
                schema_parts.append(");")
                return "\n".join(schema_parts)

    @classmethod
    async def get_full_schema(cls) -> str:
        if cls._cached_schema is not None:
            return cls._cached_schema

        tables = await cls.get_table_names()
        schemas = []
        for table in tables:
            table_schema = await cls.get_table_schema(table)
            schemas.append(table_schema)

            sample_data = await cls.get_sample_data(table)
            if sample_data:
                schemas.append(f"\n-- {table} 示例数据:")
                schemas.append(sample_data)

        full_schema = "\n\n".join(schemas)
        cls._cached_schema = full_schema
        return full_schema

    @classmethod
    async def get_sample_data(cls, table_name: str, limit: int = 3) -> str:
        async with aiosqlite.connect(BUSINESS_DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(f"SELECT * FROM {table_name} LIMIT {limit}") as cursor:
                rows = await cursor.fetchall()
                if not rows:
                    return ""
                columns = rows[0].keys()
                sample_lines = []
                for row in rows:
                    values = [str(row[col]) for col in columns]
                    sample_lines.append(f"  ({', '.join(values)})")
                return "\n".join(sample_lines)

    @classmethod
    def clear_cache(cls):
        cls._cached_schema = None
        cls._cached_tables = None
