"""
FastAPI 应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import ALLOWED_ORIGINS, LOG_LEVEL, LOG_FILE, LOG_JSON_FORMAT
from database.session_db import session_db
from database.business_db import init_business_db
from middleware import setup_exception_handlers, rate_limit_middleware
from utils.logger import setup_logging

# 初始化日志系统
setup_logging(level=LOG_LEVEL, log_file=str(LOG_FILE), json_format=LOG_JSON_FORMAT)

# 创建 FastAPI 应用
app = FastAPI(
    title="智能数据分析助理 API",
    description="基于 AI 的智能数据分析系统，通过自然语言对话实现数据查询、分析和可视化",
    version="0.1.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加频率限制中间件
app.middleware("http")(rate_limit_middleware)

# 设置全局异常处理器
setup_exception_handlers(app)


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    await session_db.init_db()
    await init_business_db()
    print("✅ 数据库初始化完成")


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "欢迎使用智能数据分析助理 API",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "database": "connected"
    }


# 注册路由
from routers import session_router, message_router, chat_router, upload_router, database_router
from fastapi.staticfiles import StaticFiles

app.include_router(session_router.router, prefix="/api", tags=["会话管理"])
app.include_router(message_router.router, prefix="/api", tags=["消息管理"])
app.include_router(chat_router.router, prefix="/api", tags=["聊天接口"])
app.include_router(upload_router.router, prefix="/api", tags=["文件上传"])
app.include_router(database_router.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
