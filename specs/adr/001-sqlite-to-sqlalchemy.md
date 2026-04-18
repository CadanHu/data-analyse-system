# ADR-001: 从 SQLite 迁移至 SQLAlchemy + MySQL/PostgreSQL

**状态**：已决定
**日期**：2026-01（对应需求文档 007）

---

## 背景

系统早期使用 `aiosqlite` 作为本地持久层存储会话（Sessions）和用户（Users）数据。随着项目向生产级数据分析平台演进，SQLite 暴露出以下限制：

1. **并发能力不足**：SQLite 的写锁会导致高并发场景下请求阻塞
2. **无法与业务数据库统一**：业务分析数据存在 MySQL 中，会话数据在 SQLite，形成两套连接管理
3. **生产部署困难**：SQLite 文件路径管理在容器化环境中不稳定

---

## 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 继续用 SQLite，加 WAL 模式 | 零迁移成本 | 无法解决生产级并发和多容器问题 |
| 迁移至 SQLAlchemy + MySQL | 统一连接管理，生产级并发 | 需要重构所有数据库调用 |
| 引入 Redis 存会话 | 性能极高 | 需要额外运维 Redis，增加复杂度 |

---

## 决定

**选择方案 2**：迁移至 SQLAlchemy 异步驱动（`sqlalchemy.ext.asyncio`），会话和用户数据迁入 MySQL，知识库和向量数据在 PostgreSQL。

具体拆分：
- `classic_business` / `global_analysis`：业务数据（MySQL）
- `sessions` / `users` / `api_keys`：系统数据（MySQL，同库）
- `knowledge_base`：RAG 向量索引、知识图谱（PostgreSQL + pgvector）

统一使用 `BaseDatabaseAdapter` 封装引擎管理，通过 `inspect()` 实现跨库通用 Schema 提取。

---

## 后果

**正面**：
- 所有持久化通过统一的 SQLAlchemy 接口管理，易于维护
- 支持连接池，并发能力大幅提升
- Docker Compose 下多服务共享同一 MySQL 实例，部署一致性好

**负面**：
- 本地开发需要启动 MySQL + PostgreSQL（不再能开箱即用）
- 迁移过程中删除了所有 `.db` 文件，历史数据不可恢复
- 驱动依赖增加：`aiomysql`（MySQL）+ `asyncpg`（PostgreSQL）
