"""
会话数据模型
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SessionBase(BaseModel):
    """会话基础模型"""
    title: Optional[str] = Field(None, max_length=200, description="会话标题")


class SessionCreate(SessionBase):
    """创建会话请求"""
    pass


class SessionUpdate(BaseModel):
    """更新会话请求"""
    title: str = Field(..., max_length=200, description="新的会话标题")


class Session(SessionBase):
    """会话响应"""
    id: str
    database_key: Optional[str] = "business"
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    """消息基础模型"""
    content: str = Field(..., description="消息内容")


class MessageCreate(MessageBase):
    """创建消息请求"""
    session_id: str
    role: str = Field(..., description="角色：user 或 assistant")
    sql: Optional[str] = Field(None, description="生成的 SQL")
    chart_cfg: Optional[str] = Field(None, description="ECharts 配置 JSON")
    thinking: Optional[str] = Field(None, description="思考过程")
    data: Optional[str] = Field(None, description="数据 JSON")


class Message(MessageBase):
    """消息响应"""
    id: str
    session_id: str
    role: str
    sql: Optional[str] = Field(None, description="生成的 SQL")
    chart_cfg: Optional[str] = Field(None, description="ECharts 配置 JSON")
    thinking: Optional[str] = Field(None, description="思考过程")
    data: Optional[str] = Field(None, description="数据 JSON")
    created_at: datetime
    
    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    """聊天请求"""
    session_id: str
    question: str


class ChartConfig(BaseModel):
    """图表配置"""
    sql: str
    chart_type: str = Field(..., description="图表类型：bar/line/pie/scatter/table")
    reasoning: str = Field(..., description="分析思路")
