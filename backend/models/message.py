"""
消息数据模型
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class MessageCreate(BaseModel):
    session_id: str
    role: str
    content: str
    sql: Optional[str] = None
    chart_cfg: Optional[str] = None
    thinking: Optional[str] = None
    data: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    sql: Optional[str] = None
    chart_cfg: Optional[str] = None
    thinking: Optional[str] = None
    data: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    session_id: str
    question: str
    parent_id: Optional[str] = None # 用于分支功能：如果用户修改了中间的消息，则带上父消息 ID
    enable_thinking: bool = False
    enable_rag: bool = False
    enable_data_science_agent: bool = False # 🚀 新增：启用 AI 数据科学家模式
    external_data: Optional[List[Dict[str, Any]]] = None # 🚀 新增：支持外部 Agent 自带数据
    model_provider: Optional[str] = None # 可选：deepseek, openai, gemini, claude
    model_name: Optional[str] = None # 可选：具体模型名称
