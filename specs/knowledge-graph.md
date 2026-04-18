# 规格：知识图谱 (Knowledge Graph)

> 来源：`backend/routers/knowledge_graph_router.py` + `data-sys-docs/MOBILE_KNOWLEDGE_SPEC.md` 逆向
> 版本：v2.0

---

## 1. 数据模型

**实体（Entity）**：
- `id`、`name`、`type`、`description`、`user_id`、`source_doc`

**关系（Relation）**：
- `id`、`source_id`（→ Entity）、`target_id`（→ Entity）、`relation_type`、`description`、`user_id`

**社区（Community）**：
- 通过 Hierarchical Community Detection（Microsoft GraphRAG 算法）自动生成
- 支持 L0 / L1 / L2 多层级社区结构
- 社区摘要用于 Map-Reduce 全局搜索

---

## 2. API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/knowledge-graph/graph` | 获取完整图（节点 + 边） |
| GET | `/knowledge-graph/stats` | 统计信息（实体数、关系数） |
| GET | `/knowledge-graph/search` | 关键词搜索实体 |
| GET | `/knowledge-graph/docs` | 列出已处理文档 |
| GET | `/knowledge-graph/path` | 查找两实体间的路径 |
| GET | `/knowledge-graph/neighbors` | 获取实体邻居 |
| GET | `/knowledge-graph/export` | 导出图数据（JSON/CSV） |
| GET | `/knowledge-graph/communities` | 获取社区列表 |
| POST | `/knowledge-graph/communities` | 从移动端同步社区数据 |
| POST | `/knowledge-graph/entities` | 创建实体（201） |
| PUT | `/knowledge-graph/entities/{id}` | 更新实体 |
| DELETE | `/knowledge-graph/entities/{id}` | 删除实体（级联删除关系） |
| POST | `/knowledge-graph/relations` | 创建关系（201） |
| PUT | `/knowledge-graph/relations/{id}` | 更新关系 |
| DELETE | `/knowledge-graph/relations/{id}` | 删除关系 |

---

## 3. 社区检测规格

- 算法：Hierarchical Community Detection（Louvain 变体）
- 分层：L0（最细粒度）→ L1 → L2（最粗粒度）
- L0 必须避免退化（单节点社区），最小社区大小 = 2
- 社区摘要由 LLM 生成，用于全局搜索的 Map-Reduce

---

## 4. 移动端离线规格

- 移动端可在本地 SQLite 中完整构建知识图谱
- 本地构建完成后通过 `POST /knowledge-graph/communities` 同步到服务器
- 同步协议：增量同步，服务器端去重

详细移动端规格见 `data-sys-docs/MOBILE_KNOWLEDGE_SPEC.md`

---

## 5. 约束

- 所有查询必须带 `user_id` 过滤
- 删除实体时必须级联删除所有相关关系
- 路径查询最大深度：6 跳

---

## 6. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| 社区检测后 | L0 社区无单节点社区，`level=2` 社区存在 | `test_graph_rag_features.py::test_graph_rag_components` |
| 实体搜索 | 关键词匹配返回实体及文本 | `test_graph_rag_features.py::test_graph_rag_components` |
| Map-Reduce 全局搜索 | 返回包含社区摘要的上下文 | `test_graph_rag_features.py::test_graph_rag_components` |
| 空图谱搜索 | 返回"暂无"提示，不报错 | `test_graph_rag_features.py::test_graph_rag_components` |
| 上传文档后 | 自动抽取实体和关系，图谱可视化展示 | ❌ 未覆盖 |
| 删除实体 | 其所有关联关系同时删除 | ❌ 未覆盖 |
| 移动端同步 | 本地图谱数据成功同步到服务器，无重复 | ❌ 未覆盖 |
