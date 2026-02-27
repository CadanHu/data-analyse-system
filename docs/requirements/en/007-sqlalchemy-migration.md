# Requirements 007: Full Migration from SQLite to SQLAlchemy (MySQL/PostgreSQL)

## 1. Background
The system initially used `aiosqlite` for local storage, which is not suitable for production scaling. To support more complex business data analysis scenarios, it's necessary to move to a production-grade database and introduce the SQLAlchemy asynchronous driver.

## 2. Core Changes
- **Deprecate SQLite**: Remove all `.db` files and the `aiosqlite` dependency.
- **Introduce SQLAlchemy**: Refactor `BaseDatabaseAdapter` to implement unified engine management using `sqlalchemy.ext.asyncio`.
- **Multi-Database Support**:
    - Adaptation for MySQL (Driver: `aiomysql`).
    - Adaptation for PostgreSQL (Driver: `asyncpg`).
- **Schema Extraction Optimization**: Use SQLAlchemy `inspect` to implement cross-database general extraction of table structures and column metadata.
- **Unified Storage**: Sessions and Users data are now uniformly stored in a MySQL database.

## 3. Verification Standards
- Running `scripts/check_db_env.py` shows successful connections to all configured MySQL/PG databases.
- The `sessions` and `users` tables are automatically initialized in MySQL upon application startup.
