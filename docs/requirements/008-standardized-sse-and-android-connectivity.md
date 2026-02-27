# 需求文档 008: 标准化 SSE 协议与安卓全连通性修复

## 1. 背景
安卓模拟器/真机在访问宿主机 API 时面临 Mixed Content 拦截，且 Capacitor 原生拦截器会导致流式响应缓冲，无法实时显示 AI 思考过程。

## 2. 核心修改
- **协议标准化**：后端输出严格遵循 SSE 规范 (`data: <json>

`)。
- **禁用原生拦截**：在 `capacitor.config.ts` 中禁用原生 HTTP 拦截，让 WebView 原始 `fetch` 处理流。
- **网络权限打通**：
    - 引入 `network_security_config.xml` 允许明文传输。
    - 强制开启 `androidScheme: 'http'`，将 Origin 从 HTTPS 降级为 HTTP，解决 Mixed Content 冲突。
- **URL 发现逻辑**：前端统一通过 `getBaseURL()` 识别 Android 专用网关 `10.0.2.2:8000`。

## 3. 验证标准
- 安卓 App 登录不再提示 `Network Error`。
- 发送消息后，思考内容逐字实时跳出，无肉眼可见延迟。
