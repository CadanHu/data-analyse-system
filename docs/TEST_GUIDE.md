# DataPulse 本地测试方案

## 📋 测试环境准备

### 1. 环境要求

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Python | 3.12+ | 后端运行 |
| Node.js | 18+ | 前端运行 |
| MySQL | 8.0+ | 数据库（可选，可用 SQLite 替代） |
| Git | 最新 | 代码管理 |

### 2. 快速启动脚本

创建测试启动脚本 `test-local.sh`：

```bash
#!/bin/bash

# DataPulse 本地测试环境启动脚本

echo "🚀 启动 DataPulse 本地测试环境..."

# 检查环境
echo "📦 检查环境..."

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi
echo "✅ Python: $(python3 --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# 检查 MySQL（可选）
if command -v mysql &> /dev/null; then
    echo "✅ MySQL: 已安装"
else
    echo "⚠️  MySQL: 未安装（将使用 SQLite）"
fi

# 启动后端
echo ""
echo "🔧 启动后端服务..."
cd backend

if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate

if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，请复制 .env.example 并配置"
    echo "   cp .env.example .env"
    exit 1
fi

pip install -r requirements.txt -q

# 初始化数据库
python init_db.py

# 启动后端（后台运行）
python3 -m uvicorn main:app --host 0.0.0.0 --port 8008 --reload &
BACKEND_PID=$!
echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"
echo "📄 API 文档：http://localhost:8008/docs"

cd ..

# 启动前端
echo ""
echo "🎨 启动前端服务..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

# 启动前端（后台运行）
npm run dev -- --port 5188 &
FRONTEND_PID=$!
echo "✅ 前端服务已启动 (PID: $FRONTEND_PID)"
echo "🌐 访问地址：http://localhost:5188"

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "📊 服务状态检查..."

if curl -s http://localhost:8008/docs > /dev/null; then
    echo "✅ 后端服务：运行中"
else
    echo "❌ 后端服务：启动失败"
fi

if curl -s http://localhost:5188 > /dev/null; then
    echo "✅ 前端服务：运行中"
else
    echo "❌ 前端服务：启动失败"
fi

echo ""
echo "=========================================="
echo "🎉 测试环境启动完成！"
echo "=========================================="
echo ""
echo "📌 访问地址:"
echo "   前端：http://localhost:5188"
echo "   后端 API: http://localhost:8008"
echo "   API 文档：http://localhost:8008/docs"
echo ""
echo "🛑 停止服务：按 Ctrl+C 或运行 ./stop-test.sh"
echo ""

# 等待用户中断
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '👋 服务已停止'; exit 0" INT

wait
```

创建停止脚本 `stop-test.sh`：

```bash
#!/bin/bash

echo "🛑 停止 DataPulse 测试服务..."

# 查找并停止进程
pkill -f "uvicorn main:app"
pkill -f "vite"

echo "✅ 所有服务已停止"
```

---

## 🧪 功能测试清单

### 1. 国际化功能测试 (i18n)

#### 测试用例

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| I18N-01 | 语言切换 | 1. 打开首页<br>2. 点击右上角语言切换器<br>3. 切换到英文 | 界面所有文本变为英文 | ⬜ |
| I18N-02 | 语言持久化 | 1. 切换到英文<br>2. 刷新页面 | 保持英文显示 | ⬜ |
| I18N-03 | 登录页国际化 | 1. 切换到中文/英文<br>2. 访问 /login | 表单标签、按钮文字正确切换 | ⬜ |
| I18N-04 | 注册页国际化 | 1. 切换到中文/英文<br>2. 访问 /register | 表单标签、按钮文字正确切换 | ⬜ |
| I18N-05 | 功能页国际化 | 1. 访问 /features<br>2. 切换语言 | 所有功能描述正确翻译 | ⬜ |
| I18N-06 | 教程页国际化 | 1. 访问 /tutorial<br>2. 切换语言 | 5 个步骤正确翻译 | ⬜ |
| I18N-07 | 关于页国际化 | 1. 访问 /about<br>2. 切换语言 | 团队信息、联系方式正确翻译 | ⬜ |
| I18N-08 | 会话列表国际化 | 1. 登录后进入应用<br>2. 切换语言 | "会话列表"、"新建"等按钮正确翻译 | ⬜ |
| I18N-09 | 聊天输入框国际化 | 1. 进入聊天界面<br>2. 切换语言 | 占位符、"思考模式"、"发送"等正确翻译 | ⬜ |
| I18N-10 | 时间格式化国际化 | 1. 创建会话<br>2. 查看时间显示 | 中文显示"刚刚/X 分钟前"，英文显示"X min ago" | ⬜ |

---

### 2. 用户认证测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| AUTH-01 | 用户注册 | 1. 访问 /register<br>2. 填写用户名、邮箱、密码<br>3. 提交 | 注册成功，跳转到登录页 | ⬜ |
| AUTH-02 | 用户登录 | 1. 访问 /login<br>2. 输入邮箱和密码<br>3. 提交 | 登录成功，跳转到应用主页 | ⬜ |
| AUTH-03 | 登录态持久化 | 1. 登录后刷新页面 | 保持登录状态 | ⬜ |
| AUTH-04 | 退出登录 | 1. 点击用户头像<br>2. 确认退出 | 返回登录页，Token 清除 | ⬜ |
| AUTH-05 | 未登录访问保护路由 | 1. 退出登录<br>2. 访问 /app | 重定向到 /login | ⬜ |

