# DeepSeek 思考模式支持

**需求编号**: 001  
**创建日期**: 2026-02-22  
**状态**: 待开发

---

## 任务目标

在正式开发前，对 DeepSeek API 进行完整的接口行为测试，输出两个文件：
1. `test_deepseek.py` - 覆盖所有测试用例的可执行脚本
2. `deepseek_api_spec.md` - 接口字段规范文档（供前后端对接使用）

---

## 模型信息

- 接入方式：OpenAI SDK 兼容
- base_url：`https://api.deepseek.com`
- 统一使用 model：deepseek-chat
- API Key：从环境变量读取，变量名为 `DEEPSEEK_API_KEY`

---

## 思考模式说明

DeepSeek 支持两种运行模式，两种都需要测试：

### 模式 A — 普通模式（默认）
不传 `thinking` 参数，模型直接输出最终回答

### 模式 B — 思考模式
通过 `extra_body` 开启，响应中会多出 `reasoning_content` 字段：

```python
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages,
    stream=True,
    extra_body={"thinking": {"type": "enabled"}}
)
```

**流式响应字段**：
- `chunk.choices[0].delta.reasoning_content` - 思考链内容，可能为 None
- `chunk.choices[0].delta.content` - 最终回答内容，可能为空字符串

---

## 测试用例清单

### Case 1：非流式调用 × 普通模式
- 验证目标：记录完整的 response 对象字段结构
- 输出要求：打印 `response.model_dump()` 的完整 JSON

### Case 2：流式调用 × 普通模式
- 验证目标：记录每个 chunk 的字段，统计共收到多少个 chunk

### Case 3：流式调用 × 思考模式（核心用例）
- 验证目标：
  - `reasoning_content` 和 `content` 在什么阶段出现
  - 两者是否会同时非空
  - `reasoning_content` 结束后 `content` 才开始，还是交替出现
- 输出要求：
  - 分别拼接完整的 `reasoning_content` 和 `content` 并打印
  - 记录 `reasoning_content` 的 chunk 数量 vs `content` 的 chunk 数量

### Case 4：多轮对话 × 思考模式
- 验证目标：确认多轮对话时 messages 的正确拼接方式
- 要求测试以下两种拼接方式，并对比输出结果是否一致：
  - 方式 X（正确方式）：只将 `content` 追加到 messages
  - 方式 Y（错误方式）：将 `reasoning_content + content` 都追加到 messages
- 目的：验证方式 Y 是否会导致 Token 浪费或响应异常

### Case 5：异常场景测试
- 传入无效 API Key → 记录错误码和错误信息结构
- 传入空 messages 列表 → 记录报错信息
- `max_tokens` 设置为 1 → 观察截断行为和响应结构

---

## 输出文件要求

### test_deepseek.py
- 每个 Case 用函数封装，函数名与用例编号对应（如 `test_case_3`）
- 每个 Case 执行前打印分隔线和用例名称，方便阅读日志
- 异常用 try/except 捕获，不要让一个 Case 失败导致后续用例跳过
- 文件末尾的 main 函数按顺序执行全部 Case

### deepseek_api_spec.md
测试完成后，根据实际观测结果生成，必须包含：
1. 响应对象完整字段列表（字段名 / 类型 / 含义 / 可能为空的情况）
2. 流式 chunk 的字段结构说明
3. 思考模式下 `reasoning_content` 和 `content` 的出现规律
4. 多轮对话 messages 的正确拼接方式（附代码示例）
5. 前端处理 SSE 流时需要注意的边界情况
6. 已确认的异常码列表

---

## 执行顺序

1. 先生成 `test_deepseek.py`
2. 等待确认可以运行后，运行测试
3. 根据测试结果生成 `deepseek_api_spec.md`
