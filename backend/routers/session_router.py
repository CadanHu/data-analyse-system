from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel

from database.session_db import session_db
from routers.auth_router import get_current_user

router = APIRouter(prefix="/sessions", tags=["会话管理"])

class SessionTitleUpdate(BaseModel):
    title: str

@router.post("")
async def create_session(current_user: dict = Depends(get_current_user)):
    """创建新会话"""
    user_id = current_user["id"]
    session_id = await session_db.create_session(user_id=user_id, title="新会话")
    return {"id": session_id, "title": "新会话"}

@router.get("")
async def get_sessions(current_user: dict = Depends(get_current_user)):
    """获取用户的所有会话"""
    user_id = current_user["id"]
    return await session_db.get_all_sessions(user_id=user_id)

@router.get("/{session_id}")
async def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """获取单个会话详情"""
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session

@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """删除会话"""
    user_id = current_user["id"]
    success = await session_db.delete_session(session_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="删除失败或无权限")
    return {"success": True}

@router.patch("/{session_id}")
async def update_session_title(session_id: str, data: SessionTitleUpdate, current_user: dict = Depends(get_current_user)):
    """更新会话标题"""
    user_id = current_user["id"]
    success = await session_db.update_session_title(session_id, user_id, data.title)
    if not success:
        raise HTTPException(status_code=404, detail="更新失败或无权限")
    return {"success": True}

class SessionDatabaseUpdate(BaseModel):
    database_key: str

@router.post("/{session_id}/database")
async def update_session_database(session_id: str, data: SessionDatabaseUpdate, current_user: dict = Depends(get_current_user)):
    """更新会话绑定的数据库"""
    user_id = current_user["id"]
    success = await session_db.update_session_database(session_id, user_id, data.database_key)
    if not success:
        raise HTTPException(status_code=404, detail="更新会话数据库失败或无权限")
    return {"success": True}
