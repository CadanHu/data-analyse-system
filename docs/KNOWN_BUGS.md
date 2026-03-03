# 已知 Bug 列表 (已修复)

## ✅ 认证相关 Bug (已修复)

### Bug 1: 登录后 Token 未正确附加到后续请求 (已修复)
- **现象**: 登录成功后调用 `/api/auth/me` 返回 401 Unauthorized。
- **原因**: `getMe()` 在 `setAuth()` 异步更新持久化存储前被调用，拦截器无法获取最新 Token。
- **修复**: 在 `authStore` 中添加 `setToken` 同步操作。在 `Login.tsx` 中，登录成功后先调用 `setToken`，确保 `api` 拦截器能立即获取 Token，然后再调用 `getMe()`。

### Bug 2: 注册时用户名被设置为验证码 (已修复)
- **现象**: 注册后数据库中的 `username` 字段值为验证码。
- **原因**: 浏览器自动填充（Auto-fill）在没有 `name` 属性的表单字段上发生混淆。
- **修复**: 
  - 为 `Register.tsx` 的所有输入框添加了显式的 `name` 和 `autoComplete` 属性。
  - 完善了 `RegisterCredentials` 类型定义。
  - 添加了注册请求的调试日志。

---

## ✅ 配置相关 Bug (已修复)

### Bug 3: 本地测试配置会被提交到 Git (已修复)
- **现象**: `frontend/src/api/index.ts` 中硬编码了本地端口和 Capacitor 逻辑，容易被误提交。
- **修复**: 
  - 引入了 Vite 环境变量机制。
  - 创建了 `frontend/.env.development` 和 `frontend/.env.production` 分离环境配置。
  - 修改 `api/index.ts` 优先从 `import.meta.env.VITE_API_BASE_URL` 获取路径。
  - 在 `.gitignore` 中完善了对 `.env.*.local` 的屏蔽。

---

**最后更新**: 2026-02-28
**版本**: v1.7.1 (Bugfix Release)
