# 006 - 用户认证系统实现规划 (User Authentication System)

## 1. 项目背景
为 DataPulse 增加完整的用户账户体系，支持注册、登录、自动重连。该系统需同时完美适配 Web 端、iOS 模拟器及真机。

---

## 2. 开发路线图 (4 Phases)

### Phase 1: 后端安全基础设施与数据库 (Backend & Database)
- **MySQL 表设计**：创建 `users` 表，包含用户名、邮箱、加密密码（Bcrypt）、头像、时间戳等。
- **安全核心模块**：实现 `utils/security.py`，负责 JWT Token 签发、校验及密码哈希逻辑。
- **认证路由实现**：编写 `routers/auth_router.py`，提供 `/auth/register`, `/auth/login`, `/auth/me` 等 API。
- **数据库迁移脚本**：编写并运行初始化用户表的 Python 脚本。

### Phase 2: 前端认证架构与基础页面 (Frontend Infrastructure)
- **状态管理**：创建 `stores/authStore.ts` (Zustand)，管理 Token、用户信息及持久化逻辑。
- **API 服务层**：创建 `api/authApi.ts`，对接后端认证接口。
- **基础页面设计**：
    - `pages/Login.tsx`：实现符合 DataPulse 风格的玻璃拟态登录卡片。
    - `pages/Register.tsx`：实现用户注册表单及校验逻辑。

### Phase 3: 多端适配与交互优化 (Cross-Platform UI/UX)
- **Safe Area 适配**：确保登录卡片在 iOS 刘海屏下不会被遮挡。
- **软键盘处理**：针对移动端优化表单输入体验，防止键盘弹出时遮挡“登录”按钮。
- **响应式布局**：实现 Web 端固定宽度居中，移动端 90% 宽度自适应排版。
- **视觉增强**：加入登录成功的微动效及错误提示 Toast。

### Phase 4: 路由保护、持久化与测试 (Security & Integration)
- **路由守卫**：在 `App.tsx` 实现保护逻辑，未登录用户访问 `/app` 自动重定向至 `/login`。
- **Token 自动刷新**：实现前端拦截器，在 Token 过期时尝试静默刷新或引导重新登录。
- **Capacitor 存储集成**：针对移动端使用原生存储保存 Token，确保 App 重启后无需重复登录。
- **全流程集成测试**：涵盖 Web/iOS 端的注册、登录、异常流程测试。

---

## 3. 合并策略
1. 在 `feature/user-auth` 完成所有 Phase 且测试通过。
2. 合并 `feature/user-auth` 到 `main`。
3. 切换回 `feature/ios-app-capacitor` 分支并 `git merge main`，同步登录逻辑。
