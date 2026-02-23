from typing import Any, Dict, List
from .base_adapter import BaseDatabaseAdapter, TableInfo


class MongoDBAdapter(BaseDatabaseAdapter):
    """MongoDB 数据库适配器（骨架）"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.uri = config.get("uri", "mongodb://localhost:27017")
        self.database = config.get("database", "")

    async def connect(self) -> bool:
        """连接 MongoDB 数据库"""
        # TODO: 实现 MongoDB 连接
        print(f"MongoDB 适配器 (骨架): 连接到 {self.uri}/{self.database}")
        self._connected = True
        return True

    async def disconnect(self) -> None:
        """断开 MongoDB 数据库连接"""
        self._connected = False

    async def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._connected

    async def get_tables(self) -> List[TableInfo]:
        """获取所有集合信息"""
        return []

    async def get_table_schema(self, table_name: str) -> Dict[str, Any]:
        """获取集合结构"""
        return {"columns": []}

    async def execute_query(self, query: str) -> List[Dict[str, Any]]:
        """执行查询"""
        return []

    def get_connection_string(self) -> str:
        """获取连接字符串"""
        return self.uri
