# 010 - AI 思考过程 (Thinking Process) 捕获与传递标准

## 1. 背景
系统支持 DeepSeek-Reasoner, Gemini-Thinking, Claude 等具有推理过程的模型。为了确保前端能一致地展示“思考过程”按钮，必须在全链路（LLM -> Agent -> Router -> DB）统一数据协议。

## 2. 核心协议 (Standard Protocol)

### 2.1 Agent 吐出标准
所有 Agent 的流式生成器（Generator）必须吐出以下格式的字典：
- **思考中**：`{"event": "model_thinking", "data": {"content": "..."}}`
- **正文中**：`{"event": "summary", "data": {"content": "..."}}`
- **已完成**：`{"event": "done", "data": {...}}`

### 2.2 LLM 提取标准 (LLM Factory / Agent Internal)
由于不同供应商（OpenAI, Anthropic, Google）和不同的 LangChain 适配器对 `reasoning_content` 的封装位置不同，提取逻辑必须包含以下兜底顺序：
1. `chunk.additional_kwargs.get("reasoning_content")`
2. `getattr(chunk, "reasoning_content")`
3. `chunk.content` (如果开启了思考模式且满足特定启发式规则)

### 2.3 Router 采集标准
`chat_router.py` 必须在 SSE 循环中无差别累积所有符合 `thinking/reasoning/model_thinking` 类型的事件到变量 `assistant_reasoning` 中。

### 2.4 数据库存储标准
数据库表 `messages` 的字段名固定为 `thinking` (LONGTEXT)。保存消息时，必须将累积的字符串完整存入。

## 3. 兼容性保证
- **新增模型**：只需在 `Agent` 的流解析处适配新模型的 reasoning 字段，并将其转换为标准 `model_thinking` 事件。
- **改动检查**：任何涉及 `chat_router.py` 或 `Agent` 的重构，必须搜索 `assistant_reasoning +=` 确保逻辑未被破坏。
