"""
流式 HTTP 服务 - 使用标准 HTTP 流式响应替代 SSE
"""
import json
from datetime import date, datetime
from decimal import Decimal
from typing import AsyncGenerator, Dict, Any


class CustomJSONEncoder(json.JSONEncoder):
    """
    自定义 JSON 编码器，支持日期、时间、Decimal 等类型
    """
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super(CustomJSONEncoder, self).default(obj)


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
            
            # 记录流式输出事件
            if event_type not in ["model_thinking"]:
                pass
                # print(f"📡 [Stream] 发送事件给前端: {event_type}")
            
            # 标准 SSE 格式: data: <content>\n\n
            json_str = json.dumps({
                "event": event_type,
                "data": event_data
            }, ensure_ascii=False, cls=CustomJSONEncoder)
            
            yield f"data: {json_str}\n\n"

    @staticmethod
    def get_response_headers() -> Dict[str, str]:
        """获取流式响应的 HTTP 头"""
        return {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
