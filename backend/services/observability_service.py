import asyncio
import os
from pathlib import Path
from typing import AsyncGenerator

# 强制绝对路径
CURRENT_DIR = Path(__file__).resolve().parent.parent
LOG_FILE_PATH = CURRENT_DIR / "logs" / "app.log"

class ObservabilityService:
    """实时日志流推送 (优雅退出版)"""

    @staticmethod
    async def stream_logs() -> AsyncGenerator[str, None]:
        log_path = str(LOG_FILE_PATH)
        
        if not os.path.exists(log_path):
            yield f"data: ⚠️ 日志文件不存在\n\n"
            return

        # 1. 首次连接：仅读取最后 20 条
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(max(0, size - 8192))
                lines = f.readlines()
                last_20 = [l.strip() for l in lines if l.strip()][-20:]
                for line in last_20:
                    yield f"data: {line}\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            # 捕获退出信号，直接结束生成器
            return
        except Exception as e:
            yield f"data: ❌ 读取历史失败: {str(e)}\n\n"

        # 2. 持续追踪：真正的非阻塞追踪
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                f.seek(0, os.SEEK_END)
                while True:
                    line = f.readline()
                    if line:
                        clean = line.strip()
                        if clean:
                            yield f"data: {clean}\n\n"
                    else:
                        await asyncio.sleep(0.3)
        except (asyncio.CancelledError, GeneratorExit):
            # 🚀 关键修复：当连接关闭或服务器重启时，优雅退出循环，不抛出异常堆栈
            return
        except Exception as e:
            # 仅在非退出导致的异常时发送错误消息
            try:
                yield f"data: ❌ 追踪中断: {str(e)}\n\n"
            except:
                pass

observability_service = ObservabilityService()
