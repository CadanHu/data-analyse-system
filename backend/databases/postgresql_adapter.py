"""
PostgreSQL 数据库适配器 (SQLAlchemy 实现)
"""
from typing import Dict, Any
from .base_adapter import BaseDatabaseAdapter


class PostgreSQLAdapter(BaseDatabaseAdapter):
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 5432)
        self.database = config.get("database", "postgres")
        self.user = config.get("user", "postgres")
        self.password = config.get("password", "")

    def get_connection_string(self) -> str:
        """获取 SQLAlchemy 异步连接字符串"""
        # 使用 asyncpg 作为驱动
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    async def get_create_table_sql(self, table_name: str) -> str:
        """获取 PostgreSQL 的 CREATE TABLE 语句（简化版）"""
        # PostgreSQL 没有直接的 SHOW CREATE TABLE，通常由 pg_dump 生成
        # 这里返回表结构的基本信息或留空，Agent 通常能通过列信息理解
        return f"-- Schema information for {table_name} is available via column inspection."