---

### 3. 会话管理测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| SES-01 | 创建会话 | 1. 登录后<br>2. 点击"新建"按钮 | 创建新会话，标题为"未命名会话" | ⬜ |
| SES-02 | 会话列表显示 | 1. 创建多个会话<br>2. 查看列表 | 所有会话按时间排序显示 | ⬜ |
| SES-03 | 会话搜索 | 1. 在搜索框输入关键词<br>2. 查看过滤结果 | 只显示匹配的会话 | ⬜ |
| SES-04 | 会话重命名 | 1. 双击会话标题<br>2. 输入新标题<br>3. 回车确认 | 标题更新并保存 | ⬜ |
| SES-05 | 会话删除 | 1. 点击会话删除按钮<br>2. 确认删除 | 会话从列表移除 | ⬜ |
| SES-06 | 会话切换 | 1. 点击不同会话<br>2. 查看聊天内容 | 正确加载对应会话的历史消息 | ⬜ |

---

### 4. 聊天功能测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| CHAT-01 | 发送消息 | 1. 选择会话<br>2. 输入问题<br>3. 点击发送 | 消息显示在聊天区，收到 AI 回复 | ⬜ |
| CHAT-02 | 思考模式 | 1. 开启思考模式<br>2. 发送复杂问题 | 显示 AI 思考过程（黄色框） | ⬜ |
| CHAT-03 | 知识库模式 | 1. 开启 RAG 模式<br>2. 上传 PDF<br>3. 提问 | AI 基于文档内容回答 | ⬜ |
| CHAT-04 | 文件上传 | 1. 点击上传按钮<br>2. 选择文件 | 文件名显示在输入框 | ⬜ |
| CHAT-05 | 流式响应 | 1. 发送问题<br>2. 观察响应 | AI 回复逐字显示，非一次性加载 | ⬜ |
| CHAT-06 | 多轮对话 | 1. 发送第一个问题<br>2. 基于回答追问 | AI 理解上下文，回答连贯 | ⬜ |

---

### 5. 数据库切换测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| DB-01 | 查看数据库列表 | 1. 进入会话<br>2. 点击右上角数据库按钮 | 显示可用数据库列表 | ⬜ |
| DB-02 | 切换数据库 | 1. 选择不同数据库<br>2. 发送问题 | AI 基于新数据库 Schema 回答 | ⬜ |
| DB-03 | 数据库持久化 | 1. 切换数据库<br>2. 刷新页面 | 保持所选数据库 | ⬜ |

---

### 6. 可视化功能测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| VIZ-01 | 自动生成图表 | 1. 发送数据分析问题<br>2. 等待 AI 回复 | 右侧面板显示图表 | ⬜ |
| VIZ-02 | 图表类型切换 | 1. 查看图表<br>2. 点击不同类型按钮 | 图表类型切换（柱状图/折线图/饼图） | ⬜ |
| VIZ-03 | 查看 SQL | 1. 收到 AI 回复后<br>2. 点击"复制 SQL" | SQL 语句显示并可复制 | ⬜ |
| VIZ-04 | 全屏模式 | 1. 点击全屏按钮<br>2. 查看图表 | 图表占满整个屏幕 | ⬜ |
| VIZ-05 | 数据表格 | 1. 收到数据回复<br>2. 查看表格 | 数据正确显示，支持排序 | ⬜ |

---

### 7. 移动端适配测试

| ID | 测试项 | 操作步骤 | 预期结果 | 状态 |
|----|--------|----------|----------|------|
| MOB-01 | 竖屏布局 | 1. 手机浏览器访问<br>2. 竖屏查看 | 三栏布局变为 Tab 切换 | ⬜ |
| MOB-02 | 横屏布局 | 1. 手机横屏<br>2. 查看布局 | 优化横屏布局，最大化画布 | ⬜ |
| MOB-03 | 触控交互 | 1. 点击按钮<br>2. 滑动列表 | 响应灵敏，无延迟 | ⬜ |
| MOB-04 | 安全区域适配 | 1. iPhone 查看<br>2. 检查刘海屏 | 内容不被刘海遮挡 | ⬜ |

---

## 🔧 自动化测试脚本

### 1. 后端 API 测试

创建 `backend/tests/test_i18n.py`：

```python
"""
国际化 API 测试
"""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    """健康检查"""
    response = client.get("/health")
    assert response.status_code == 200

def test_auth_register():
    """用户注册测试"""
    response = client.post("/api/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpass123",
        "verification_code": "123456"
    })
    # 首次注册应成功或提示验证码错误（取决于后端配置）
    assert response.status_code in [200, 400]

def test_auth_login():
    """用户登录测试"""
    response = client.post("/api/auth/login", json={
        "username": "test@example.com",
        "password": "testpass123"
    })
    # 如果用户存在应返回 token
    if response.status_code == 200:
        assert "access_token" in response.json()

def test_get_databases():
    """获取数据库列表测试"""
    response = client.get("/api/databases")
    assert response.status_code == 200
    data = response.json()
    assert "databases" in data
```

