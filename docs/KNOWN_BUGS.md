# 已知问题 (Known Bugs)

本文档记录当前系统中尚未解决的已知问题及技术限制。

## 📱 移动端 (iOS/Android) 遗留问题

### 1. 布局崩溃与错位
- **现象**：在 iOS 模拟器/真机中，应用内容可能塌陷为右侧一个窄条，或者出现大面积竖向空白。
- **原因**：移动端 Viewport (100vh) 计算受 Safe Area 干扰，且 Web 端的 `max-width` 与 `padding` 约束未在移动端模式下彻底隔离。
- **修复计划**：重构 `App.tsx` 使用 `fixed inset-0` 结合 `dvh` 单位，并注入 Safe Area CSS 变量。

### 2. API 连通性故障 (401 Unauthorized)
- **现象**：登录请求可能返回 `index.html` 源码，或者在调用手动报告生成接口时报 401。
- **原因**：
    - 移动端 Web 容器无法自动识别 `localhost` 相对路径，请求被 Vite 服务器拦截。
    - 部分内部组件（如看板预览）在调用 API 时曾存在未正确注入 Zustand Token 的情况。
- **临时方案**：在 `frontend/.env.development.local` 中配置电脑绝对局域网 IP。

## 📄 报告生成与 PDF 导出

### 1. ECharts 图片缺失
- **现象**：导出的 PDF 报告包含封面和表格，但没有 ECharts 动态图表。
- **原因**：WeasyPrint 为静态 HTML 渲染器，不支持运行 JavaScript 生成 Canvas 图片。
- **修复计划**：研究服务端渲染 (SSR) 方案，由后端直接生成图表图片嵌入 PDF。

### 2. macOS 预览字体兼容性
- **现象**：PDF 在部分低版本 macOS 预览工具中可能出现汉字缺失。
- **状态**：已在 v1.8.0 中注入苹方字体栈，大部分环境已修复，老旧环境仍存风险。

## 🧠 AI 分析与 Token

### 1. 长文本截断
- **现象**：生成极大型报表时，偶尔出现 `Unterminated string` (JSON 解析失败)。
- **原因**：HTML 代码量超过了 DeepSeek 输出 Token 限制。
- **状态**：已通过调优 `max_tokens=4000` 并增加 JSON 自动补全逻辑缓解。
