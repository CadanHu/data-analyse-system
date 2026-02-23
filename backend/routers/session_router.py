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
    - **database_key**: 可选的数据库键，默认为 'business'
    """
    title = session_data.title if session_data and session_data.title else None
    session_id = await session_db.create_session(title)
    
    session_data = await session_db.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=500, detail="创建会话失败")
    
    return Session(
        id=session_data['id'],
        title=session_data.get('title'),
        database_key=session_data.get('database_key', 'business'),
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
            database_key=s.get('database_key', 'business'),
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
        database_key=session_data.get('database_key', 'business'),
        created_at=session_data['created_at'],
        updated_at=session_data['updated_at']
    )


@router.get("/{session_id}/database")
async def get_session_database(session_id: str):
    """
    获取会话关联的数据库
    
    - **session_id**: 会话 ID
    """
    db_key = await session_db.get_session_database(session_id)
    if db_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    return {"database_key": db_key}


@router.post("/{session_id}/database")
async def set_session_database(session_id: str, data: dict):
    """
    设置会话关联的数据库
    
    - **session_id**: 会话 ID
    - **database_key**: 数据库键
    """
    db_key = data.get("database_key")
    if not db_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="缺少 database_key 参数"
        )
    
    success = await session_db.set_session_database(session_id, db_key)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    
    return {"message": "数据库设置成功", "database_key": db_key}


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
    success = await session_db.update_session_title(session_id, session_update.title)
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
        database_key=session_data.get('database_key', 'business'),
        created_at=session_data['created_at'],
        updated_at=session_data['updated_at']
    )
