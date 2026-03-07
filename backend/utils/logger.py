"""
日志配置模块
"""
import logging
import sys
import os
from pathlib import Path
from datetime import datetime
import json
from config import BASE_DIR

class JSONFormatter(logging.Formatter):
    """JSON 格式化器"""
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data, ensure_ascii=False)

def setup_logging(
    level: str = "INFO",
    log_file: str = None,
    json_format: bool = False
) -> None:
    """配置日志系统 (多进程稳定版)"""
    log_level = getattr(logging, level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # 清除旧 Handler
    root_logger.handlers.clear()
    
    # 1. 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    
    # 2. 格式化
    if json_format:
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # 3. 文件输出 (使用标准 FileHandler 避免多进程滚动冲突)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 使用 mode='a' (追加模式)，确保多个进程都能写
        file_handler = logging.FileHandler(
            log_file,
            mode='a',
            encoding='utf-8',
            delay=False
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

        # 核心：关闭所有 Handler 的缓冲区，强制实时落盘
        for handler in root_logger.handlers:
            if hasattr(handler, 'stream') and hasattr(handler.stream, 'flush'):
                handler.flush()

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

# 默认日志实例
logger = get_logger("app")
