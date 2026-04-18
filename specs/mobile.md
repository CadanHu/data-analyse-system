# 规格：移动端适配 (Mobile)

> 来源：`data-sys-docs/MOBILE_OFFLINE_SPEC.md` + `data-sys-docs/MOBILE_KNOWLEDGE_SPEC.md` + `GEMINI.md` 整合
> 版本：v2.0

---

## 1. 平台支持

| 平台 | 实现方式 | 状态 |
|------|---------|------|
| iOS | Capacitor 6 + WebView | ✅ 支持 |
| Android | Capacitor 6 + WebView | ✅ 支持 |
| Web | React SPA | ✅ 支持 |

---

## 2. 网络连接规范

| 约束 | 规格 |
|------|------|
| API 地址 | 必须通过 `getBaseURL()` 动态获取，禁止硬编码 `localhost` |
| Android 模拟器网关 | `10.0.2.2:8000`（宿主机地址） |
| iOS 真机/局域网 | 自动发现局域网 IP |
| HTTP/HTTPS | 强制 `androidScheme: 'http'`，允许明文传输 |
| Capacitor 原生拦截 | 禁用，让 WebView 原始 fetch 处理流式响应 |
| 调试覆盖 | `MobileDebugPanel` 允许手动覆盖后端 IP |

---

## 3. 布局规范

| 约束 | 规格 |
|------|------|
| 视口单位 | 必须使用 `h-dvh` 或 `fixed inset-0`，禁止 `h-screen` |
| 横屏样式 | 必须使用 `data-orientation="landscape"` 精准隔离，禁止全局 `landscape:` 修饰符 |
| 移动端样式 | 必须使用根容器 `data-mobile="true"` 精准隔离，不能影响桌面端 |

---

## 4. 离线功能规范

移动端支持完整的离线工作流（无需服务器）：

```
PDF 文件
  ↓
三种处理模式：
  ① 标准模式  → PDF.js 本地解析（完全离线）
  ② 深度模式  → MinerU API（用户自己的 Key）
  ③ 知识抽取  → MinerU + LLM 实体关系抽取
  ↓
文本分块（CHUNK_SIZE=800，OVERLAP=100）
  ↓
向量化（有 Embedding Key）或 FTS5（无 Key）
  ↓
本地 SQLite（knowledge_chunks + knowledge_fts）
  ↓
RAG 注入对话上下文 → AI 回答
```

完整离线规格见 `data-sys-docs/MOBILE_OFFLINE_SPEC.md`

---

## 5. 功能同等性原则（Mobile/Web Parity）

**所有新功能和 bug 修复必须同时检查手机端和 Web 端，分别独立验证。**

- 新增功能：先验证 Web，再验证 iOS，再验证 Android
- Bug 修复：确认修复后，必须在另一个平台重新验证（不假设 Web 修了 Mobile 也修了）

---

## 6. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| Android 模拟器发消息 | 不出现 Network Error，思考内容实时显示 | ❌ 未覆盖 |
| iOS 真机切换横屏 | 布局正确，无元素溢出 | ❌ 未覆盖 |
| 移动端上传 PDF | 可完整完成知识抽取流程 | ❌ 未覆盖 |
| 移动端无网络时 | 使用本地 SQLite RAG 仍可回答文档问题 | ❌ 未覆盖 |
| 工具栏遮挡 | 使用 `h-dvh` 后内容不被浏览器工具栏遮挡 | ❌ 未覆盖 |
