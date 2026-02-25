from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class DatabaseType:
    SQLITE = "sqlite"
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    MONGODB = "mongodb"


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool = True
    primary_key: bool = False


class TableInfo(BaseModel):
    name: str
    columns: List[ColumnInfo]
    row_count: Optional[int] = None


class BaseDatabaseAdapter(ABC):
    """数据库适配器基类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._connection = None
        self._connected = False

    @abstractmethod
    async def connect(self) -> bool:
        """连接数据库"""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """断开数据库连接"""
        pass

    @abstractmethod
    async def is_connected(self) -> bool:
        """检查是否已连接"""
        pass

    @abstractmethod
    async def get_tables(self) -> List[TableInfo]:
        """获取所有表信息"""
        pass

    @abstractmethod
    async def get_table_schema(self, table_name: str) -> List[ColumnInfo]:
        """获取表结构"""
        pass

    @abstractmethod
    async def execute_query(self, query: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        """执行查询"""
        pass

    @abstractmethod
    def get_connection_string(self) -> str:
        """获取连接字符串（用于 LangChain SQLDatabase）"""
        pass

    async def get_create_table_sql(self, table_name: str) -> str:
        """获取表的 CREATE TABLE 语句"""
        return ""

    async def get_database_version(self) -> str:
        """获取数据库版本信息"""
        return "unknown"

    @property
    def connected(self) -> bool:
        return self._connected
