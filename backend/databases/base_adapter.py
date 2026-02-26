from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine, AsyncConnection
from sqlalchemy import text, inspect, MetaData


class DatabaseType:
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
    """基于 SQLAlchemy 的数据库适配器基类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.engine: Optional[AsyncEngine] = None
        self._connected = False

    @abstractmethod
    def get_connection_string(self) -> str:
        """获取 SQLAlchemy 连接字符串"""
        pass

    async def connect(self) -> bool:
        """连接数据库"""
        try:
            conn_str = self.get_connection_string()
            self.engine = create_async_engine(conn_str, echo=False)
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            self._connected = True
            return True
        except Exception as e:
            print(f"❌ 数据库连接失败: {str(e)}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """断开数据库连接"""
        if self.engine:
            await self.engine.dispose()
            self.engine = None
        self._connected = False

    async def is_connected(self) -> bool:
        """检查是否已连接"""
        if not self._connected or not self.engine:
            return False
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except:
            self._connected = False
            return False

    async def get_tables(self) -> List[TableInfo]:
        """获取所有表信息（使用 SQLAlchemy Inspect）"""
        if not self.engine:
            return []

        def _get_tables_sync(bind):
            inspector = inspect(bind)
            tables = []
            for table_name in inspector.get_table_names():
                columns = []
                for col in inspector.get_columns(table_name):
                    columns.append(ColumnInfo(
                        name=col['name'],
                        type=str(col['type']),
                        nullable=col.get('nullable', True),
                        primary_key=col.get('primary_key', False)
                    ))
                tables.append(TableInfo(name=table_name, columns=columns))
            return tables

        async with self.engine.connect() as conn:
            return await conn.run_sync(_get_tables_sync)

    async def get_table_schema(self, table_name: str) -> List[ColumnInfo]:
        """获取表结构"""
        tables = await self.get_tables()
        for t in tables:
            if t.name == table_name:
                return t.columns
        return []

    async def execute_query(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """执行异步查询"""
        if not self.engine:
            raise Exception("数据库未连接")
        
        async with self.engine.connect() as conn:
            result = await conn.execute(text(query), params or {})
            if result.returns_rows:
                return [dict(row._mapping) for row in result.all()]
            return []

    async def get_database_version(self) -> str:
        """获取数据库版本信息"""
        try:
            res = await self.execute_query("SELECT VERSION()")
            if res:
                return list(res[0].values())[0]
        except:
            pass
        return "unknown"

    @property
    def connected(self) -> bool:
        return self._connected
