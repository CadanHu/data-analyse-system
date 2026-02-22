# DeepSeek API 接口规范文档

**生成日期**: 2026-02-22  
**基于**: test_deepseek.py 实际测试结果

---

## 1. 响应对象完整字段列表

### 非流式响应（stream=False）

| 字段名 | 类型 | 含义 | 可能为空 | 示例值 |
|--------|------|------|----------|--------|
| `id` | string | 响应唯一标识符 | 否 | `"f6d7b887-452a-4b4f-a8dd-d4175155ce48"` |
| `object` | string | 对象类型 | 否 | `"chat.completion"` |
| `created` | number | 创建时间戳 | 否 | `1771735761` |
| `model` | string | 使用的模型 | 否 | `"deepseek-chat"` |
| `choices` | array | 响应选择列表 | 否 | `[...]` |
| `choices[].index` | number | 选择索引 | 否 | `0` |
| `choices[].message` | object | 消息对象 | 否 | `{...}` |
| `choices[].message.role` | string | 角色 | 否 | `"assistant"` |
| `choices[].message.content` | string | 内容 | 否 | `"人工智能"` |
| `choices[].logprobs` | null | 对数概率 | 是 | `null` |
| `choices[].finish_reason` | string | 完成原因 | 是 | `"length"` (max_tokens=1 时) |

---

## 2. 流式 chunk 的字段结构说明

### 流式响应数据格式

每个 chunk 以 `data: ` 开头，最后一个 chunk 为 `data: [DONE]`。

### 普通模式 chunk 字段

| 字段名 | 类型 | 含义 | 可能为空 |
|--------|------|------|----------|
| `id` | string | 响应 ID | 否 |
| `object` | string | 对象类型 | 否 | `"chat.completion.chunk"` |
| `created` | number | 时间戳 | 否 |
| `model` | string | 模型 | 否 |
| `choices` | array | 选择列表 | 否 |
| `choices[].index` | number | 索引 | 否 |
| `choices[].delta` | object | 增量数据 | 否 |
| `choices[].delta.content` | string | 内容增量 | 是 |
| `choices[].finish_reason` | string/null | 完成原因 | 是 |

### 思考模式 chunk 字段（新增）

| 字段名 | 类型 | 含义 | 可能为空 |
|--------|------|------|----------|
| `choices[].delta.reasoning_content` | string | 思考链内容增量 | 是 |

**说明**：
- `reasoning_content` 只在思考模式下出现
- 同一个 chunk 中，`reasoning_content` 和 `content` 通常不会同时非空

---

## 3. 思考模式下 reasoning_content 和 content 的出现规律

### 观察结果

1. **分阶段输出**：
   - 首先输出 `reasoning_content`（思考阶段）
   - 思考阶段结束后，才开始输出 `content`（回答阶段）
   - 两者**不会交替出现**

2. **Chunk 统计**：
   - Reasoning chunk 数量：取决于问题复杂度
   - Content chunk 数量：取决于回答长度

3. **视觉标识**：
   - 思考阶段显示 `💭`
   - 回答阶段显示 `💬`

---

## 4. 多轮对话 messages 的正确拼接方式

### 结论

**✅ 正确方式（方式 X）：只将 content 追加到 messages**

```python
# 正确做法
messages = [
    {"role": "user", "content": question1},
    {"role": "assistant", "content": answer1},  # 只追加 content
    {"role": "user", "content": question2}
]
```

### ❌ 错误方式（方式 Y）

```python
# 错误做法：不要这样做
combined_content = f"思考：{reasoning1}\n\n回答：{answer1}"
messages = [
    {"role": "user", "content": question1},
    {"role": "assistant", "content": combined_content},  # 错误：追加了 reasoning
    {"role": "user", "content": question2}
]
```

### 对比结果

| 指标 | 方式 X（正确） | 方式 Y（错误） |
|------|----------------|----------------|
| 回答长度 | 1967 字符 | 2243 字符 |
| 回答内容 | 简洁、准确 | 略有不同，冗余 |
| Token 消耗 | 正常 | 更高（浪费 Token） |

---

## 5. 前端处理 SSE 流时需要注意的边界情况

### 5.1 数据格式
- 每个事件以 `data: ` 开头
- 最后一个事件是 `data: [DONE]`
- 需要跳过空行

### 5.2 字段可能为空
- `reasoning_content` 可能为 `null` 或不存在
- `content` 可能为空字符串
- 需要安全地访问字段（使用 `.get()` 或可选链）

### 5.3 处理逻辑示例

```javascript
// 前端 SSE 处理示例
const eventSource = new EventSource('/api/chat/stream');

eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
        eventSource.close();
        return;
    }
    
    try {
        const chunk = JSON.parse(event.data);
        const delta = chunk.choices?.[0]?.delta || {};
        
        // 处理思考内容
        if (delta.reasoning_content) {
            updateThinking(delta.reasoning_content);
        }
        
        // 处理回答内容
        if (delta.content) {
            updateAnswer(delta.content);
        }
    } catch (e) {
        console.error('解析失败:', e);
    }
};
```

---

## 6. 已确认的异常码列表

### 错误响应格式

```json
{
  "error": {
    "message": "错误描述",
    "type": "错误类型",
    "param": null,
    "code": "错误码"
  }
}
```

### 异常列表

| HTTP 状态码 | 错误类型 | 错误码 | 消息 | 触发条件 |
|-------------|----------|--------|------|----------|
| **401** | `authentication_error` | `invalid_request_error` | `Authentication Fails, Your api key: ****xxxx is invalid` | 无效的 API Key |
| **400** | `invalid_request_error` | `invalid_request_error` | `Empty input messages` | 空的 messages 列表 |

### 其他可能的错误（推测）

- `429` - 速率限制
- `500` - 服务器内部错误
- `503` - 服务不可用

---

## 7. API 调用示例

### 7.1 非流式调用 - 普通模式

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "https://api.deepseek.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": "你好"}],
            "stream": False
        }
    )
    result = response.json()
```

### 7.2 流式调用 - 思考模式

```python
import httpx

async with httpx.AsyncClient() as client:
    async with client.stream(
        "POST",
        "https://api.deepseek.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": "你好"}],
            "stream": True,
            "thinking": {"type": "enabled"}
        }
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                chunk = json.loads(data_str)
                # 处理 chunk...
```

---

## 8. 总结

### 关键要点

1. **Base URL**: `https://api.deepseek.com/v1`
2. **Model**: `deepseek-chat`
3. **思考模式**: 通过 `"thinking": {"type": "enabled"}` 开启
4. **多轮对话**: 只追加 `content`，不要追加 `reasoning_content`
5. **流式处理**: 注意 `reasoning_content` 和 `content` 分阶段出现

### 下一步

根据此规范，可以更新后端的 `sql_agent.py` 以支持思考模式，并相应更新前端以显示思考过程。
