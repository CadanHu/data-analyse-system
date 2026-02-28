"""
FastAPI 应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import ALLOWED_ORIGINS, LOG_LEVEL, LOG_FILE, LOG_JSON_FORMAT
from database.session_db import session_db
from database.user_db import user_db
from database.business_db import init_business_db
from middleware import setup_exception_handlers, rate_limit_middleware
from utils.logger import setup_logging

from contextlib import asynccontextmanager

# 初始化日志系统
setup_logging(level=LOG_LEVEL, log_file=str(LOG_FILE), json_format=LOG_JSON_FORMAT)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    await session_db.init_db()
    await user_db.init_db()
    print("✅ 数据库初始化完成")
    yield

# 创建 FastAPI 应用
app = FastAPI(
    title="智能数据分析助理 API",
    description="基于 AI 的智能数据分析系统，通过自然语言对话实现数据查询、分析和可视化",
    version="0.1.0",
    lifespan=lifespan
)

# --- 关键修复: 注册中间件 ---
# 1. CORS 中间件 (必须在最外层以响应 OPTIONS 预检请求)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 移动端请求可能来自不同源，允许所有
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
from routers import session_router, message_router, chat_router, upload_router, database_router, auth_router
from fastapi.staticfiles import StaticFiles

app.include_router(session_router.router, prefix="/api", tags=["会话管理"])
app.include_router(message_router.router, prefix="/api", tags=["消息管理"])
app.include_router(chat_router.router, prefix="/api", tags=["聊天接口"])
app.include_router(upload_router.router, prefix="/api", tags=["文件上传"])
app.include_router(auth_router.router, prefix="/api")
app.include_router(database_router.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
