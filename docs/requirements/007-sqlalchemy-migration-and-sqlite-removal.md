# 需求文档 007: 从 SQLite 全面迁移至 SQLAlchemy (MySQL/PostgreSQL)

## 1. 背景
系统早期使用 `aiosqlite` 作为本地存储，不利于生产环境扩展。为了支持更复杂的商业数据分析场景，需要转向生产级数据库并引入 SQLAlchemy 异步驱动。

## 2. 核心修改
- **废除 SQLite**：删除所有 `.db` 文件，移除 `aiosqlite` 依赖。
- **引入 SQLAlchemy**：重构 `BaseDatabaseAdapter`，利用 `sqlalchemy.ext.asyncio` 实现统一的引擎管理。
- **多库支持**：
    - 适配 MySQL (驱动: `aiomysql`)。
    - 适配 PostgreSQL (驱动: `asyncpg`)。
- **Schema 提取优化**：利用 SQLAlchemy `inspect` 实现跨库通用的表结构与列元数据提取。
- **统一存储**：会话（Sessions）与用户（Users）数据统一存储于 MySQL 库中。

## 3. 验证标准
- 运行 `scripts/check_db_env.py` 显示所有配置的 MySQL/PG 库连接成功。
- 启动应用后自动在 MySQL 中初始化 `sessions` 和 `users` 表。
