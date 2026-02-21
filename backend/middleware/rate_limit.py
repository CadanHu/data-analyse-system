"""
请求频率限制中间件
"""
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from collections import defaultdict
import time
import asyncio
from typing import Dict, Tuple
from config import RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW

# 存储每个 IP 的请求记录
# 格式: {ip: [(timestamp1, timestamp2, ...)]}
request_records: Dict[str, list] = defaultdict(list)

# 清理过期记录的锁
cleanup_lock = asyncio.Lock()


class RateLimiter:
    """请求频率限制器"""
    
    @staticmethod
    async def is_allowed(ip: str, max_requests: int = RATE_LIMIT_REQUESTS, window: int = RATE_LIMIT_WINDOW) -> Tuple[bool, int]:
        """
        检查请求是否允许
        
        Args:
            ip: 客户端 IP 地址
            max_requests: 时间窗口内最大请求数
            window: 时间窗口（秒）
            
        Returns:
            (是否允许, 剩余请求数)
        """
        current_time = time.time()
        window_start = current_time - window
        
        # 获取该 IP 的请求记录
        records = request_records[ip]
        
        # 清理过期的请求记录
        records[:] = [t for t in records if t > window_start]
        
        # 检查是否超过限制
        if len(records) >= max_requests:
            return False, 0
        
        # 记录当前请求
        records.append(current_time)
        
        # 返回剩余请求数
        return True, max_requests - len(records)
    
    @staticmethod
    async def cleanup_expired_records():
        """定期清理过期的请求记录"""
        async with cleanup_lock:
            current_time = time.time()
            for ip in list(request_records.keys()):
                if not request_records[ip]:
                    del request_records[ip]
                else:
                    # 保留最近 5 分钟的记录
                    window_start = current_time - 300
                    request_records[ip][:] = [t for t in request_records[ip] if t > window_start]


async def rate_limit_middleware(request: Request, call_next):
    """请求频率限制中间件"""
    # 获取客户端 IP
    client_ip = request.client.host if request.client else "unknown"
    
    # 检查是否在白名单中（本地开发环境）
    if client_ip in ["127.0.0.1", "::1", "localhost"]:
        return await call_next(request)
    
    # 检查请求频率
    allowed, remaining = await RateLimiter.is_allowed(client_ip)
    
    if not allowed:
        # 计算重置时间
        records = request_records[client_ip]
        if records:
            oldest_request = min(records)
            reset_time = int(oldest_request + RATE_LIMIT_WINDOW - time.time())
        else:
            reset_time = RATE_LIMIT_WINDOW
        
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "message": "请求过于频繁，请稍后再试",
                "error_type": "RateLimitExceeded",
                "retry_after": reset_time
            },
            headers={
                "Retry-After": str(reset_time),
                "X-RateLimit-Limit": str(RATE_LIMIT_REQUESTS),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_time)
            }
        )
    
    # 继续处理请求
    response = await call_next(request)
    
    # 添加响应头
    response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(RATE_LIMIT_WINDOW)
    
    return response
