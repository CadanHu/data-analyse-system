# 移动端本地知识抽取规格说明

> **最后更新**: 2026-03-21
> **状态**: 已实现，生产就绪
> **分支**: `main`

---

## 一、总体设计目标

让用户在手机端（无需电脑后端）完成完整的 PDF 知识抽取、本地 RAG 检索和知识图谱构建，所有数据存储在设备本地 SQLite，用户只需提供自己申请的免费 API Key。

```
PDF 文件（手机）
      ↓
┌─────────────────────────────────────────────────┐
│             三种处理模式                          │
│                                                   │
│  ① 标准模式  → PDF.js 本地解析（完全离线）         │
│  ② 深度模式  → MinerU API（用户自己的 Key）        │
│  ③ 知识抽取  → MinerU + LLM 实体关系抽取          │
└─────────────────────────────────────────────────┘
      ↓
  文本分块（CHUNK_SIZE=800，OVERLAP=100）
      ↓
┌──────────────────────────┐
│     有 Embedding Key？    │
│  是 → 生成向量 → 余弦搜索  │
│  否 → FTS5 关键词搜索      │
└──────────────────────────┘
      ↓
  本地 SQLite（knowledge_chunks + knowledge_fts）
      ↓
  RAG 注入对话上下文 → AI 回答
```

---

## 二、三种 PDF 处理模式

### ① 标准模式（⚡ light）

**适用场景**：文本内容清晰、排版简单的 PDF

**流程**：
```
File → pdfjs-dist (WebView 内本地执行) → 提取纯文本 → 分块 → SQLite
```

**特点**：
- 零网络请求，完全离线
- 不需要任何 API Key
- 速度最快（秒级完成）
- 不支持复杂排版/公式/表格识别

**核心实现**：`parsePdfLocally()` in `mobileKnowledgeService.ts`

---

### ② 深度模式（🧠 pro）

**适用场景**：含表格、公式、多栏排版的复杂 PDF

**流程**：
```
File → MinerU Cloud API（用户 Key）→ Markdown → chunkMarkdown() → SQLite
```

**特点**：
- 需要用户配置 MinerU Key（免费注册）
- 按标题层级分块，保留文档结构
- 支持 OCR、表格识别、公式识别
- 耗时 10-60 秒（取决于文档大小）

**MinerU API 流程**：
1. `POST /api/v4/file-urls/batch` → 获取预签名上传 URL + batch_id
2. `PUT {presigned_url}` → 上传文件到 S3
3. `GET /api/v4/extract-results/batch/{batch_id}` → 轮询结果（5s 间隔，最多 5 分钟）
4. 下载 ZIP → 解压 → 提取 `.md` 文件

---

### ③ 知识抽取模式（💎 knowledge）

**适用场景**：需要深度理解、建立知识图谱的重要文档

**流程**：
```
File → MinerU（同②）→ Markdown → 分块 → 存储 + 向量化
                                              ↓
                                 LLM（用户配置的任意模型）
                                              ↓
                                  实体抽取 + 关系识别
                                              ↓
                                  知识图谱（localStorage + SQLite）
                                              ↓
                                  消息中显示「知识图谱」按钮
```

**知识图谱格式**：
```typescript
interface KnowledgeGraph {
  entities: Array<{
    id: string
    text: string        // 实体名称
    type: 'Person' | 'Organization' | 'Concept' | 'Event' | 'Location' | 'Other'
    description?: string
  }>
  relations: Array<{
    id: string
    source: string     // 实体 id
    target: string     // 实体 id
    label: string      // 关系描述
  }>
  doc_name: string
  extracted_at: string
}
```

**LLM 选择优先级**（使用用户已配置的）：
`deepseek → qwen → minimax → openai → gemini → claude`

---

## 三、向量搜索与 FTS5 降级策略

### 支持的 Embedding 提供商

| 提供商 | Key 标识 | 免费额度 | 是否需要 VPN | 模型 |
|--------|----------|----------|-------------|------|
| Qwen Embedding | `qwen_embedding` | 1M tokens/天 | 否 | text-embedding-v3 |
| 智谱 Embedding | `zhipu_embedding` | 有免费额度 | 否 | embedding-3 |
| Jina AI | `jina_embedding` | 1M tokens/月 | 否（通常） | jina-embeddings-v3 |
| Google Embedding | `google_embedding` | 1500次/天 | 是 | text-embedding-004 |

**提供商查找优先级**：`qwen_embedding → zhipu_embedding → jina_embedding → google_embedding`

### 搜索策略（自动分级）

```
searchKnowledge(userId, sessionId, query)
      ↓
  用户有 Embedding Key？
  ├── 是：
  │   1. 为 query 生成向量
  │   2. 从 SQLite 取所有带向量的块
  │   3. JS 内存计算余弦相似度
  │   4. 取 Top-5
  └── 否 / 向量搜索失败：
      1. SQLite FTS5 MATCH query
      2. 取 Top-5（按 rank 排序）
```

### RAG 注入到对话

在 `useSSE.ts` 的离线/移动端路径中，发送 AI 请求前：

```typescript
const localKnowledge = await searchKnowledge(userId, sessionId, question)
if (localKnowledge) {
  aiMessages.unshift({
    role: 'system',
    content: `你处于知识库模式，以下是从用户本地知识库检索到的相关内容：\n\n${localKnowledge}`
  })
}
```

---

## 四、SQLite Schema 扩展

