# 规格：核心交互流程 (UX Flows)

> 来源：`frontend/src/components/` + `frontend/src/hooks/useSSE.ts` + 路由逻辑逆向
> 版本：v1.0

---

## 1. 登录 / 注册流程

```
[登录页]
  │
  ├─ 填写用户名 + 密码 → POST /auth/login
  │    ├─ 成功 → 写入 JWT Token (localStorage) → 跳转主页
  │    └─ 失败 → 行内错误提示（不清空密码字段）
  │
  └─ 点击"注册" → 切换注册表单 → POST /auth/register
       ├─ 成功 → 自动登录 → 跳转主页
       └─ 失败（用户名已存在）→ 行内错误提示
```

**异常状态**：
- Token 过期 → 后端返回 401 → 前端清除 Token → 跳转登录页（`ProtectedRoute` 拦截）
- 网络断开 → axios 拦截器捕获，显示网络错误提示

---

## 2. 数据库连接流程

```
[主页] → 点击"数据源"按钮 → [DataSourceModal]
  │
  ├─ 填写 Host / 数据库名 / 用户名 / 密码
  ├─ 点击"测试连接" → POST /database/test-connection
  │    ├─ 成功 → 绿色提示"连接成功"
  │    └─ 失败 → 行内错误（显示后端 detail 字段或"保存失败"兜底）
  │
  └─ 点击"保存" → POST /database/datasources
       ├─ 成功 → 关闭 Modal，数据源列表刷新
       └─ 失败 → 行内错误提示（不关闭 Modal）
```

**前端校验顺序**（提交前，不发请求）：
1. Host 不为空
2. 数据库名不为空
3. 用户名不为空
4. 新建时密码不为空（编辑时可留空表示不修改）
5. 显示名称不为空

**切换激活数据源**：
```
[数据源列表] → 点击某条记录 → POST /database/switch
  → 成功 → 当前 Session 绑定该数据源
  → 失败 → toast 错误提示
```

---

## 3. 发送消息 / 流式回答流程

```
[InputBar] → 用户输入并提交
  │
  ├─ 前端立即创建乐观消息（用户消息 + 占位 AI 消息）显示到 MessageList
  ├─ useSSE.connect() → POST /chat/stream（fetch + ReadableStream）
  │
  │  SSE 事件序列（正常路径）：
  │    thinking → 显示 ThinkingIndicator（思考模式/深度模式专有）
  │    token    → 逐字追加到 AI 消息气泡
  │    sql_result → 渲染 SqlBlock 表格
  │    chart_ready → 渲染 EChartsRenderer
  │    plot_ready  → 渲染 Matplotlib 图片（科学家模式）
  │    done    → 停止流，保存完整消息到 DB
  │
  └─ 异常路径：
       stream_error → 显示红色错误消息气泡
       网络中断    → AbortController 触发，AI 消息气泡显示"连接中断"
       重复提交    → InputBar 禁用（isStreaming 状态锁定）
```

**中止流**：用户点击"停止"按钮 → `abortController.abort()` → 当前流立即停止，已接收内容保留显示。

---

## 4. 文件上传 / RAG 知识库流程

```
[RagManagerModal] → 选择文件 → POST /upload/file
  │
  ├─ 上传中 → 进度条显示
  ├─ 成功 → 触发解析任务（后台异步）
  │    ├─ PDF.js 快速解析（默认）
  │    ├─ MinerU 深度解析（可选）
  │    └─ LLM 知识图谱抽取（可选）
  └─ 失败 → alert 提示（文件类型不支持 / 超出大小限制）

[解析完成后]
  → 文档出现在 RAG 列表中，可切换"是否激活"
  → 激活文档参与向量检索，下次对话自动带入上下文
```

**知识图谱专属流程**：
```
[知识图谱抽取] → 完成后 → [KnowledgeGraphModal]
  → ECharts force graph 渲染实体关系网络
  → 可点击节点查看详情 / 搜索实体路径
```

---

## 5. 会话管理流程

```
[SessionList]
  │
  ├─ 新建会话 → POST /sessions → 跳转新会话（空消息列表）
  ├─ 切换会话 → GET /sessions/{id}/messages → 加载历史消息
  ├─ 重命名会话 → 双击标题 → PATCH /sessions/{id}（inline 编辑）
  ├─ 删除会话 → 确认弹窗 → DELETE /sessions/{id}
  └─ 导出会话 → GET /sessions/{id}/export?format=md|txt|pdf
```

**自动命名**：首条消息发送后，后台异步生成标题（`_handle_session_auto_title`），完成后通过轮询或下次加载刷新显示。

---

## 6. 图表 / 报告交互流程

```
[AI 回复包含图表]
  │
  ├─ ECharts 图表 → 可点击图例 / 缩放 / 下载为 PNG
  ├─ Matplotlib 图片 → 点击全屏预览
  └─ SQL 表格 → 可排序列，点击"下载 CSV"

[生成报告]
  → 点击"生成报告" → POST /chat/report
  → 轮询 GET /messages/{id}（`is_report_generating` 状态）
  → 完成 → 消息气泡变为可展开的 HTML 报告
  → 导出 PDF → 调用后端 /chat/export-pdf（Chromium 渲染）
```

---

## 7. 错误状态总览

| 错误类型 | 触发场景 | 展示方式 |
|---------|---------|---------|
| 表单校验失败 | 提交前缺少必填字段 | 行内红色文字（不发请求） |
| API 错误 | 后端返回 4xx/5xx | `error.response.data.detail` 或兜底文案 |
| 流式连接中断 | 网络异常 / 服务重启 | 消息气泡内红色提示 |
| Token 过期 | 所有需鉴权请求返回 401 | 跳转登录页 |
| PDF 导出失败 | Chromium 超时 / 服务异常 | `alert()` 弹窗（当前实现） |
| 图表渲染失败 | JSON 解析错误 | `console.error` + 不渲染（静默失败） |

> **待改进**：图表渲染失败目前静默（只打 console.error），应改为显示降级的纯文本内容。
> **待改进**：PDF 导出错误使用 `alert()`，移动端体验差，应替换为 toast 组件。
