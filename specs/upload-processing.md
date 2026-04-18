# 规格：文件上传与知识抽取 (Upload & Knowledge Extraction)

> 来源：`backend/routers/upload_router.py` + `backend/services/knowledge_extraction_service.py` 逆向
> 版本：v2.0

---

## 1. 支持的文件类型

| 类型 | 扩展名 | 处理方式 |
|------|--------|---------|
| PDF | `.pdf` | MinerU / PyMuPDF 解析 |
| Word | `.docx` | 文本提取 |
| Excel | `.xlsx`/`.csv` | 表格结构化 |
| 图片 | `.png`/`.jpg`/`.jpeg` | OCR / Vision 识别 |
| 纯文本 | `.txt`/`.md` | 直接读取 |

---

## 2. 知识上传流程（`/upload/knowledge`）

```
上传文件
    ↓
[1] 文件类型校验
    ↓
[2] 根据 engine 参数选择处理模式
    ├── standard（默认）→ PyMuPDF 本地解析（完全离线）
    ├── deep           → MinerU API（需用户 Key）
    └── high_precision → MinerU 高精度模式
    ↓
[3] 文本分块（CHUNK_SIZE=800，OVERLAP=100）
    ↓
[4] 向量化（有 Embedding Key）或 FTS5 索引（无 Key）
    ↓
[5] 存入 ChromaDB + 数据库记录
    ↓
[6] 可选：触发实体关系抽取（知识图谱）
```

---

## 3. 异步处理规格

- 知识抽取（MinerU + LLM）为耗时操作，必须通过 `BackgroundTasks` 异步执行
- 接口立即返回 `{ "status": "processing", "session_id": "..." }`
- 前端通过轮询 `GET /upload/knowledge/status/{session_id}` 追踪进度
- 支持 `POST /upload/knowledge/cancel/{session_id}` 取消任务

---

## 4. API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/upload/knowledge` | 上传文档并触发知识抽取 |
| POST | `/upload/knowledge/cancel/{session_id}` | 取消抽取任务 |
| GET | `/upload/knowledge/status/{session_id}` | 查询抽取状态 |
| POST | `/upload` | 通用文件上传（对话附件） |
| GET | `/uploads/{filepath}` | 获取已上传文件 |
| GET | `/parsed-output/{stem}` | 列出解析结果文件 |
| DELETE | `/parsed-output/{stem}` | 删除解析结果 |

---

## 5. 抽取状态枚举

| 状态值 | 含义 |
|--------|------|
| `processing` | 处理中 |
| `done` | 完成 |
| `cancelled` | 已取消 |
| `error` | 失败，含错误信息 |

---

## 6. 约束

- 上传文件大小限制：50MB
- 后端接收文件后必须校验 MIME 类型（不信任扩展名）
- 解析失败不得崩溃，必须标记状态为 `error` 并返回错误信息
- 图片路径重写：Markdown 中的相对图片路径必须转换为 API 可访问的绝对路径

---

## 7. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| 深度抽取流程完整执行 | 文本分块、向量化、存储全流程无报错 | `test_deep_extraction.py::test_deep_extraction` |
| 上传 PDF 后立即返回 | 接口立即响应，不挂起 | ❌ 未覆盖 |
| 轮询状态接口 | 进度从 `processing` 变为 `done` | ❌ 未覆盖 |
| 上传后在 RAG 模式提问 | 文档内容出现在回答中 | ❌ 未覆盖 |
| 取消任务 | 状态变为 `cancelled`，资源释放 | ❌ 未覆盖 |
| 上传恶意文件（伪造扩展名）| 返回 400 错误 | ❌ 未覆盖 |
