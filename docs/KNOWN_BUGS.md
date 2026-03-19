# 已知问题 (Known Bugs)

本文档只记录**当前尚未解决**的问题及技术限制。已修复的 Bug 请查阅各功能模块的变更历史。
🔴 = 未修复　⚠️ = 已缓解（不完全解决）

> 最后更新：2026-03-19

---

## 📱 移动端 (iOS/Android)

### 1. 布局崩溃与错位 🔴
- **现象**：在 iOS 模拟器/真机中，应用内容可能塌陷为右侧一个窄条，或者出现大面积竖向空白。
- **原因**：移动端 Viewport (100vh) 计算受 Safe Area 干扰，且 Web 端的 `max-width` 与 `padding` 约束未在移动端模式下彻底隔离。
- **修复计划**：重构 `App.tsx` 使用 `fixed inset-0` 结合 `dvh` 单位，并注入 Safe Area CSS 变量。

### 2. API 连通性故障 (401 Unauthorized) 🔴
- **现象**：登录请求可能返回 `index.html` 源码，或者在调用手动报告生成接口时报 401。
- **原因**：移动端 Web 容器无法自动识别 `localhost` 相对路径，请求被 Vite 服务器拦截；部分组件调用 API 时未正确注入 Token。
- **临时方案**：在 `frontend/.env.development.local` 中配置电脑绝对局域网 IP。

---

## 📄 报告生成与 PDF 导出

### 1. ECharts 图片缺失 🔴
- **现象**：导出的 PDF 报告包含封面和表格，但没有 ECharts 动态图表。
- **原因**：WeasyPrint 为静态 HTML 渲染器，不支持运行 JavaScript 生成 Canvas 图片。
- **修复计划**：研究服务端渲染 (SSR) 方案，由后端直接生成图表图片嵌入 PDF。

### 2. macOS 预览字体兼容性 ⚠️
- **现象**：PDF 在部分低版本 macOS 预览工具中可能出现汉字缺失。
- **状态**：已注入苹方字体栈，大部分环境已修复，老旧环境仍存风险。

---

## 🧠 AI 分析与 Token

### 1. 长文本截断 ⚠️
- **现象**：生成极大型报表时，偶尔出现 `Unterminated string`（JSON 解析失败）。
- **原因**：HTML 代码量超过了 DeepSeek 输出 Token 限制。
- **状态**：已通过调优 `max_tokens=4000` 并增加 JSON 自动补全逻辑缓解，极端情况仍可能触发。

### 2. PostgreSQL 日期函数兼容性 🔴
- **现象**：对 `postgres_example` 库查询"最近 N 个月"时，AI 可能生成 MySQL 风格的 `DATE_SUB()`，导致 SQL 报错。
- **原因**：`prompt_templates.py` 中的示例 SQL 均为 MySQL 语法，AI 倾向于复用示例风格。
- **临时方案**：用户可在提问时补充"请使用 PostgreSQL 语法"。
- **修复计划**：在 Prompt 中按数据库类型分支给出语法示例。

---

## 🔄 同步

### 1. 同步无实时推送 🔴
- **现象**：另一台设备的操作需等最多 60 秒（下次 ping 轮询）或切回前台才能同步到当前设备。
- **修复计划**：引入 WebSocket 或 SSE 长连接实现服务端主动推送。

---

## 🗄️ 仿真数据库

### 1. 已有数据库无法自动迁移 ⚠️
- **现象**：如果 Docker Volume 已存在（之前运行过），seed 脚本不会重跑，旧数据库缺少新字段（如 `financial_records.record_date`、`ad_attribution.event_date`）。
- **临时方案**：执行 `docker-compose down -v && docker-compose up --build` 重建 Volume（**会清空所有数据**）。
- **修复计划**：为各脚本增加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 迁移逻辑。
