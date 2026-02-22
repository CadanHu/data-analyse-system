# 智能数据分析助理

基于 AI 的智能数据分析系统，通过自然语言对话实现数据查询、分析和可视化。

## 🎯 功能特性

### 核心功能
- ✅ **自然语言查询**：用中文提问，自动生成 SQL 查询
- ✅ **实时流式输出**：通过 Streamable HTTP 实时显示 AI 思考过程
- ✅ **智能 SQL 修正**：SQL 执行失败时自动重试修正
- ✅ **数据可视化**：自动生成柱状图、折线图、饼图和表格
- ✅ **会话管理**：支持多会话，历史记录自动保存
- ✅ **响应式设计**：完美适配移动端和桌面端

### AI 能力
- 🤖 **DeepSeek 推理模型**：集成 DeepSeek AI，支持普通模式和思考模式
- 💡 **思考模式**：展示 AI 的分析思路，帮助理解数据查询逻辑
- 🧠 **智能总结**：自动生成有意义的会话标题
- 💬 **多轮对话**：支持基于上下文的追问和深入分析

### 数据管理
- 🗄️ **多数据源支持**：支持 MySQL、PostgreSQL、SQLite 等多种数据库
- 📊 **预置数据集**：集成 Chinook 音乐数据库和 Northwind 商业数据库
- 🔄 **灵活切换**：每个会话独立选择数据库，自动记住设置

### 增强功能
- 📁 **文件上传**：支持上传图片和文档，AI 自动分析内容
- 📝 **SQL 代码管理**：查看、复制、折叠 SQL 查询语句
- 🎨 **图表类型切换**：支持多种图表类型，可手动切换

### 用户体验
- 📖 **教程页面**：详细的 6 步教程，帮助快速上手
- 📋 **功能特性页面**：展示 12 个核心功能的详细介绍
- 📅 **更新日志页面**：追踪系统更新和改进历史
- 🔒 **数据安全**：多层安全机制，保护数据隐私

## 🚀 技术栈

### 后端
- **框架**: FastAPI
- **AI**: LangChain + DeepSeek AI
- **数据库**: SQLite3 (aiosqlite)
- **API 文档**: Swagger UI
- **流式传输**: Streamable HTTP

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **图表**: ECharts 5
- **路由**: React Router 6

## 📦 项目结构

```
data-analyse-system/
├── backend/                    # 后端项目
│   ├── main.py                # FastAPI 入口
│   ├── config.py              # 全局配置
│   ├── database/              # 数据库模块
│   │   ├── session_db.py      # 会话数据库
│   │   └── business_db.py     # 业务数据库
│   ├── routers/               # API 路由
│   │   ├── chat_router.py     # 聊天接口
│   │   ├── session_router.py  # 会话接口
│   │   └── message_router.py  # 消息接口
│   ├── agents/                # AI Agent
│   │   └── sql_agent.py       # SQL Agent 核心
│   ├── services/              # 服务层
│   │   ├── sql_executor.py    # SQL 执行服务
│   │   ├── stream_service.py  # Streamable HTTP 流式服务
│   │   └── schema_service.py  # 数据库元信息服务
│   ├── models/                # Pydantic 模型
│   ├── utils/                 # 工具函数
│   ├── requirements.txt       # Python 依赖
│   └── .env.example           # 环境变量示例
│
├── frontend/                   # 前端项目
│   ├── src/
│   │   ├── main.tsx           # 入口文件
│   │   ├── App.tsx            # 根组件
│   │   ├── components/        # 通用组件
│   │   │   ├── Welcome.tsx    # 欢迎页
│   │   │   ├── About.tsx      # 关于页
│   │   │   ├── Tutorial.tsx   # 教程页
│   │   │   ├── Features.tsx   # 功能特性页
│   │   │   ├── Changelog.tsx  # 更新日志页
│   │   │   ├── ChatArea.tsx   # 聊天区域
│   │   │   ├── MessageItem.tsx # 消息项
│   │   │   ├── RightPanel.tsx  # 数据可视化面板
│   │   │   └── SessionList.tsx # 会话列表
│   │   ├── stores/            # Zustand stores
│   │   ├── hooks/             # 自定义 Hooks
│   │   └── api/               # API 调用
│   └── package.json
│
├── setup.sh                    # 一键启动脚本（macOS/Linux）
├── docker-compose.yml          # Docker Compose 配置
└── README.md                   # 本文档
```

## 🎮 快速开始

### 方式一：一键启动（推荐）

如果你使用 macOS 或 Linux，可以直接运行一键启动脚本：

```bash
# 1. 克隆或进入项目目录
cd data-analyse-system

# 2. 运行一键启动脚本
chmod +x setup.sh
./setup.sh
```

脚本会自动：
- 检查并安装依赖
- 配置环境变量
- 初始化数据库
- 启动后端和前端服务

### 方式二：手动启动

#### 环境要求

- **Python**: 3.8 - 3.11
- **Node.js**: 18+
- **npm**: 9+ 或 **pnpm**: 8+

#### 1. 获取项目

```bash
# 如果还没有克隆项目
git clone <你的仓库地址>
cd data-analyse-system
```

#### 2. 配置后端

##### 步骤 1：安装 Python 依赖

