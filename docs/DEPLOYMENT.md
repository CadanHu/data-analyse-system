# 部署文档

## Docker 部署

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少一个支持的 AI 供应商 API Key（见下方[支持的 AI 模型](#支持的-ai-模型)）

### 支持的 AI 模型

本系统支持多个 AI 供应商，**API Key 在应用内通过"模型/Key"设置页面动态配置**，无需写死到环境变量中。

| 供应商 | 模型 | 备注 |
|--------|------|------|
| **DeepSeek** | deepseek-chat (V3 标准) | 标准对话 |
| | deepseek-reasoner (R1) | 带思考链 |
| **OpenAI** | gpt-5.3 | 旗舰版 |
| | gpt-5.2 | 标准版 |
| **Google Gemini** | gemini-3.1-pro-preview | 带思考链 |
| | gemini-3.1-flash-lite-preview | 超轻量 |
| | gemini-3.1-flash-image-preview | 图像生成 |
| | gemini-3-flash-preview | 标准快速版 |
| **Anthropic Claude** | claude-opus-4-6 | 带思考链，旗舰 |
| | claude-sonnet-4-6 | 带思考链 |
| | claude-haiku-4-5-20251001 | 轻量快速 |
| | claude-opus-4-5 | 带思考链 |
| | claude-sonnet-4-5 | 带思考链 |
| | claude-3-7-sonnet-20250219 | 带思考链 |

> **提示**：DeepSeek 和 OpenAI 兼容接口支持自定义 Base URL，可对接任意 OpenAI 兼容的第三方代理服务。

### 快速开始

1. **克隆项目**
```bash
git clone https://github.com/CadanHu/data-analyse-system.git
cd data-analyse-system
```

2. **配置环境变量**
```bash
# 复制根目录的环境变量示例文件
cp .env.example .env
# 编辑 .env，填入必要的服务配置（API Key 在应用内配置，无需填入此处）
```

3. **启动服务**
```bash
# 首次启动会构建镜像，可能需要几分钟
docker-compose up -d

# 如果需要重新构建镜像
docker-compose up -d --build
```

4. **访问应用**
- 前端：http://localhost
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

### 常用命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 清理所有数据（谨慎使用）
docker-compose down -v
```

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| SECRET_KEY | JWT 签名密钥 (必须修改) | - |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token 有效期 (分钟) | 10080 (7天) |
| LOG_LEVEL | 日志级别 | INFO |
| RATE_LIMIT_REQUESTS | 频率限制请求数 | 60 |
| RATE_LIMIT_WINDOW | 频率限制时间窗口（秒） | 60 |
| MAX_SQL_EXECUTION_TIME | SQL 最大执行时间（秒） | 30 |

> **⚠️ 安全提醒**: 在生产环境中，请务必生成一个强随机的 `SECRET_KEY`。可以使用命令 `openssl rand -hex 32` 生成。

### 数据持久化

数据库数据通过 **Docker Named Volume** 持久化，不随容器销毁而丢失：

| Volume 名称 | 对应数据库 | 说明 |
|------------|-----------|------|
| `mysql_data` | MySQL 8.0 | 业务数据库（test / classic_business / global_analysis） |
| `pg_data` | PostgreSQL 15 | 知识库（knowledge_base） |

日志和上传文件通过 bind mount 持久化到宿主机：
- `./backend/logs` - 应用日志
- `./backend/uploads` - 用户上传文件

> **首次启动说明**：`db-seed` 服务会在 MySQL 和 PostgreSQL 健康检查通过后自动运行，
> 生成约 16 万条业务仿真数据（含订单、客户、行为日志、地理数据、股票K线等），
> 预计耗时 3～8 分钟，期间后端服务可正常使用但数据库为空。

### 重建数据库（清空所有数据重新初始化）

```bash
# 停止所有服务并删除 Volume（不可恢复）
docker-compose down -v

# 重新构建并启动（会重新运行 seed 脚本）
docker-compose up --build
```

> **注意**：`down -v` 会永久删除数据库中所有数据，仅在需要全量重置时使用。
> 如果 Docker Volume 从未创建过（首次部署），直接 `docker-compose up --build` 即可，无需 `down -v`。

### 健康检查

- 后端健康检查：`http://localhost:8000/health`
- 前端健康检查：`http://localhost/health`

### 故障排查

1. **查看服务状态**
```bash
docker-compose ps
```

2. **查看日志**
```bash
# 查看所有服务日志
docker-compose logs

# 查看后端日志
docker-compose logs backend

# 查看前端日志
docker-compose logs frontend
```

3. **重启服务**
```bash
docker-compose restart backend
```

4. **重建镜像**
```bash
docker-compose up -d --build
```

## 手动部署

### 后端部署

1. **安装依赖**
```bash
cd backend
pip install -r requirements.txt
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件
```

3. **初始化数据库**
```bash
python init_db.py
```

4. **启动服务**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端部署

1. **安装依赖**
```bash
cd frontend
npm install
```

2. **构建生产版本**
```bash
npm run build
```

3. **部署到 Nginx**
```bash
# 将 dist 目录内容复制到 Nginx 静态文件目录
cp -r dist/* /var/www/html/
```

4. **配置 Nginx 反向代理**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/html;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 性能优化建议

1. **启用 Gzip 压缩**
2. **配置 CDN 加速静态资源**
3. **启用数据库索引**
4. **配置 Redis 缓存**
5. **使用负载均衡**

## iOS 移动端部署 (Capacitor)

### 前置要求
- macOS 操作系统
- Xcode 15.0+
- CocoaPods (`sudo gem install cocoapods`)
- Node.js 18+

### 部署步骤

1. **环境初始化**
```bash
cd frontend
# 安装移动端依赖
npm install @capacitor/cli @capacitor/core @capacitor/ios
```

2. **构建与同步**
```bash
# 构建前端生产包
npm run build
# 同步代码到 iOS 原生工程
npx cap sync
```

3. **运行模拟器**
```bash
# 启动 iOS 模拟器并部署 App
npx cap run ios
```

4. **Xcode 手动运行 (可选)**
```bash
# 打开 Xcode 工程
npx cap open ios
# 在 Xcode 中点击 Run 按钮
```

### 调试与优化

- **Safari 调试**：在 Mac Safari 中通过 `开发 -> 模拟器 -> index.html` 开启 Web 检查器。
- **刘海屏适配**：系统已自动通过 `viewport-fit=cover` 适配安全区域。
- **网络连接**：若模拟器连不上后端，请确保后端启动时绑定了 `0.0.0.0`，且前端代码指向了正确的宿主机地址。
