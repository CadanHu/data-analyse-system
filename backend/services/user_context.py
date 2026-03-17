"""
请求级别的用户上下文 (contextvars 实现，兼容 asyncio)
用于在不修改 sql_agent 接口的情况下，透传用户自定义 API Key
"""
import contextvars
from typing import Optional, Dict

# 每个请求独立的用户 API Key 上下文
_user_api_key_ctx: contextvars.ContextVar[Dict[str, str]] = contextvars.ContextVar(
    'user_api_key_ctx', default={}
)


def set_user_api_keys(keys: Dict[str, str]):
    """设置当前请求的用户 API Key 上下文"""
    _user_api_key_ctx.set(keys)


def get_user_api_key(provider: str) -> Optional[str]:
    """获取当前请求中指定供应商的 API Key"""
    return _user_api_key_ctx.get().get(f"{provider}_api_key")


def get_user_base_url(provider: str) -> Optional[str]:
    """获取当前请求中指定供应商的 Base URL (如果用户自定义了)"""
    return _user_api_key_ctx.get().get(f"{provider}_base_url")
