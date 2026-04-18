# ADR（架构决策记录）索引

记录项目中重大的架构决策：为什么这样设计、考虑过哪些方案、最终选择的依据。

| 编号 | 标题 | 状态 | 日期 |
|------|------|------|------|
| [ADR-001](./001-sqlite-to-sqlalchemy.md) | 从 SQLite 迁移至 SQLAlchemy + MySQL/PostgreSQL | 已决定 | 2026-01 |
| [ADR-002](./002-physical-mode-isolation.md) | 5 种处理模式物理隔离架构 | 已决定 | 2026-02 |
| [ADR-003](./003-graphrag-community-detection.md) | 引入 GraphRAG 层级社区检测（Map-Reduce 全局搜索） | 已决定 | 2026-03 |

---

ADR 模板：
```
# ADR-XXX: 标题

## 状态
已决定 / 草案 / 已废弃

## 背景
为什么需要做这个决定？

## 方案对比
考虑过哪些方案？

## 决定
选择了什么，为什么？

## 后果
这个决定带来了哪些影响（正面 + 负面）？
```
