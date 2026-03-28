"""
用户 API Key 管理路由
提供：增/查/删 用户自定义 API Key
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from database.session_db import session_db
from routers.auth_router import get_current_user

router = APIRouter()

SUPPORTED_PROVIDERS = {
    # 国内直连
    "deepseek",
    "qwen", "qwen_embedding",
    "zhipu", "zhipu_embedding",
    "minimax",
    "kimi",
    "doubao",
    "hunyuan",
    "baidu",

    "sensenova",
    # 需要VPN
    "openai",
    "gemini", "google_embedding",
    "claude",
    "xai",
    "mistral", "mistral_embedding",
    # 工具
    "mineru",
    "jina_embedding",
}

# 哪些模型支持思考模式（前端和后端保持一致）
THINKING_SUPPORTED = {
    "deepseek": ["deepseek-reasoner"],
    "qwen":     ["qwen3-thinking", "qwen3-max", "qwen3-coder", "qwen3.5-plus"],
    "zhipu":    ["glm-5-turbo", "glm-4.7", "glm-4.7-flashx", "glm-4.5"],
    "minimax":  ["MiniMax-M1"],
    "kimi":     ["kimi-k2.5", "kimi-k2-thinking"],
    "doubao":   ["doubao-seed-2.0-pro", "doubao-seed-1.6"],
    "baidu":    ["ERNIE-4.5-Think"],
    "sensenova":["SenseNova-V6.5-Pro", "SenseNova-V6-Reasoner"],
    "openai":   ["o3", "o4-mini"],
    "gemini":   ["gemini-3.1-pro-preview"],
    "claude":   [
        "claude-opus-4-6", "claude-sonnet-4-6",
        "claude-opus-4-5", "claude-sonnet-4-5",
        "claude-3-7-sonnet-20250219",
    ],
    "xai":      [],
    "mistral":  [],
}


class ApiKeyUpsert(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None


@router.get("/api-keys")
async def list_api_keys(current_user: dict = Depends(get_current_user)):
    """获取用户已配置的 API Key 列表 (Key 内容脱敏)"""
    keys = await session_db.get_all_api_keys(current_user["id"])
    result = []
    for k in keys:
        masked = {
            "provider": k["provider"],
            "model_name": k.get("model_name"),
            "base_url": k.get("base_url"),
            "has_key": True,
            "api_key_preview": k["api_key"][:8] + "..." + k["api_key"][-4:] if len(k["api_key"]) > 12 else "****",
            "updated_at": k.get("updated_at"),
        }
        result.append(masked)
    return result


@router.post("/api-keys")
async def save_api_key(data: ApiKeyUpsert, current_user: dict = Depends(get_current_user)):
    """新增或更新某个供应商的 API Key"""
    if data.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"不支持的供应商: {data.provider}，支持: {SUPPORTED_PROVIDERS}")
    if not data.api_key.strip():
        raise HTTPException(status_code=400, detail="API Key 不能为空")

    await session_db.set_api_key(
        user_id=current_user["id"],
        provider=data.provider,
        api_key=data.api_key.strip(),
        base_url=data.base_url,
        model_name=data.model_name
    )
    return {"success": True, "provider": data.provider}


@router.delete("/api-keys/{provider}")
async def delete_api_key(provider: str, current_user: dict = Depends(get_current_user)):
    """删除某个供应商的 API Key"""
    result = await session_db.delete_api_key(current_user["id"], provider)
    if not result:
        raise HTTPException(status_code=404, detail="未找到该供应商的 API Key")
    return {"success": True}


@router.get("/api-keys/thinking-support")
async def get_thinking_support():
    """返回各供应商支持思考模式的模型列表"""
    return THINKING_SUPPORTED
