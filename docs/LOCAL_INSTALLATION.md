# 本地安装与测试运行方案 (Local Installation & Testing Guide)

本指南旨在帮助您在本地环境手动搭建、运行并验证 **智能数据分析助理 (DataPulse)**。

## 📋 环境准备

在开始之前，请确保您的系统已安装以下软件：
- **Python 3.12+** (后端核心)
- **Node.js 18+** & **npm** (前端 UI)
- **MySQL 8.0+** (必须，已废弃 SQLite)
- **Git** (版本管理)

---

## ⚡ 快速一键启动 (推荐)

如果数据库已就绪，可以使用项目提供的自动化脚本一键启动前后端：

```bash
# 在项目根目录下执行
bash scripts/test-local.sh
```
该脚本会自动检查环境、安装依赖、验证数据库并启动服务。停止服务请使用：
```bash
bash scripts/stop-test.sh
```

## 🐳 Docker 部署避坑指南 (小白必读)

如果您是第一次使用 Docker 部署本系统，请务必阅读以下注意事项，确保一键启动成功。

### 1. 启动前置检查
- **确保 Docker Desktop 已运行**：在执行命令前，请检查您的电脑状态栏（Mac 为小鲸鱼图标），确保 Docker 引擎已处于 `Running` 状态。
- **配置环境变量**：
  - 系统依赖 `.env` 文件。请在根目录执行 `cp .env.example .env`。
  - **必填**：打开 `.env` 文件，填入 `SECRET_KEY`（用于 JWT 签名）。
  - **AI API Key**：无需写入 `.env`，启动后在应用内「模型/Key」设置页面动态配置（支持 DeepSeek、OpenAI、Google Gemini、Anthropic Claude）。

### 2. 解决端口冲突 (重要)
Docker 会尝试占用您电脑的 `8000` (后端) 和 `80` (前端) 端口。
- **关闭本地进程**：在执行 Docker 命令前，请确保您已经关闭了本地手动运行的 `python main.py` 和 `npm run dev`。
- **报错提示**：如果看到 `port is already allocated`，说明您的电脑上已有其他服务占用了这些端口。

### 3. 一键启动命令
在项目根目录下，执行以下组合命令：
```bash
# 停止旧容器 -> 重新构建镜像 -> 启动服务
docker-compose down && docker-compose up --build
```

### 4. 自动数据灌入 (DB Seeding)
- **无需手动导入 SQL**：容器启动后，`db-seed` 服务会自动运行。它会检测数据库状态，并自动创建表结构、注入 **16 万条模拟业务数据**。
- **⏱️ 时间预估 (重要)**：
  - **初次构建**：由于需要下载数 GB 的 Docker 镜像并安装数百个前后端依赖（`pip install` & `npm install`），**初次启动可能需要 15 - 30 分钟**，具体取决于您的网络速度和电脑性能。
  - **后续启动**：一旦初次构建完成，以后启动仅需 **10 秒** 左右。
- **等待信号**：请耐心等待终端停止滚动，并最终显示 `✅ [Report] 数据库持久化成功`。

### 5. 访问地址
- **前端页面**：浏览器访问 `http://localhost`
- **API 文档**：浏览器访问 `http://localhost:8000/docs`

---

## 🛠️ 第一步：后端配置 (Backend)

1. **进入后端目录并创建虚拟环境**：
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # Windows 使用 venv\Scripts\activate
   ```

2. **安装依赖**：
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **配置环境变量**：
   复制 `.env.example` 为 `.env` 并填写关键信息：
   ```bash
   cp .env.example .env
   ```
   **必填项说明：**
   - `SECRET_KEY`: JWT 签名密钥，可用 `openssl rand -hex 32` 生成。
   - `MYSQL_HOST`: `localhost`
   - `MYSQL_USER`: 您的数据库用户名 (如 `root`)
   - `MYSQL_PASSWORD`: 您的数据库密码

   > **AI API Key 无需写入 `.env`**：启动后在应用内「模型/Key」设置页面配置，支持 DeepSeek、OpenAI、Google Gemini、Anthropic Claude 等多个供应商。

4. **初始化会话数据库与环境验证**：
   运行验证脚本，它会检查您的 MySQL 配置并确保会话数据库就绪。
   ```bash
   python3 scripts/check_db_env.py
   ```

---

## 🎨 第二步：前端配置 (Frontend)

1. **进入前端目录**：
   ```bash
   cd ../frontend
   ```

2. **安装依赖包**：
   ```bash
   npm install
   ```

3. **启动开发服务器**：
   ```bash
   npm run dev
   ```
   前端默认运行在 `http://localhost:5173`。

---

## 🚀 第三步：测试数据准备 (重要)

为了全面测试系统的智能分析与可视化能力，建议向 MySQL 注入以下模拟业务数据：

### 1. 经典商业分析库 (Classic Business)
包含 1000+ 条订单记录、产品分类与用户分布。
```bash
python3 scripts/init_classic_business.py
```

### 2. 全场景商业分析库 (Global Analysis)
包含 15+ 种可视化图表（雷达图、桑基图、甘特图、箱线图等）所需的进阶测试数据。
```bash
# 初始化基础库
python3 scripts/init_global_analysis.py
# 注入进阶图表数据 (桑基、甘特等)
python3 scripts/inject_test_data.py
# 注入 2024 年度销售趋势数据 (用于对比分析)
python3 scripts/inject_2024_data.py
```

---

## 🧪 第四步：核心功能测试方案

启动后端 (`cd backend && python main.py`) 后，请按以下路径验证功能：

### 1. 登录与注册
- 访问前端页面，进入登录页。
- 点击“注册”创建一个新账号，登录后确认右上角显示您的用户名。
- **验证点**：MySQL `users` 表中应出现新记录。

### 2. AI 思考过程展示
- 在输入框输入：”分析去年的销售趋势”。
- **验证点**：若当前使用支持思考链的模型（DeepSeek R1、Claude Opus/Sonnet、Gemini Pro 等），观察输入框上方是否实时滚动出现 AI 的推理逻辑（思维链）。

### 3. 多数据库切换
- 点击侧边栏或设置中的“数据库管理”。
- 选择 `classic_business` 数据库。
- **验证点**：后端日志应显示 `✅ 已切换到 classic_business`。

### 4. 自然语言转 SQL (Text-to-SQL)
- 提问：“哪个类别的产品卖得最好？”
- **验证点**：系统应生成 SQL，执行后展示数据表格，并自动推荐合适的 ECharts 图表。

### 5. 跨库 Schema 验证 (SQLAlchemy)
- 故意提问一个当前数据库不存在的表。
- **验证点**：Agent 应基于 `SchemaService` 提示用户该表不存在，或建议正确的表名。

---

## 🐳 Docker 快速运行方案

如果您不想手动配置环境，可以使用 Docker：
```bash
# 1. 复制并编辑环境变量（填写 SECRET_KEY 等服务配置，无需填 AI API Key）
cp .env.example .env

# 2. 启动容器
docker-compose up -d --build

# 3. 访问
# 前端：http://localhost
# 后端：http://localhost:8000

# 4. 在应用内「模型/Key」页面配置 AI 供应商 API Key
```
