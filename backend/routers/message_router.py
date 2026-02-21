"""
消息管理路由
"""
from fastapi import APIRouter, HTTPException, status
from typing import List

from models.session import Message, MessageCreate
from database.session_db import session_db

router = APIRouter(prefix="/sessions/{session_id}/messages", tags=["消息管理"])


@router.get("", response_model=List[Message])
async def get_messages(session_id: str):
    """
    获取会话的所有消息
    
    - **session_id**: 会话 ID
    - 返回按创建时间正序排列的所有消息
    """
    # 验证会话是否存在
    session = await session_db.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
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
            created_at=m['created_at']
        )
        for m in messages_data
    ]


@router.post("", response_model=Message, status_code=status.HTTP_201_CREATED)
async def create_message(session_id: str, message_data: MessageCreate):
    """
    创建新消息
    
    - **session_id**: 会话 ID
    - **role**: 角色（user 或 assistant）
    - **content**: 消息内容
    - **sql**: 可选，生成的 SQL 语句
    - **chart_cfg**: 可选，图表配置 JSON
    """
    # 验证会话是否存在
    session = await session_db.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在"
        )
    
    message_id = await session_db.add_message(
        session_id=session_id,
        role=message_data.role,
        content=message_data.content,
        sql=message_data.sql,
        chart_cfg=message_data.chart_cfg
    )
    
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
        created_at=target_message['created_at']
    )
