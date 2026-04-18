# 需求文档 011: 移动端稳定化与可视化报告深度精修

## 1. 背景 (Background)
随着 v1.8.0 版本的发布，系统已具备深度的知识提取与报告生成能力。但在 iOS/Android 模拟器测试中发现，移动端的布局兼容性与网络连通性仍存在瑕疵，且 PDF 导出中图表缺失问题需进一步解决。

## 2. 核心目标 (Objectives)
- **移动端全屏修复**：彻底解决 iOS 上的“窄条”与布局重叠问题。
- **图表导出突破**：实现 PDF 报告中携带 ECharts 静态图片。
- **Token 效率优化**：进一步精简报告生成 Prompt，在不损失视觉效果的前提下降低成本。

## 3. 详细任务 (Detailed Tasks)

### 3.1 移动端 CSS 架构重构
- [ ] 引入 `tailwind-safe-area` 插件，自动适配刘海屏。
- [ ] 将所有 `h-screen` 替换为 `h-dvh` (Dynamic Viewport Height)。
- [ ] 重构 `App.tsx` 布局容器，确保 `isMobile` 下强制使用 `fixed inset-0`。

### 3.2 服务端图表渲染 (SSR)
- [ ] 调研并引入 `pyecharts` 或 `playwright` 后端截屏方案。
- [ ] 修改 `PDFService`，在生成 PDF 前将 HTML 模板中的 ECharts 替换为 Base64 图片。

### 3.3 交互体验增强
- [ ] 增加点赞/点踩后的 AI 自我修正反馈。
- [ ] 在消息记录中显式展示 Token 消耗的金额估算（根据当前汇率）。

## 4. 验证标准 (Acceptance Criteria)
- [ ] iOS 模拟器下页面完美铺满，无任何横向或纵向空白。
- [ ] 导出的 PDF 报告第一页包含业务总结，第二页包含对应的柱状图或饼图图片。
- [ ] 数据库 `messages` 表中的 `feedback_text` 字段能被后台管理面板（预留）正确读取。
