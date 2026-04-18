# 规格：编码规范 (Coding Style)

> 适用范围：`backend/`（Python）+ `frontend/src/`（TypeScript/React）
> 版本：v1.0

---

## 1. Python 命名约定

| 元素 | 规范 | 示例 |
|------|------|------|
| 函数 / 方法 | `snake_case` | `run_thinking_mode`, `get_current_user` |
| 变量 | `snake_case` | `session_id`, `exec_result` |
| 类 | `PascalCase` | `PythonExecutor`, `DatabaseConfig` |
| 常量 | `UPPER_SNAKE_CASE` | `SECRET_KEY`, `ALLOWED_MODULES` |
| 私有辅助函数 | 前缀 `_` | `_detect_filename_hint`, `_is_safe` |
| 路由文件 | `*_router.py` | `chat_router.py`, `database_router.py` |
| 数据库层文件 | `*_db.py` | `session_db.py`, `user_db.py` |

**路由命名**：
- GET 集合：`get_*s`（`get_databases`）
- GET 单个：`get_*`（`get_session`）
- 操作类：动词开头（`switch_database`, `test_connection`）
- 异步处理函数：`run_*_mode`（`run_thinking_mode`）

---

## 2. TypeScript / React 命名约定

| 元素 | 规范 | 示例 |
|------|------|------|
| 变量 / 函数 | `camelCase` | `sessionId`, `getBaseURL` |
| React 组件 | `PascalCase` | `MessageItem`, `DataSourceModal` |
| 自定义 Hook | `use` 前缀 + `PascalCase` | `useSSE`, `useAuthStore` |
| 接口 / 类型 | `PascalCase` | `KGEntity`, `SSEHandlers` |
| 常量（模块级） | `UPPER_SNAKE_CASE` | `API_BASE_URL` |
| 状态变量 | `[value, setValue]` 对命名 | `[error, setError]`, `[isLoading, setIsLoading]` |
| 布尔状态 | `is*` / `has*` 前缀 | `isStreaming`, `isPdfDownloading` |

**组件文件命名**：
- 组件：`PascalCase.tsx`（`MessageItem.tsx`）
- Hook：`camelCase.ts`（`useSSE.ts`）
- API 模块：`camelCase.ts`，按领域导出（`authApi`, `chatApi`）

---

## 3. Python 代码结构约定

**Router 文件结构顺序**：
```python
# 1. 标准库 import
# 2. 第三方库 import
# 3. 本地模块 import（相对路径）
# 4. Pydantic 模型定义
# 5. 辅助函数（下划线前缀）
# 6. 路由处理函数（async def）
```

**异步函数**：所有 I/O 操作必须用 `async def` + `await`，禁止在 FastAPI 路由里调用同步阻塞 I/O。

**SSE 生成器**：每个模式的 `event_generator` 必须在 `run_*_mode` 函数内部定义，不得提升为顶层函数（避免意外共享状态）。

**异常处理**：
```python
# 好：记录日志，返回格式化错误给前端
try:
    result = await do_something()
except SomeError as e:
    logger.error(f"context: {e}")
    yield {"event": "stream_error", "data": {"message": str(e)}}

# 避免：裸 except 吞掉所有异常
try:
    ...
except:
    pass
```

---

## 4. TypeScript / React 代码结构约定

**组件结构顺序**：
```tsx
// 1. import
// 2. 接口/类型定义（仅限本文件使用的）
// 3. 组件函数
//    a. useState / useRef / useContext
//    b. useEffect
//    c. 事件处理函数（handle* 前缀）
//    d. 渲染辅助函数（render* 前缀，或抽取为子组件）
//    e. return JSX
```

**状态管理**：
- 组件内局部状态：`useState`
- 跨组件共享状态：`zustand` store（`useAuthStore` 等）
- 禁止 prop drilling 超过 2 层，改用 store 或 context

**API 调用**：
- 所有请求通过 `frontend/src/api/index.ts` 的封装函数发出
- 禁止在组件内直接调用 `axios`/`fetch`
- SSE 连接统一通过 `useSSE` hook 管理，禁止在组件内直接操作 `fetch` + `ReadableStream`

---

## 5. 注释规范

只在以下情况写注释，其他情况不写：
- 隐藏约束（"bcrypt 最大处理 72 字节，中文字符会截断"）
- 非直觉的业务规则（"科学家模式即使模型返回 thinking 内容也不保存"）
- 已知 workaround（"Capacitor WKWebView 不支持 `{}` 语法，见 Issue #xxx"）

**禁止**：
- 解释"这段代码做了什么"的注释（命名已经说明了）
- `# TODO`（用 GitHub Issue 追踪，不要留在代码里）
- 多行 docstring（公共 API 除外）

---

## 6. PR Checklist

提交 PR 前，自查以下项目：

### 功能正确性
- [ ] 新功能在 Web 端测试过
- [ ] 新功能在移动端（iOS 模拟器）测试过（若涉及 UI）
- [ ] 涉及多租户的接口，验证过 `user_id` 过滤正确工作
- [ ] SSE 流式接口，验证过"中止"场景不会导致后端 worker 挂起

### Spec 同步
- [ ] 新功能已在 `specs/` 对应文件中更新或新增
- [ ] 若引入重大架构决策，已在 `specs/adr/` 新增 ADR

### 代码质量
- [ ] Python：无裸 `except` 吞掉所有异常
- [ ] Python：无同步阻塞 I/O 在 FastAPI 路由里
- [ ] TypeScript：ESLint 零 warning（`npm run lint` 通过）
- [ ] 无调试代码遗留（`console.log` 的调试输出、hardcoded test data）
- [ ] 新的数据库查询带 `user_id` 过滤（多租户）

### 安全
- [ ] 新接口有 `Depends(get_current_user)` 鉴权（除非是公开接口，需注释说明理由）
- [ ] 无新增的 SQL 字符串拼接（必须用参数化查询）
- [ ] 敏感字段（API Key、密码）未出现在日志输出中

### 提交消息格式
```
<type>: <简短描述>（不超过 72 字符）

[可选正文：解释 why，不是 what]
```

类型前缀：
- `feat:` 新功能
- `fix:` bug 修复（**仅在用户验证后使用**）
- `refactor:` 重构（无功能变化）
- `wip:` 进行中，未完成
- `chore:` 构建/依赖/配置变更
- `docs:` 仅文档变更
- `spec:` 仅 spec 变更

> **约定**：`fix:` 前缀只在用户确认 bug 已修复后使用，开发过程中用 `wip:` 或 `refactor:`。
