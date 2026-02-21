"""
消息数据模型
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MessageCreate(BaseModel):
    session_id: str
    role: str
    content: str
    sql: Optional[str] = None
    chart_cfg: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    sql: Optional[str] = None
    chart_cfg: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    session_id: str
    question: str