### knowledge_chunks（知识块）

```sql
CREATE TABLE knowledge_chunks (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  session_id         TEXT    NULL,           -- 会话级别或全局
  doc_name           TEXT    NOT NULL,
  chunk_index        INTEGER NOT NULL DEFAULT 0,
  content            TEXT    NOT NULL,       -- 文本内容
  embedding          TEXT    NULL,           -- JSON float[]，无 key 时为 NULL
  embedding_provider TEXT    NULL,
  metadata           TEXT    NULL,           -- JSON，保留扩展
  created_at         TEXT    NOT NULL
);
CREATE INDEX idx_kc_user_session ON knowledge_chunks(user_id, session_id);
```

### knowledge_fts（全文检索虚表）

```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  content,
  content='knowledge_chunks',
  content_rowid='rowid',
  tokenize='unicode61'
);
-- INSERT 触发器自动保持 FTS 与主表同步
```

### 既有表（已有 Schema，知识图谱存储）

```sql
knowledge_entities       -- id, doc_id, entity_class, entity_text, attributes
knowledge_relationships  -- id, doc_id, source_text, target_text, relation_type
```

---

## 五、Key 配置入口

所有 Key 在 **模型 & API Key 配置**（右上角 Key 图标）中配置，分为两个标签页：

### 国内直连（无需 VPN）

| 服务 | 用途 | 获取链接 |
|------|------|----------|
| DeepSeek | 大语言模型（对话） | platform.deepseek.com |
| 通义千问 Qwen | 大语言模型（对话）+ Embedding | bailian.console.aliyun.com |
| MiniMax | 大语言模型（对话） | platform.minimaxi.com |
| MinerU PDF 解析 | 深度/知识抽取模式 | mineru.net |
| Qwen Embedding | 向量搜索 | 同 Qwen，无需额外申请 |
| 智谱 Embedding | 向量搜索 | open.bigmodel.cn |
| Jina AI Embedding | 向量搜索 | jina.ai |

### 需要 VPN

| 服务 | 用途 | 获取链接 |
|------|------|----------|
| OpenAI | 大语言模型（对话） | platform.openai.com |
| Google Gemini | 大语言模型（对话）+ Embedding | aistudio.google.com |
| Anthropic Claude | 大语言模型（对话） | console.anthropic.com |
| Google Embedding | 向量搜索 | aistudio.google.com（同 Gemini Key） |

---

## 六、UI 交互流程

```
用户点击 "+" 按钮
      ↓
  选择 PDF 文件
      ↓
  弹出「PDF 解析模式」选择框：
  ├── ⚡ 标准模式 → 本地解析，立即完成
  ├── 🧠 深度模式 → MinerU，需配置 Key
  └── 💎 知识抽取 → MinerU + LLM 知识图谱

（手机端/离线 → handleMobileLocalProcess）
（电脑端/在线 → 后端 uploadApi）

      ↓ 处理完成
  进度消息实时更新
      ↓
  完成消息展示：
  ├── 内容预览（前 200 字）
  ├── 索引块数量
  ├── [知识图谱] 按钮（仅 knowledge 模式且抽取成功）
  └── RAG 自动激活（后续对话自动检索）
```

### 知识图谱可视化（KnowledgeGraphModal）

- ECharts Graph + Force 布局
- 节点按实体类型着色（6 种颜色）
- 支持拖拽、缩放、悬停高亮邻接节点
- 关系标签显示在边上

---

## 七、核心文件清单

| 文件 | 职责 |
|------|------|
| `frontend/src/services/mobileKnowledgeService.ts` | 主服务：PDF解析、MinerU调用、分块、图谱抽取、RAG检索 |
| `frontend/src/services/embeddingService.ts` | 多家 Embedding API 调用（Qwen/智谱/Jina/Google）|
| `frontend/src/services/db.ts` | SQLite schema + knowledge_chunks + FTS5 CRUD |
| `frontend/src/components/KnowledgeGraphModal.tsx` | 知识图谱 ECharts 可视化弹窗 |
| `frontend/src/components/ModelKeyModal.tsx` | Key 配置 UI（含国内/VPN 分组、MinerU、Embedding）|
| `frontend/src/components/InputBar.tsx` | PDF 上传路由（手机本地 vs 后端）|
| `frontend/src/hooks/useSSE.ts` | RAG 知识注入（本地检索结果 → 系统提示词）|

---

## 八、最低配置要求

| 场景 | 必需 Key | 可选 Key |
|------|----------|----------|
| 标准模式对话 | 任意 LLM Key | Embedding Key（提升搜索质量）|
| 深度模式对话 | LLM Key + MinerU Key | Embedding Key |
| 知识抽取+图谱 | LLM Key + MinerU Key | Embedding Key |
| 纯文本文件对话 | 任意 LLM Key | — |

**最轻配置**：只需一个 DeepSeek Key（有免费额度，国内可用），即可使用标准模式。

---

## 九、已知限制

| 限制 | 说明 |
|------|------|
| 向量在内存计算 | 文档很多时（1000+ 块）搜索可能有轻微延迟 |
| MinerU 超时 | 复杂文档最长等待 5 分钟 |
| 知识图谱存 localStorage | 大型图谱（100+ 实体）可能影响内存 |
| FTS5 中文分词 | `unicode61` tokenizer 对中文按字符分词，精度低于语义搜索 |
| pdfjs worker | iOS WKWebView 需要 Capacitor 6.x 以上支持 |
