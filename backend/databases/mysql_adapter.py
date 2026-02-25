"""
MySQL 数据库适配器
"""
from typing import List, Dict, Any, Optional
from .base_adapter import BaseDatabaseAdapter, TableInfo, ColumnInfo


class MySQLAdapter(BaseDatabaseAdapter):
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 3306)
        self.database = config.get("database", "")
        self.user = config.get("user", "root")
        self.password = config.get("password", "")
        self._connection = None

    async def connect(self) -> bool:
        try:
            import aiomysql
            self._connection = await aiomysql.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                db=self.database,
                charset="utf8mb4",
                autocommit=True
            )
            self._connected = True
            print(f"✅ MySQL 连接成功: {self.host}:{self.port}/{self.database}")
            return True
        except ImportError:
            print("❌ 缺少 aiomysql 库，请运行: pip install aiomysql")
            return False
        except Exception as e:
            print(f"❌ MySQL 连接失败: {str(e)}")
            return False

    async def disconnect(self):
        if self._connection:
            self._connection.close()
            self._connection = None
        self._connected = False
        print("✅ MySQL 连接已关闭")

    async def is_connected(self) -> bool:
        """检查是否已连接"""
        if not self._connected or not self._connection:
            return False
        try:
            async with self._connection.cursor() as cursor:
                await cursor.execute("SELECT 1")
            return True
        except:
            return False

    def get_connection_string(self) -> str:
        """获取 LangChain SQLDatabase 连接字符串"""
        return f"mysql+pymysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    async def get_tables(self) -> List[TableInfo]:
        if not self._connection:
            await self.connect()

        tables = []
        try:
            async with self._connection.cursor() as cursor:
                await cursor.execute("SHOW TABLES")
                table_names = [row[0] for row in await cursor.fetchall()]

                for table_name in table_names:
                    await cursor.execute(f"SHOW TABLE STATUS LIKE '{table_name}'")
                    status = await cursor.fetchone()
                    row_count = status[4] if status else 0

                    tables.append(TableInfo(
                        name=table_name,
                        row_count=row_count,
                        columns=await self._get_columns(table_name)
                    ))
        except Exception as e:
            print(f"❌ 获取表列表失败: {str(e)}")

        return tables

    async def _get_columns(self, table_name: str) -> List[ColumnInfo]:
        columns = []
        try:
            async with self._connection.cursor() as cursor:
                await cursor.execute(f"DESCRIBE {table_name}")
                for row in await cursor.fetchall():
                    columns.append(ColumnInfo(
                        name=row[0],
                        type=row[1],
                        nullable=row[2] == "YES",
                        primary_key=row[3] == "PRI"
                    ))
        except Exception as e:
            print(f"❌ 获取列信息失败: {str(e)}")
        return columns

    async def get_table_schema(self, table_name: str) -> List[ColumnInfo]:
        return await self._get_columns(table_name)

    async def get_create_table_sql(self, table_name: str) -> str:
        """获取 MySQL 的 CREATE TABLE 语句"""
        if not self._connection:
            await self.connect()
        try:
            async with self._connection.cursor() as cursor:
                await cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
                row = await cursor.fetchone()
                return row[1] if row else ""
        except Exception as e:
            print(f"❌ 获取 CREATE TABLE 失败: {str(e)}")
            return ""

    async def get_database_version(self) -> str:
        """获取 MySQL 版本"""
        if not self._connection:
            await self.connect()
        try:
            async with self._connection.cursor() as cursor:
                await cursor.execute("SELECT VERSION()")
                row = await cursor.fetchone()
                return row[0] if row else "unknown"
        except Exception as e:
            print(f"❌ 获取 MySQL 版本失败: {str(e)}")
            return "unknown"

    async def execute_query(self, query: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        if not self._connection:
            await self.connect()

        results = []
        try:
            import aiomysql
            async with self._connection.cursor(aiomysql.cursors.DictCursor) as cursor:
                await cursor.execute(query, params or ())
                rows = await cursor.fetchall()
                results = [dict(row) for row in rows]
        except Exception as e:
            print(f"❌ 执行查询失败: {str(e)}")
            raise e

        return results
