"""
MySQL 数据库适配器 (SQLAlchemy 实现)
"""
from typing import Dict, Any
from .base_adapter import BaseDatabaseAdapter


class MySQLAdapter(BaseDatabaseAdapter):
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 3306)
        self.database = config.get("database", "")
        self.user = config.get("user", "root")
        self.password = config.get("password", "")

    def get_connection_string(self) -> str:
        """获取 SQLAlchemy 异步连接字符串"""
        # 使用 aiomysql 作为驱动
        return f"mysql+aiomysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}?charset=utf8mb4"

    async def get_create_table_sql(self, table_name: str) -> str:
        """获取 MySQL 的 CREATE TABLE 语句"""
        try:
            res = await self.execute_query(f"SHOW CREATE TABLE `{table_name}`")
            if res:
                # SHOW CREATE TABLE 返回的第二列是 SQL
                return list(res[0].values())[1]
        except Exception as e:
            print(f"❌ 获取 CREATE TABLE 失败: {str(e)}")
        return ""
