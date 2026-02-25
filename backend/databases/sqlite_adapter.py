from typing import Any, Dict, List, Optional
import aiosqlite
from pathlib import Path
from .base_adapter import BaseDatabaseAdapter, TableInfo, ColumnInfo


class SQLiteAdapter(BaseDatabaseAdapter):
    """SQLite 数据库适配器"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.db_path = Path(config["path"])

    async def connect(self) -> bool:
        """连接 SQLite 数据库"""
        try:
            self._connection = await aiosqlite.connect(str(self.db_path))
            self._connected = True
            return True
        except Exception as e:
            print(f"SQLite 连接失败: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """断开 SQLite 数据库连接"""
        if self._connection:
            await self._connection.close()
            self._connection = None
            self._connected = False

    async def is_connected(self) -> bool:
        """检查是否已连接"""
        if not self._connected or not self._connection:
            return False
        try:
            await self._connection.execute("SELECT 1")
            return True
        except:
            return False

    async def get_tables(self) -> List[TableInfo]:
        """获取所有表信息"""
        if not self._connected:
            await self.connect()

        tables = []
        cursor = await self._connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        rows = await cursor.fetchall()

        for (table_name,) in rows:
            if table_name.startswith("sqlite_"):
                continue

            columns = await self.get_table_schema(table_name)
            row_count = await self._get_row_count(table_name)
            
            tables.append(TableInfo(
                name=table_name,
                columns=columns,
                row_count=row_count
            ))

        return tables

    async def _get_row_count(self, table_name: str) -> int:
        """获取表的行数"""
        try:
            cursor = await self._connection.execute(f"SELECT COUNT(*) FROM {table_name}")
            result = await cursor.fetchone()
            return result[0] if result else 0
        except:
            return 0

    async def get_table_schema(self, table_name: str) -> List[ColumnInfo]:
        """获取表结构"""
        if not self._connected:
            await self.connect()

        # 使用双引号引用 table_name，以防其是 SQL 关键字
        cursor = await self._connection.execute(f'PRAGMA table_info("{table_name}")')
        columns_info = await cursor.fetchall()

        columns = []
        for col in columns_info:
            columns.append(ColumnInfo(
                name=col[1],
                type=col[2],
                nullable=not bool(col[3]),
                primary_key=bool(col[5])
            ))

        return columns

    async def execute_query(self, query: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        """执行查询"""
        if not self._connected:
            await self.connect()

        cursor = await self._connection.execute(query, params or ())
        rows = await cursor.fetchall()

        columns = [description[0] for description in cursor.description] if cursor.description else []
        results = []
        for row in rows:
            results.append(dict(zip(columns, row)))

        return results

    def get_connection_string(self) -> str:
        """获取 LangChain SQLDatabase 连接字符串"""
        return f"sqlite:///{self.db_path}"
