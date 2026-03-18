"""
sync_router.py — 手机端本地 ↔ 远端双向同步端点

GET  /api/sync/ping       无需 auth，健康检查
GET  /api/sync/pull       需 auth，返回自 since 起变更
POST /api/sync/push       需 auth，upsert 本地变更，处理软删除
"""
from datetime import datetime
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from routers.auth_router import get_current_user
from database.session_db import session_db

router = APIRouter(prefix="/sync", tags=["同步"])


# ==================== Ping ====================

@router.get("/ping")
async def sync_ping():
    """无需认证，供客户端检测连通性"""
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


# ==================== Pull ====================

@router.get("/pull")
async def sync_pull(
    since: Optional[str] = Query(None, description="ISO-8601 UTC 时间戳，只返回此时间之后的变更"),
    current_user: dict = Depends(get_current_user)
):
    """
    拉取自 since 起该用户的所有变更数据。
    返回: sessions, messages, api_keys, server_time
    """
    user_id = current_user["id"]

    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    sessions = await session_db.get_sessions_since(user_id, since_dt)
    messages = await session_db.get_messages_since(user_id, since_dt)
    api_keys = await session_db.get_api_keys_since(user_id, since_dt)

    return {
        "sessions": sessions,
        "messages": messages,
        "api_keys": api_keys,
        "server_time": datetime.utcnow().isoformat(),
    }


# ==================== Push ====================

class SessionPushItem(BaseModel):
    id: str
    user_id: int
    title: Optional[str] = None
    database_key: Optional[str] = "business"
    status: Optional[str] = "active"
    enable_data_science_agent: Optional[bool] = False
    enable_thinking: Optional[bool] = False
    enable_rag: Optional[bool] = False
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MessagePushItem(BaseModel):
    id: str
    session_id: str
    parent_id: Optional[str] = None
    role: str
    content: str = ""
    sql: Optional[str] = None
    chart_cfg: Optional[str] = None
    thinking: Optional[str] = None
    data: Optional[str] = None
    is_current: Optional[bool] = True
    feedback: Optional[int] = 0
    feedback_text: Optional[str] = None
    tokens_prompt: Optional[int] = 0
    tokens_completion: Optional[int] = 0
    created_at: Optional[str] = None


class ApiKeyPushItem(BaseModel):
    id: str
    user_id: int
    provider: str
    api_key: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PushPayload(BaseModel):
    sessions: List[SessionPushItem] = []
    messages: List[MessagePushItem] = []
    api_keys: List[ApiKeyPushItem] = []
    deleted_sessions: List[str] = []
    deleted_messages: List[str] = []
    deleted_api_keys: List[str] = []


@router.post("/push")
async def sync_push(
    payload: PushPayload,
    current_user: dict = Depends(get_current_user)
):
    """
    接收客户端 dirty 数据，upsert 到服务端。
    安全校验：session.user_id / api_key.user_id 必须等于 current_user.id
    """
    user_id = current_user["id"]
    errors: List[str] = []

    # --- Upsert sessions ---
    for s in payload.sessions:
        if s.user_id != user_id:
            errors.append(f"session {s.id}: user_id mismatch")
            continue
        try:
            await session_db.upsert_session({
                "id": s.id,
                "user_id": s.user_id,
                "title": s.title,
                "database_key": s.database_key,
                "status": s.status,
                "enable_data_science_agent": s.enable_data_science_agent,
                "enable_thinking": s.enable_thinking,
                "enable_rag": s.enable_rag,
                "model_provider": s.model_provider,
                "model_name": s.model_name,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
            })
        except Exception as e:
            errors.append(f"session {s.id}: {e}")

    # --- Upsert messages ---
    for m in payload.messages:
        # Verify the session belongs to current_user
        try:
            sess = await session_db.get_session_by_id(m.session_id)
            if sess and sess.get("user_id") != user_id:
                errors.append(f"message {m.id}: session user_id mismatch")
                continue
            await session_db.upsert_message({
                "id": m.id,
                "session_id": m.session_id,
                "parent_id": m.parent_id,
                "role": m.role,
                "content": m.content,
                "sql": m.sql,
                "chart_cfg": m.chart_cfg,
                "thinking": m.thinking,
                "data": m.data,
                "is_current": m.is_current,
                "feedback": m.feedback,
                "feedback_text": m.feedback_text,
                "tokens_prompt": m.tokens_prompt,
                "tokens_completion": m.tokens_completion,
                "created_at": m.created_at,
            })
        except Exception as e:
            errors.append(f"message {m.id}: {e}")

    # --- Upsert api_keys ---
    for k in payload.api_keys:
        if k.user_id != user_id:
            errors.append(f"api_key {k.id}: user_id mismatch")
            continue
        try:
            await session_db.upsert_api_key({
                "id": k.id,
                "user_id": k.user_id,
                "provider": k.provider,
                "api_key": k.api_key,
                "base_url": k.base_url,
                "model_name": k.model_name,
                "created_at": k.created_at,
                "updated_at": k.updated_at,
            })
        except Exception as e:
            errors.append(f"api_key {k.id}: {e}")

    # --- Delete sessions ---
    for sid in payload.deleted_sessions:
        try:
            sess = await session_db.get_session_by_id(sid)
            if sess and sess.get("user_id") == user_id:
                await session_db.delete_session(sid, user_id)
        except Exception as e:
            errors.append(f"delete session {sid}: {e}")

    # --- Delete messages ---
    for mid in payload.deleted_messages:
        try:
            await session_db.delete_message(mid, user_id)
        except Exception as e:
            errors.append(f"delete message {mid}: {e}")

    # --- Delete api_keys ---
    for kid in payload.deleted_api_keys:
        try:
            await session_db.delete_api_key_by_id(kid, user_id)
        except Exception as e:
            errors.append(f"delete api_key {kid}: {e}")

    return {
        "ok": True,
        "errors": errors,
        "server_time": datetime.utcnow().isoformat(),
    }