```bash
cd backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# 或者 Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

##### 步骤 2：配置 API Key

```bash
# 复制环境变量示例文件
cp .env.example .env
```

编辑 `.env` 文件，填入你的 DeepSeek API Key：

```env
# DeepSeek API 配置
DEEPSEEK_API_KEY=你的-api-key-在这里
```

**如何获取 API Key？**
1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 在 API Keys 页面创建新的 API Key
4. 复制并填入上面的配置文件

##### 步骤 3：初始化数据库

```bash
# 在 backend 目录下
python init_db.py
```

这会创建示例数据库（包含产品、订单、客户等表）。

##### 步骤 4：启动后端服务

```bash
# 方式 1：使用 uvicorn（推荐，支持热重载）
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 方式 2：直接运行
python main.py
```

后端启动成功后，访问：
- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health

#### 3. 配置前端

打开新的终端窗口：

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端启动成功后，访问：http://localhost:5173

## 🐳 Docker 部署

如果你有 Docker，可以使用 Docker Compose 一键部署：

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问：
- 前端：http://localhost:3000
- 后端：http://localhost:8000

## 📖 使用指南

### 1. 开始使用

1. 打开 http://localhost:5173
2. 点击"开始使用"按钮
3. 在输入框中用中文提问

### 2. 示例问题

你可以试试这些问题：

```
显示所有产品的销售情况
今年哪个产品卖得最好？
客户来自哪些地区？
每个月的销售额趋势
```

### 3. 使用思考模式

1. 点击输入框旁边的灯泡图标
2. 开启思考模式后，AI 会展示详细的分析思路
3. 帮助理解 SQL 查询的生成过程

### 4. 上传文件

1. 点击输入框旁边的加号按钮
2. 选择图片或文档文件
3. AI 会自动分析文件内容

### 5. 切换数据库

1. 在会话列表上方选择数据库
2. 支持：业务数据库、Chinook 音乐数据库、Northwind 商业数据库
3. 每个会话会记住选择的数据库

### 6. 数据可视化

- 当 AI 回复后，点击消息中的"查看可视化图表"按钮
- 右侧会显示数据可视化面板
- 可以切换柱状图、折线图、饼图或表格视图
- 点击面板右上角的 × 可以关闭面板

### 7. 会话管理

- 左侧面板显示所有会话历史
- 点击会话可以切换
- 点击 + 可以创建新会话
- 点击会话右侧的删除图标可以删除会话

### 8. 查看教程

1. 点击欢迎页面底部的"教程"链接
2. 学习 6 个详细步骤
3. 快速掌握系统核心功能

## 🔌 API 接口

### 会话管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions` | 获取会话列表 |
| GET | `/api/sessions/{id}` | 获取会话详情 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| PATCH | `/api/sessions/{id}` | 更新会话标题 |
| GET | `/api/sessions/{id}/messages` | 获取消息列表 |

### 核心问答

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/chat/stream` | 发送消息 (Streamable HTTP 流式) |

### 数据库元信息

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/schema` | 获取表结构 |

## ❓ 常见问题

### Q: 后端启动失败？

**A:** 检查以下几点：
1. Python 版本是否为 3.8-3.11
2. 依赖是否安装完整：`pip install -r requirements.txt`
3. 端口 8000 是否被占用

### Q: 前端无法连接后端？

**A:** 
1. 确认后端已启动：访问 http://localhost:8000/docs
2. 检查前端 `vite.config.ts` 中的代理配置
3. 查看浏览器控制台的错误信息

### Q: AI 不回复或报错？

**A:**
1. 检查 `.env` 文件中的 API Key 是否正确
2. 确认 API Key 有余额
3. 查看后端日志：`backend/logs/app.log`

### Q: 数据可视化不显示？

**A:**
1. 确认 AI 回复中有图表数据
2. 点击消息中的"查看可视化图表"按钮
3. 尝试切换不同的图表类型

### Q: 思考模式如何使用？

**A:**
1. 点击输入框旁边的灯泡图标开启思考模式
2. 开启后 AI 会展示详细的分析思路
3. 默认关闭，需要手动开启

### Q: 如何切换数据库？

**A:**
1. 在会话列表上方选择数据库
2. 每个会话会记住选择的数据库
3. 切换会话时会自动恢复对应的数据库

## 🛠️ 开发调试

### 查看后端日志

```bash
cd backend
tail -f logs/app.log
```

### 重置数据库

```bash
cd backend
rm -f data/*.db
python init_db.py
```

### 运行测试

```bash
cd backend
pytest
```

## 📝 版本历史

### v1.2.0 (2024-02-20)
- 新增 DeepSeek 推理模型支持
- 添加思考模式切换开关
- 新增文件上传功能
- 集成 Chinook 和 Northwind 数据库
- 添加数据库切换功能
- 新增 SQL 语句显示/折叠按钮
- 添加教程、功能特性、更新日志页面
- 优化 AI 思考过程展示
- 修复多个 bug

### v1.1.0 (2024-02-10)
- 将 SSE 更换为 Streamable HTTP
- 添加多个复杂系统测试问题
- 优化 AI 提示词
- 改进错误处理机制

### v1.0.0 (2024-01-20)
- DataPulse 首次发布
- 支持自然语言查询数据库
- 实时数据可视化功能
- 会话管理功能

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

Apache License 2.0

详情请查看 [LICENSE](./LICENSE) 文件。

## 📞 联系方式

如有问题，请提交 Issue 或联系开发团队。

---

**最后更新**: 2026-02-22
**当前版本**: v1.2.0
