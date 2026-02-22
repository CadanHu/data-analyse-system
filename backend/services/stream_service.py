"""
流式 HTTP 服务 - 使用标准 HTTP 流式响应替代 SSE
"""
import json
from typing import AsyncGenerator, Dict, Any


class StreamableHTTPService:
    """流式 HTTP 服务类，用于生成流式 JSON 响应"""

    @staticmethod
    async def generate_stream(
        event_generator: AsyncGenerator[Dict[str, Any], None]
    ) -> AsyncGenerator[str, None]:
        """
        将事件生成器转换为流式 JSON 响应

        Args:
            event_generator: 事件生成器，每个事件包含 event 和 data 字段

        Yields:
            JSON 格式的字符串，每行一个事件
        """
        async for event in event_generator:
            event_type = event.get("event")
            event_data = event.get("data", {})
            
            # 生成流式 JSON 格式
            yield json.dumps({
                "event": event_type,
                "data": event_data
            }, ensure_ascii=False) + "\n"

    @staticmethod
    def get_response_headers() -> Dict[str, str]:
        """获取流式响应的 HTTP 头"""
        return {
            "Content-Type": "application/json; charset=utf-8",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
