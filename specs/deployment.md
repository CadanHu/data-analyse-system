# 规格：部署规范 (Deployment)

> 来源：`data-sys-docs/DEPLOYMENT.md` + `docker-compose.yml` 整合
> 版本：v2.0

---

## 1. 环境要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Docker | 20.10+ | 容器运行时 |
| Docker Compose | 2.0+ | 多服务编排 |
| 可用内存 | 4GB+ | MySQL + PostgreSQL + 后端同时运行 |
| AI API Key | 任意一个 | DeepSeek / OpenAI / Gemini / Claude |

> API Key **在应用内**的"模型/Key"设置页配置，无需写入 `.env`。

---

## 2. 服务拓扑

```
用户浏览器 / iOS App
       │
       ▼
   Nginx (前端静态 + 反向代理)
       │
       ▼
  FastAPI 后端 :8000
    ├── MySQL 8.0     (business data: sessions, users, business tables)
    ├── PostgreSQL 15 (knowledge base: vectors, knowledge graph)
    └── db-seed       (一次性初始化，完成后退出)
```

---

## 3. 快速启动（Docker）

```bash
# 1. 克隆
git clone https://github.com/CadanHu/data-analyse-system.git
cd data-analyse-system

# 2. 配置环境变量（必须修改 SECRET_KEY）
cp .env.example .env
# 编辑 .env，至少设置：SECRET_KEY=$(openssl rand -hex 32)

# 3. 启动（首次构建约 5 分钟）
docker-compose up -d --build

# 4. 等待数据库种子完成（约 3～8 分钟）
docker-compose logs -f db-seed
```

访问地址：
- 前端：`http://localhost`
- 后端 API：`http://localhost:8000`
- API 文档（Swagger）：`http://localhost:8000/docs`

---

## 4. 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `SECRET_KEY` | **是** | 硬编码默认值 | JWT 签名密钥，**生产必须覆盖** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 否 | 525600（365天） | Token 有效期 |
| `LOG_LEVEL` | 否 | `INFO` | 日志级别 |
| `RATE_LIMIT_REQUESTS` | 否 | 60 | 频率限制请求数 |
| `RATE_LIMIT_WINDOW` | 否 | 60 | 频率限制时间窗口（秒） |
| `MAX_SQL_EXECUTION_TIME` | 否 | 30 | SQL 最大执行时间（秒） |

**生成强密钥**：
```bash
openssl rand -hex 32
```

---

## 5. 数据持久化

| Docker Volume | 数据库 | 内容 |
|--------------|--------|------|
| `mysql_data` | MySQL 8.0 | 业务库（classic_business / global_analysis）、会话、用户 |
| `pg_data` | PostgreSQL 15 | 知识库、向量索引、知识图谱 |

Bind Mount（宿主机目录）：
- `./backend/logs` → 应用日志
- `./backend/uploads` → 用户上传文件

---

## 6. 常用运维命令

```bash
# 查看服务状态
docker-compose ps

# 查看实时日志（所有服务）
docker-compose logs -f

# 查看单个服务日志
docker-compose logs -f backend

# 重启某个服务
docker-compose restart backend

# 停止（保留数据）
docker-compose down

# 停止并清除所有数据（不可恢复）
docker-compose down -v
```

---

## 7. 重新初始化数据库

```bash
# 删除所有数据 Volume 并重建（仅在需要全量重置时使用）
docker-compose down -v
docker-compose up --build
```

db-seed 会在 MySQL 和 PostgreSQL 健康检查通过后自动运行，生成约 16 万条业务仿真数据，预计耗时 3～8 分钟。

---

## 8. 健康检查

| 端点 | 说明 |
|------|------|
| `GET /health` (后端) | 返回 `{"status": "ok"}` |
| `GET /health` (前端 Nginx) | Nginx 存活检查 |

---

## 9. 手动部署（无 Docker）

### 后端
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # 填写 DB 连接字符串和 SECRET_KEY
python init_db.py
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端
```bash
cd frontend
npm install
npm run build
# 将 dist/ 部署到 Nginx 静态目录
```

### Nginx 反向代理配置
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
        # SSE 需要禁用缓冲
        proxy_buffering off;
        proxy_cache off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> **SSE 重要**：`proxy_buffering off` 必须配置，否则流式输出会被 Nginx 缓冲导致前端收不到实时事件。

---

## 10. iOS 移动端部署（Capacitor）

**前置**：macOS + Xcode 15+ + CocoaPods

```bash
cd frontend
npm install
npm run build
npx cap sync
npx cap run ios       # 模拟器
# 或 npx cap open ios  # 在 Xcode 中手动运行
```

调试：Mac Safari → 开发 → 模拟器 → index.html（Web Inspector）

---

## 11. 回滚策略

| 场景 | 操作 |
|------|------|
| 代码回滚（无 schema 变更） | `git checkout <tag>` + `docker-compose up -d --build` |
| 代码回滚（有 schema 变更） | 先手动回滚数据库 schema，再重建镜像 |
| 数据库损坏 | 从 Volume 备份恢复（需提前配置备份策略） |

> 当前未内置自动备份，生产环境建议配置 `mysqldump` 定时任务或云数据库快照。
