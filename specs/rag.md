# 规格：RAG 知识库 (Retrieval-Augmented Generation)

> 来源：`backend/routers/rag_router.py` + `backend/services/vector_store.py` 逆向
> 版本：v2.0

---

## 1. 职责

RAG 模块负责：
- 管理用户上传文档的向量化存储（ChromaDB）
- 在 RAG 模式对话中检索相关文档片段
- 提供知识库管理接口（查看、删除、去重）

---

## 2. 检索规格

| 参数 | 值 | 说明 |
|------|----|------|
| 默认 top_k | 8 | 最多返回 8 个片段 |
| 检索算法 | 余弦相似度 | 有 Embedding Key 时 |
| 降级算法 | FTS5 全文检索 | 无 Embedding Key 时 |
| 文件名提升 | boost = 0.3 | 问题中提到文件名时，相关片段分数 +0.3 |

**检索范围（rag_scope）**：
- `"session"`：仅检索当前会话上传的文档
- `"global"`：检索当前用户所有会话的文档

---

## 3. API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/rag/chunks` | 列出知识库片段（分页） |
| GET | `/rag/docs` | 列出已上传文档 |
| POST | `/rag/deduplicate` | 对知识库去重 |
| POST | `/rag/chunk/delete` | 删除指定片段 |
| POST | `/rag/doc/delete` | 删除指定文档的所有片段 |

---

## 4. 约束

- 所有检索必须带 `user_id` 过滤，禁止跨用户检索
- 去重操作不可逆，执行前必须确认
- 文档删除同时删除其所有向量片段

---

## 5. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| RAG 模式下问文档内容 | 回答附带文档来源引用 | `test_rag_pipeline.py::test_rag_flow` |
| 向量检索返回相关片段 | 结果非空，内容与查询语义相关 | `test_rag_pipeline.py::test_rag_flow` |
| `rag_scope = "global"` | 检索该用户所有会话文档 | ❌ 未覆盖 |
| 问题含文件名（如"合同.pdf"）| 相关文档片段优先返回 | ❌ 未覆盖 |
| 删除文档后再次检索 | 被删文档内容不出现在结果中 | ❌ 未覆盖 |
