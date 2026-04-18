# 规格：数据库连接管理 (Database Connection)

> 来源：`backend/routers/database_router.py` + `data-sys-docs/requirements/007-sqlalchemy-migration-and-sqlite-removal.md` 整合
> 版本：v2.0

---

## 1. 支持的数据库类型

| 类型 | 驱动 | 最低版本 |
|------|------|---------|
| MySQL | `aiomysql` | 8.0+ |
| PostgreSQL | `asyncpg` | 14+ |

**废除**：SQLite（已于 v007 完全移除，禁止重新引入）

---

## 2. API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/databases` | 获取当前用户可访问的数据库列表 |
| GET | `/databases/list` | 获取系统所有配置的数据库 |
| POST | `/database/switch` | 切换当前会话的活跃数据库 |
| GET | `/databases/{db_key}/tables` | 获取指定库的表列表 |
| GET | `/databases/{db_key}/tables/{table}/schema` | 获取表结构详情 |
| POST | `/databases/test` | 测试数据库连接 |

---

## 3. DatabaseManager 规格

- 所有数据库交互必须通过 `DatabaseManager` 获取 SQLAlchemy 异步引擎
- 禁止直接使用 `aiomysql`/`asyncpg` 手动编写原始连接代码
- 高并发场景连接池配置：`pool_size ≥ 20`，`max_overflow ≥ 40`

---

## 4. 会话与用户数据存储

- `sessions` 和 `users` 表必须存储在 MySQL 系统库中（不是业务分析库）
- 应用启动时自动初始化这两张表（`startup_event`）
- 业务分析库与系统库分离，互不影响

---

## 5. Schema 提取规范

- 使用 SQLAlchemy `inspect` 实现跨库通用的 Schema 提取
- 提取内容：表名、列名、数据类型、可空性、注释、外键关系
- 禁止用 `SHOW TABLES` / `\d` 等方言特定命令（破坏多库兼容性）

---

## 6. 切换数据库规格

- 切换数据库不重置会话消息历史
- 切换后新的消息使用新数据库的 Schema
- `sessions.database_key` 字段持久化当前选中的数据库

---

## 7. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| MySQL 连接建立 | 连接成功，可执行查询 | `test_mysql_connection.py::test_mysql` |
| PostgreSQL 存储 | 数据写入和读取正常 | `test_postgres_storage.py::test_pg_storage` |
| 模块导入 + SQLExecutor 可用 | 无导入错误，执行器实例化成功 | `test_part3.py::test_imports` / `test_sql_executor` |
| 应用启动 | `sessions`/`users` 表自动创建 | ❌ 未覆盖 |
| 切换到 PostgreSQL 库 | 后续 SQL 正确使用 PG 语法 | ❌ 未覆盖 |
| 连接测试失败 | 返回具体错误（连接超时 / 认证失败等） | ❌ 未覆盖 |
| 业务库断开 | 系统库（会话/用户）不受影响 | ❌ 未覆盖 |
