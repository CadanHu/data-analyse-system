"""
FastAPI 应用入口
"""
import os
from pathlib import Path
# ⚠️ 必须在所有导入之前设置环境变量，确保 AI 库初始化时读取
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import ALLOWED_ORIGINS, LOG_LEVEL, LOG_FILE, LOG_JSON_FORMAT
from database.session_db import session_db
from database.user_db import user_db
from database.knowledge_db import knowledge_db
from database.business_db import init_business_db

from middleware import setup_exception_handlers, rate_limit_middleware
from utils.logger import setup_logging

from contextlib import asynccontextmanager

# 初始化日志系统 (显式指定绝对路径，确保 service 能读到)
CURRENT_DIR = Path(__file__).resolve().parent
LOG_DIR = CURRENT_DIR / "logs"
if not LOG_DIR.exists():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE_PATH = str(LOG_DIR / "app.log")

setup_logging(level=LOG_LEVEL, log_file=LOG_FILE_PATH, json_format=LOG_JSON_FORMAT)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    print(f"📡 [Startup] 日志文件路径: {LOG_FILE_PATH}")
    # 启动时初始化数据库
    await session_db.init_db()
    await user_db.init_db()
    await knowledge_db.init_db() 
    print("✅ 数据库初始化完成")
    try:
        yield
    finally:
        # 🚀 关键修复: 在关闭时静默取消所有协程任务，防止 SSE 导致的 CancelledError 刷屏
        import asyncio
        print("📥 正在退出系统...")
        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for t in tasks: t.cancel()
        print("👋 系统安全关闭")

# 创建 FastAPI 应用
app = FastAPI(
    title="智能数据分析助理 API",
    description="基于 AI 的智能数据分析 system",
    version="1.9.0",
    lifespan=lifespan
)

# --- 关键修复: 注册中间件 ---
# 1. CORS 中间件 (必须在最外层以响应 OPTIONS 预检请求)
# ⚠️ 当 allow_credentials=True 时，allow_origins 不能为 ["*"]
# 我们显式允许常见的移动端/开发环境源
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8100",
        "capacitor://localhost",
        "http://localhost",
        "http://127.0.0.1",
        "http://172.20.10.2", # 匹配前端 hardcode 的 IP
    ],
    allow_origin_regex=r"http://192\.168\..*", # 允许常见的局域网网段
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)


# 2. 速率限制中间件
from middleware.rate_limit import rate_limit_middleware
@app.middleware("http")
async def apply_rate_limit(request, call_next):
    return await rate_limit_middleware(request, call_next)

# 3. 错误处理器
from middleware.error_handler import setup_exception_handlers
setup_exception_handlers(app)


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "欢迎使用智能数据分析助理 API",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "database": "connected"
    }


# 注册路由
from routers import session_router, message_router, chat_router, upload_router, database_router, auth_router, observability_router
from routers.api_key_router import router as api_key_router
from routers.rag_router import router as rag_router
from fastapi.staticfiles import StaticFiles

app.include_router(session_router.router, prefix="/api", tags=["会话管理"])
app.include_router(message_router.router, prefix="/api", tags=["消息管理"])
app.include_router(chat_router.router, prefix="/api", tags=["聊天接口"])
app.include_router(upload_router.router, prefix="/api", tags=["文件上传"])
app.include_router(auth_router.router, prefix="/api")
app.include_router(database_router.router)
app.include_router(observability_router.router)
app.include_router(api_key_router, prefix="/api", tags=["API Key 管理"])
app.include_router(rag_router, prefix="/api", tags=["RAG 知识库管理"])

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


if __name__ == "__main__":
    import uvicorn
    # 开发环境下使用单 worker，确保 Ctrl+C 能够快速停止进程
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1
    )
