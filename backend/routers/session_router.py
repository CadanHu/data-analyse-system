"""
会话管理路由
"""
from fastapi import APIRouter, HTTPException, status, Body
from typing import List, Optional

from models.session import Session, SessionCreate, SessionUpdate
from database.session_db import session_db
from agents.memory_manager import get_memory_manager

router = APIRouter(prefix="/sessions", tags=["会话管理"])


@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(session_data: Optional[SessionCreate] = Body(None)):
    """
    创建新会话
    
    - **title**: 可选的会话标题，如果不提供将自动生成
    """
    title = session_data.title if session_data and session_data.title else None
    session_id = await session_db.create_session(title)
    
    session_data = await session_db.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=500, detail="创建会话失败")
    
    return Session(
        id=session_data['id'],
        title=session_data.get('title'),
        created_at=session_data['created_at'],
        updated_at=session_data['updated_at']
    )


@router.get("", response_model=List[Session])
async def get_sessions():
    """
    获取所有会话列表
    
    返回按更新时间倒序排列的所有会话
    """
    sessions_data = await session_db.get_all_sessions()
    return [
        Session(
            id=s['id'],
            title=s.get('title'),
            created_at=s['created_at'],
            updated_at=s['updated_at']
        )
        for s in sessions_data
    ]


@router.get("/{session_id}", response_model=Session)
async def get_session(session_id: str):
    """
    获取会话详情
    
    - **session_id**: 会话 ID
    """
    session_data = await session_db.get_session(session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    return Session(
        id=session_data['id'],
        title=session_data.get('title'),
        created_at=session_data['created_at'],
        updated_at=session_data['updated_at']
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str):
    """
    删除会话
    
    - **session_id**: 会话 ID
    - 同时删除会话下的所有消息
    """
    success = await session_db.delete_session(session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )


@router.patch("/{session_id}", response_model=Session)
async def update_session(session_id: str, session_update: SessionUpdate):
    """
    更新会话标题
    
    - **session_id**: 会话 ID
    - **title**: 新的会话标题
    """
    success = await session_db.update_session(session_id, session_update.title)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    
    session_data = await session_db.get_session(session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    return Session(
        id=session_data['id'],
        title=session_data.get('title'),
        created_at=session_data['created_at'],
        updated_at=session_data['updated_at']
    )


@router.post("/{session_id}/clear-context", status_code=status.HTTP_204_NO_CONTENT)
async def clear_session_context(session_id: str):
    """
    清空会话上下文（Memory）
    
    - **session_id**: 会话 ID
    - 清空该会话的 Memory Manager 中的记忆
    """
    memory_manager = get_memory_manager()
    await memory_manager.clear_memory(session_id)
    print(f"🧹 已清空会话 {session_id} 的上下文记忆")
