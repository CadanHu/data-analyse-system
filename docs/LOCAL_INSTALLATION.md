# 本地安装与测试运行方案 (Local Installation & Testing Guide)

本指南旨在帮助您在本地环境手动搭建、运行并验证 **智能数据分析助理 (DataPulse)**。

## 📋 环境准备

在开始之前，请确保您的系统已安装以下软件：
- **Python 3.12+** (后端核心)
- **Node.js 18+** & **npm** (前端 UI)
- **MySQL 8.0+** (必须，已废弃 SQLite)
- **Git** (版本管理)

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
   - `DEEPSEEK_API_KEY`: 您的 DeepSeek API Key。
   - `MYSQL_HOST`: `localhost`
   - `MYSQL_USER`: 您的数据库用户名 (如 `root`)
   - `MYSQL_PASSWORD`: 您的数据库密码

4. **初始化会话数据库**：
   运行验证脚本，它会自动在 MySQL 中创建 `data_pulse_sessions` 库和表。
   ```bash
   python scripts/check_db_env.py
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

## 🚀 第三步：数据准备 (可选)

为了测试商业分析功能，建议向 MySQL 注入模拟数据：
```bash
cd backend
python init_classic_business.py
```
这会创建一个名为 `classic_business` 的数据库，并填充 1000 条订单数据。

---

## 🧪 第四步：核心功能测试方案

启动后端 (`cd backend && python main.py`) 后，请按以下路径验证功能：

### 1. 登录与注册
- 访问前端页面，进入登录页。
- 点击“注册”创建一个新账号，登录后确认右上角显示您的用户名。
- **验证点**：MySQL `users` 表中应出现新记录。

### 2. Mieru (见得) 思考过程展示
- 在输入框输入：“分析去年的销售趋势”。
- **验证点**：观察输入框上方是否实时滚动出现 AI 的推理逻辑（思维链），这是 R1 模型的核心特性。

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
# 1. 设置环境变量
export DEEPSEEK_API_KEY=your_key_here

# 2. 启动容器
docker-compose up -d --build

# 3. 访问
# 前端：http://localhost
# 后端：http://localhost:8000
```