运行后端测试：
```bash
cd backend
source venv/bin/activate
pip install pytest
pytest tests/test_i18n.py -v
```

### 2. 前端 E2E 测试（使用 Playwright）

安装 Playwright：
```bash
cd frontend
npm install -D @playwright/test
npx playwright install
```

创建 `frontend/tests/i18n.spec.ts`：

```typescript
import { test, expect } from '@playwright/test';

test.describe('国际化功能测试', () => {
  
  test('首页语言切换', async ({ page }) => {
    await page.goto('http://localhost:5188');
    
    // 检查默认语言（中文）
    await expect(page.locator('text=功能')).toBeVisible();
    await expect(page.locator('text=教程')).toBeVisible();
    
    // 切换到英文
    await page.click('text=EN');
    
    // 检查英文显示
    await expect(page.locator('text=Features')).toBeVisible();
    await expect(page.locator('text=Tutorial')).toBeVisible();
  });

  test('登录页国际化', async ({ page }) => {
    await page.goto('http://localhost:5188/login');
    
    // 中文检查
    await expect(page.locator('text=欢迎回来')).toBeVisible();
    await expect(page.locator('text=邮箱地址')).toBeVisible();
    
    // 切换英文
    await page.click('text=EN');
    
    // 英文检查
    await expect(page.locator('text=Welcome Back')).toBeVisible();
    await expect(page.locator('text=Email Address')).toBeVisible();
  });

  test('语言持久化', async ({ page }) => {
    await page.goto('http://localhost:5188');
    
    // 切换到英文
    await page.click('text=EN');
    await expect(page.locator('text=Features')).toBeVisible();
    
    // 刷新页面
    await page.reload();
    
    // 检查仍为英文
    await expect(page.locator('text=Features')).toBeVisible();
  });
});
```

运行前端 E2E 测试：
```bash
cd frontend
npx playwright test tests/i18n.spec.ts
```

---

## 📊 测试报告模板

创建 `TEST_REPORT.md`：

```markdown
# DataPulse 测试报告

## 测试基本信息

- **测试日期**: 2026-02-27
- **测试环境**: macOS / Chrome 浏览器
- **测试版本**: v1.7.0

## 测试汇总

| 测试类别 | 通过 | 失败 | 跳过 | 通过率 |
|---------|------|------|------|--------|
| 国际化功能 | 0/10 | 0 | 0 | 0% |
| 用户认证 | 0/5 | 0 | 0 | 0% |
| 会话管理 | 0/6 | 0 | 0 | 0% |
| 聊天功能 | 0/6 | 0 | 0 | 0% |
| 数据库切换 | 0/3 | 0 | 0 | 0% |
| 可视化功能 | 0/5 | 0 | 0 | 0% |
| 移动端适配 | 0/4 | 0 | 0 | 0% |
| **总计** | **0/39** | 0 | 0 | **0%** |

## 详细结果

### 国际化功能测试

| ID | 测试项 | 结果 | 备注 |
|----|--------|------|------|
| I18N-01 | 语言切换 | ⬜ | |
| I18N-02 | 语言持久化 | ⬜ | |
| ... | ... | ... | ... |

## 已知问题

1. [ ] 问题描述
   - 严重程度：高/中/低
   - 复现步骤：...
   - 预期行为：...

## 测试结论

✅ 通过 / ⚠️ 有条件通过 / ❌ 不通过

**说明**: ...
```

---

## 🎯 快速测试命令汇总

```bash
# 1. 启动测试环境
chmod +x test-local.sh
./test-local.sh

# 2. 停止测试环境
chmod +x stop-test.sh
./stop-test.sh

# 3. 后端测试
cd backend
source venv/bin/activate
pytest tests/ -v

# 4. 前端测试
cd frontend
npx playwright test

# 5. 类型检查
cd frontend
npx tsc --noEmit

# 6. 代码检查
cd frontend
npm run lint
```

---

## 📝 测试注意事项

1. **环境变量**: 确保 `backend/.env` 中配置了有效的 `DEEPSEEK_API_KEY`
2. **数据库**: 首次运行需执行 `python init_db.py` 初始化数据库
3. **端口占用**: 确保 8003 和 5173 端口未被占用
4. **浏览器缓存**: 测试国际化时，清除浏览器缓存或使用无痕模式
5. **网络请求**: 测试 AI 功能需要网络连接

---

## 🐛 问题反馈模板

发现问题时，请使用以下模板记录：

```markdown
### 问题描述

[简要描述问题]

### 复现步骤

1. 打开 ...
2. 点击 ...
3. 输入 ...

### 预期结果

[应该发生什么]

### 实际结果

[实际发生了什么]

### 环境信息

- 操作系统：macOS / Windows / Linux
- 浏览器：Chrome xx / Safari xx
- 设备：桌面 / 手机（型号）

### 截图/日志

[如有，请附上]
```
