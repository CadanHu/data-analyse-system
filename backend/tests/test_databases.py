"""
数据库模块测试用例
测试覆盖率目标：80%+
"""
import pytest
import sys
from pathlib import Path
import tempfile
import aiosqlite

sys.path.insert(0, str(Path(__file__).parent.parent))

from databases.database_manager import DatabaseManager
from databases.base_adapter import DatabaseType, TableInfo
from databases.sqlite_adapter import SQLiteAdapter
from databases.mysql_adapter import MySQLAdapter
from databases.postgresql_adapter import PostgreSQLAdapter
from databases.mongodb_adapter import MongoDBAdapter


@pytest.fixture
def temp_sqlite_db():
    """创建临时 SQLite 数据库"""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    try:
        yield db_path
    finally:
        if db_path.exists():
            db_path.unlink()


@pytest.fixture
def sample_sqlite_db(temp_sqlite_db):
    """创建包含示例数据的 SQLite 数据库"""
    import asyncio
    async def init_db():
        async with aiosqlite.connect(temp_sqlite_db) as conn:
            await conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)")
            await conn.execute("INSERT INTO users VALUES (1, 'Alice', 'alice@example.com')")
            await conn.execute("INSERT INTO users VALUES (2, 'Bob', 'bob@example.com')")
            await conn.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)")
            await conn.execute("INSERT INTO products VALUES (1, 'Product A', 10.99)")
            await conn.commit()
    asyncio.run(init_db())
    return temp_sqlite_db


class TestBaseAdapter:
    """测试基础适配器"""

    def test_database_type_constants(self):
        """测试数据库类型常量"""
        assert DatabaseType.SQLITE == "sqlite"
        assert DatabaseType.MYSQL == "mysql"
        assert DatabaseType.POSTGRESQL == "postgresql"
        assert DatabaseType.MONGODB == "mongodb"

    def test_table_info_model(self):
        """测试 TableInfo 模型"""
        table_info = TableInfo(
            name="test_table",
            columns=[{"name": "id", "type": "INTEGER"}]
        )
        assert table_info.name == "test_table"
        assert len(table_info.columns) == 1


