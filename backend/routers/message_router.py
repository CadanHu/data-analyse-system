"""
消息管理路由
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List

from models.session import Message, MessageCreate
from database.session_db import session_db
from routers.auth_router import get_current_user

router = APIRouter(prefix="/sessions/{session_id}/messages", tags=["消息管理"])


@router.get("", response_model=List[Message])
async def get_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    """
    获取会话的所有消息
    """
    user_id = current_user["id"]
    # 验证会话是否存在且属于该用户
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话不存在或无权访问"
        )
    
    messages_data = await session_db.get_messages(session_id)
    return [
        Message(
            id=m['id'],
            session_id=m['session_id'],
            role=m['role'],
            content=m['content'],
            sql=m.get('sql'),
            chart_cfg=m.get('chart_cfg'),
            thinking=m.get('thinking'),
            data=m.get('data'),
            created_at=m['created_at']
        )
        for m in messages_data
    ]


@router.post("", response_model=Message, status_code=status.HTTP_201_CREATED)
async def create_message(session_id: str, message_data: MessageCreate, current_user: dict = Depends(get_current_user)):
    """
    创建新消息
    """
    user_id = current_user["id"]
    # 验证会话是否存在且属于该用户
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话不存在或无权访问"
        )
    
    message_id = await session_db.create_message({
        "session_id": session_id,
        "role": message_data.role,
        "content": message_data.content,
        "sql": message_data.sql,
        "chart_cfg": message_data.chart_cfg,
        "thinking": message_data.thinking,
        "data": message_data.data
    })
    
    messages = await session_db.get_messages(session_id)
    # 获取刚创建的消息
    target_message = next((m for m in messages if m['id'] == message_id), None)
    
    if not target_message:
        raise HTTPException(status_code=500, detail="创建消息失败")
    
    return Message(
        id=target_message['id'],
        session_id=target_message['session_id'],
        role=target_message['role'],
        content=target_message['content'],
        sql=target_message.get('sql'),
        chart_cfg=target_message.get('chart_cfg'),
        thinking=target_message.get('thinking'),
        data=target_message.get('data'),
        created_at=target_message['created_at']
    )
