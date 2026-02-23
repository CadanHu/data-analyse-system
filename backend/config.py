"""
全局配置文件
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

# API 配置
API_KEY = os.getenv("DEEPSEEK_API_KEY", "")  # DeepSeek API Key
API_BASE_URL = "https://api.deepseek.com/v1"  # DeepSeek API 地址
MODEL_NAME = "deepseek-chat"  # 使用 DeepSeek 模型

# LangChain 配置
LANGCHAIN_TRACING_V2 = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY", "")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "data-analyse-system")

# 数据库配置
DATABASE_DIR = BASE_DIR / "data"
DATABASE_DIR.mkdir(exist_ok=True)
SESSION_DB_PATH = DATABASE_DIR / "sessions.db"  # 会话数据库

# 多数据库配置
DATABASES = {
    "business": {
        "type": "sqlite",
        "path": DATABASE_DIR / "business.db",
        "name": "业务数据库"
    },
    "chinook": {
        "type": "sqlite",
        "path": DATABASE_DIR / "Chinook_Sqlite.sqlite",
        "name": "Chinook 音乐数据库"
    },
    "northwind": {
        "type": "sqlite",
        "path": DATABASE_DIR / "northwind.db",
        "name": "Northwind 商业数据库"
    },
    "mysql_example": {
        "type": "mysql",
        "host": os.getenv("MYSQL_HOST", "localhost"),
        "port": int(os.getenv("MYSQL_PORT", 3306)),
        "database": os.getenv("MYSQL_DATABASE", "test"),
        "user": os.getenv("MYSQL_USER", "root"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "name": "MySQL 示例数据库"
    }
}

BUSINESS_DB_PATH = DATABASE_DIR / "business.db"  # 默认业务数据库

# 内存配置
MEMORY_WINDOW_SIZE = 10  # 保留最近 N 轮对话

# CORS 配置
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:3000",
]

# 请求限制
MAX_SQL_EXECUTION_TIME = 30  # SQL 最长执行时间（秒）
MAX_RETRY_COUNT = 2  # SQL 执行失败最大重试次数

# 频率限制
RATE_LIMIT_REQUESTS = 60  # 时间窗口内最大请求数
RATE_LIMIT_WINDOW = 60  # 时间窗口（秒）

# 日志配置
LOG_LEVEL = "INFO"  # 日志级别: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FILE = BASE_DIR / "logs" / "app.log"  # 日志文件路径
LOG_JSON_FORMAT = False  # 是否使用 JSON 格式日志