class TestSQLiteAdapter:
    """测试 SQLite 适配器"""

    @pytest.mark.asyncio
    async def test_sqlite_adapter_init(self, temp_sqlite_db):
        """测试 SQLite 适配器初始化"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        adapter = SQLiteAdapter(config)
        assert adapter.db_path == temp_sqlite_db
        assert adapter.connected is False

    @pytest.mark.asyncio
    async def test_sqlite_connect_disconnect(self, temp_sqlite_db):
        """测试 SQLite 连接和断开"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        adapter = SQLiteAdapter(config)

        connected = await adapter.connect()
        assert connected is True
        assert adapter.connected is True

        await adapter.disconnect()
        assert adapter.connected is False

    @pytest.mark.asyncio
    async def test_sqlite_get_tables(self, sample_sqlite_db):
        """测试获取表列表"""
        config = {"type": "sqlite", "path": sample_sqlite_db}
        adapter = SQLiteAdapter(config)
        await adapter.connect()

        tables = await adapter.get_tables()
        assert len(tables) == 2
        table_names = [t.name for t in tables]
        assert "users" in table_names
        assert "products" in table_names

        await adapter.disconnect()

    @pytest.mark.asyncio
    async def test_sqlite_get_table_schema(self, sample_sqlite_db):
        """测试获取表结构"""
        config = {"type": "sqlite", "path": sample_sqlite_db}
        adapter = SQLiteAdapter(config)
        await adapter.connect()

        schema = await adapter.get_table_schema("users")
        assert "columns" in schema
        assert len(schema["columns"]) == 3

        await adapter.disconnect()

    @pytest.mark.asyncio
    async def test_sqlite_execute_query(self, sample_sqlite_db):
        """测试执行查询"""
        config = {"type": "sqlite", "path": sample_sqlite_db}
        adapter = SQLiteAdapter(config)
        await adapter.connect()

        results = await adapter.execute_query("SELECT * FROM users")
        assert len(results) == 2
        assert results[0]["name"] == "Alice"
        assert results[1]["name"] == "Bob"

        await adapter.disconnect()

    def test_sqlite_connection_string(self, temp_sqlite_db):
        """测试连接字符串"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        adapter = SQLiteAdapter(config)
        conn_str = adapter.get_connection_string()
        assert conn_str.startswith("sqlite:///")


class TestDatabaseManager:
    """测试数据库管理器"""

    def setup_method(self):
        """每个测试前重置管理器状态"""
        DatabaseManager._adapters = {}
        DatabaseManager._configs = {}

    def test_register_database(self, temp_sqlite_db):
        """测试注册数据库"""
        config = {"type": "sqlite", "path": temp_sqlite_db, "name": "Test DB"}
        DatabaseManager.register_database("test_db", config)
        assert "test_db" in DatabaseManager._configs

    def test_get_configs(self, temp_sqlite_db):
        """测试获取所有配置"""
        config1 = {"type": "sqlite", "path": temp_sqlite_db, "name": "DB 1"}
        config2 = {"type": "sqlite", "path": temp_sqlite_db, "name": "DB 2"}
        DatabaseManager.register_database("db1", config1)
        DatabaseManager.register_database("db2", config2)

        configs = DatabaseManager.get_configs()
        assert len(configs) == 2

    def test_get_config(self, temp_sqlite_db):
        """测试获取单个配置"""
        config = {"type": "sqlite", "path": temp_sqlite_db, "name": "Test DB"}
        DatabaseManager.register_database("test_db", config)

        retrieved = DatabaseManager.get_config("test_db")
        assert retrieved == config

        retrieved_none = DatabaseManager.get_config("nonexistent")
        assert retrieved_none is None

    def test_get_adapter_sqlite(self, temp_sqlite_db):
        """测试获取 SQLite 适配器"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        DatabaseManager.register_database("test_db", config)
        adapter = DatabaseManager.get_adapter("test_db")
        assert isinstance(adapter, SQLiteAdapter)

    def test_get_adapter_mysql(self):
        """测试获取 MySQL 适配器"""
        config = {"type": "mysql", "host": "localhost"}
        DatabaseManager.register_database("test_mysql", config)
        adapter = DatabaseManager.get_adapter("test_mysql")
        assert isinstance(adapter, MySQLAdapter)

    def test_get_adapter_postgresql(self):
        """测试获取 PostgreSQL 适配器"""
        config = {"type": "postgresql", "host": "localhost"}
        DatabaseManager.register_database("test_pg", config)
        adapter = DatabaseManager.get_adapter("test_pg")
        assert isinstance(adapter, PostgreSQLAdapter)

    def test_get_adapter_mongodb(self):
        """测试获取 MongoDB 适配器"""
        config = {"type": "mongodb", "uri": "mongodb://localhost"}
        DatabaseManager.register_database("test_mongo", config)
        adapter = DatabaseManager.get_adapter("test_mongo")
        assert isinstance(adapter, MongoDBAdapter)

    def test_get_adapter_nonexistent(self):
        """测试获取不存在的适配器"""
        adapter = DatabaseManager.get_adapter("nonexistent")
        assert adapter is None

    @pytest.mark.asyncio
    async def test_connect_database(self, temp_sqlite_db):
        """测试连接数据库"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        DatabaseManager.register_database("test_db", config)
        connected = await DatabaseManager.connect("test_db")
        assert connected is True

    @pytest.mark.asyncio
    async def test_disconnect_database(self, temp_sqlite_db):
        """测试断开数据库"""
        config = {"type": "sqlite", "path": temp_sqlite_db}
        DatabaseManager.register_database("test_db", config)
        await DatabaseManager.connect("test_db")
        await DatabaseManager.disconnect("test_db")
        assert "test_db" not in DatabaseManager._adapters

    @pytest.mark.asyncio
    async def test_disconnect_all(self, temp_sqlite_db):
        """测试断开所有数据库"""
        config1 = {"type": "sqlite", "path": temp_sqlite_db}
        config2 = {"type": "sqlite", "path": temp_sqlite_db}
        DatabaseManager.register_database("db1", config1)
        DatabaseManager.register_database("db2", config2)

        await DatabaseManager.connect("db1")
        await DatabaseManager.connect("db2")
        assert len(DatabaseManager._adapters) == 2

        await DatabaseManager.disconnect_all()
        assert len(DatabaseManager._adapters) == 0


class TestOtherAdapters:
    """测试其他适配器骨架"""

    def test_mysql_adapter_init(self):
        """测试 MySQL 适配器初始化"""
        config = {
            "type": "mysql",
            "host": "localhost",
            "port": 3306,
            "database": "test",
            "user": "root",
            "password": "pass"
        }
        adapter = MySQLAdapter(config)
        assert adapter.host == "localhost"
        assert adapter.port == 3306

    @pytest.mark.asyncio
    async def test_mysql_adapter_connect(self):
        """测试 MySQL 适配器连接（骨架）"""
        config = {"type": "mysql", "host": "localhost"}
        adapter = MySQLAdapter(config)
        connected = await adapter.connect()
        assert connected is True

    def test_postgresql_adapter_init(self):
        """测试 PostgreSQL 适配器初始化"""
        config = {
            "type": "postgresql",
            "host": "localhost",
            "port": 5432,
            "database": "test",
            "user": "postgres",
            "password": "pass"
        }
        adapter = PostgreSQLAdapter(config)
        assert adapter.host == "localhost"
        assert adapter.port == 5432

    def test_mongodb_adapter_init(self):
        """测试 MongoDB 适配器初始化"""
        config = {
            "type": "mongodb",
            "uri": "mongodb://localhost:27017",
            "database": "test"
        }
        adapter = MongoDBAdapter(config)
        assert adapter.uri == "mongodb://localhost:27017"
        assert adapter.database == "test"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=databases", "--cov-report=term-missing"])
