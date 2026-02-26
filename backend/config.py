"""
全局配置文件 (SQLAlchemy & MySQL/PostgreSQL 驱动)
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

# 项目根目录
BASE_DIR = Path(__file__).parent.parent

# 安全配置
SECRET_KEY = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 默认 7 天

# 邮件配置
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")      # 您的邮箱地址
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")  # 您的邮箱授权码/应用密码
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)

# API 配置
API_KEY = os.getenv("DEEPSEEK_API_KEY", "")  # DeepSeek API Key
API_BASE_URL = "https://api.deepseek.com"  # DeepSeek API 地址
CHAT_MODEL = "deepseek-chat"      # 标准对话模型 (V3)
REASONER_MODEL = "deepseek-reasoner"  # 深度思考模型 (R1)
MODEL_NAME = CHAT_MODEL # 默认模型

# LangChain 配置
LANGCHAIN_TRACING_V2 = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY", "")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "data-analyse-system")

# 会话数据库配置 (统一使用 SQLAlchemy 适配)
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
MYSQL_SESSION_DATABASE = os.getenv("MYSQL_SESSION_DATABASE", "data_pulse_sessions")

# 多数据库配置 (移除 SQLite)
DATABASES = {
    "mysql_example": {
        "type": "mysql",
        "host": MYSQL_HOST,
        "port": MYSQL_PORT,
        "database": os.getenv("MYSQL_DATABASE", "test"),
        "user": MYSQL_USER,
        "password": MYSQL_PASSWORD,
        "name": "MySQL 示例数据库"
    },
    "classic_business": {
        "type": "mysql",
        "host": MYSQL_HOST,
        "port": MYSQL_PORT,
        "database": "classic_business",
        "user": MYSQL_USER,
        "password": MYSQL_PASSWORD,
        "name": "经典商业分析库 (MySQL)"
    },
    "global_analysis": {
        "type": "mysql",
        "host": MYSQL_HOST,
        "port": MYSQL_PORT,
        "database": "global_analysis",
        "user": MYSQL_USER,
        "password": MYSQL_PASSWORD,
        "name": "全场景商业分析库 (MySQL)"
    },
    "postgres_example": {
        "type": "postgresql",
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", 5432)),
        "database": os.getenv("POSTGRES_DB", "postgres"),
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASSWORD", ""),
        "name": "PostgreSQL 示例数据库"
    }
}

# 默认业务数据库 ID
DEFAULT_BUSINESS_DB = "classic_business"

# 内存配置
MEMORY_WINDOW_SIZE = 10  # 保留最近 N 轮对话

# CORS 配置
ALLOWED_ORIGINS = ["*"]

# 请求限制
MAX_SQL_EXECUTION_TIME = 30  # SQL 最长执行时间（秒）
MAX_RETRY_COUNT = 2  # SQL 执行失败最大重试次数

# 频率限制
RATE_LIMIT_REQUESTS = 10000  # 增大限制以禁用频率拦截
RATE_LIMIT_WINDOW = 60

# 日志配置
LOG_LEVEL = "INFO"  # 日志级别: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FILE = Path(__file__).parent.parent / "logs" / "app.log"  # 日志文件路径
LOG_JSON_FORMAT = False  # 是否使用 JSON 格式日志
