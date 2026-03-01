from fastapi import APIRouter, HTTPException, Depends, Response, status
from typing import List, Optional
from pydantic import BaseModel
import io
import os
from fpdf import FPDF

from database.session_db import session_db
from routers.auth_router import get_current_user

router = APIRouter(prefix="/sessions", tags=["会话管理"])

# --- 模型定义 ---

class SessionTitleUpdate(BaseModel):
    title: str

class SessionDatabaseUpdate(BaseModel):
    database_key: str

class SessionCreate(BaseModel):
    database_key: Optional[str] = "classic_business"

class SessionResponse(BaseModel):
    id: str
    title: Optional[str] = None
    database_key: str = "business"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

# --- API 路由 ---

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(data: Optional[SessionCreate] = None, current_user: dict = Depends(get_current_user)):
    """创建新会话"""
    user_id = current_user["id"]
    db_key = data.database_key if data else "classic_business"
    session_id = await session_db.create_session(user_id=user_id, title="新会话", database_key=db_key)
    return {"id": session_id, "title": "新会话", "database_key": db_key}

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

@router.post("/{session_id}/database")
async def update_session_database(session_id: str, data: SessionDatabaseUpdate, current_user: dict = Depends(get_current_user)):
    """更新会话绑定的数据库"""
    user_id = current_user["id"]
    success = await session_db.update_session_database(session_id, user_id, data.database_key)
    if not success:
        raise HTTPException(status_code=404, detail="更新会话数据库失败或无权限")
    return {"success": True}

@router.get("/{session_id}/messages")
async def get_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    """获取会话的所有消息"""
    # 验证会话所属权
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权限")
    
    return await session_db.get_messages(session_id)

@router.get("/{session_id}/export")
async def export_session(
    session_id: str, 
    format: str = "txt", 
    current_user: dict = Depends(get_current_user)
):
    """导出整个会话对话内容"""
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    messages = await session_db.get_messages(session_id)
    if not messages:
        raise HTTPException(status_code=404, detail="会话中没有消息")
    
    session_title = session.get("title", "未命名会话")
    
    if format == "txt":
        content = f"会话标题: {session_title}\n导出时间: {session.get('updated_at')}\n" + "="*30 + "\n\n"
        for msg in messages:
            role = "用户" if msg['role'] == "user" else "助手"
            content += f"[{role}]: {msg['content']}\n"
            if msg.get('sql'):
                content += f"[SQL]: {msg['sql']}\n"
            content += "-"*10 + "\n"
        return Response(
            content=content.encode("utf-8"),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename=session_{session_id}.txt"}
        )
        
    elif format == "md":
        content = f"# {session_title}\n\n*导出时间: {session.get('updated_at')}*\n\n---\n\n"
        for msg in messages:
            role = "### 👤 用户" if msg['role'] == "user" else "### 🤖 助手"
            content += f"{role}\n\n{msg['content']}\n\n"
            if msg.get('sql'):
                content += f"```sql\n{msg['sql']}\n```\n\n"
            if msg.get('thinking'):
                content += f"> **思考过程**:\n> {msg['thinking']}\n\n"
            content += "---\n\n"
        return Response(
            content=content.encode("utf-8"),
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=session_{session_id}.md"}
        )
        
    elif format == "pdf":
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        
        # 使用绝对路径加载中文字体
        current_dir = os.path.dirname(os.path.abspath(__file__))
        base_dir = os.path.dirname(current_dir)
        font_path = os.path.join(base_dir, "static", "fonts", "ZCOOLXiaoWei-Regular.ttf")
        
        font_family = 'ZCOOL'
        try:
            if not os.path.exists(font_path):
                alt_path = "backend/static/fonts/ZCOOLXiaoWei-Regular.ttf"
                if os.path.exists(alt_path):
                    font_path = alt_path
                else:
                    raise FileNotFoundError(f"字体文件不存在于 {font_path}")
            
            pdf.add_font(font_family, '', font_path)
            pdf.set_font(font_family, '', 10)
        except Exception as e:
            print(f"❌ 字体加载失败: {str(e)}")
            font_family = 'Helvetica'
        
        # 1. 页眉设计
        pdf.set_fill_color(6, 214, 160) # 翡翠绿
        pdf.rect(0, 0, 210, 40, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font(font_family, '', 20)
        pdf.set_y(10)
        pdf.cell(0, 10, "数据脉动 | 智能分析报告", ln=True, align="C")
        pdf.set_font(font_family, '', 12)
        pdf.cell(0, 10, f"主题: {session_title}", ln=True, align="C")
        pdf.set_font(font_family, '', 9)
        pdf.cell(0, 5, f"导出时间: {session.get('updated_at')}", ln=True, align="C")
        pdf.ln(20)
        
        # 2. 对话流
        for msg in messages:
            is_user = msg['role'] == "user"
            pdf.set_font(font_family, '', 11)
            pdf.set_text_color(100, 100, 100)
            role_text = "用户提问" if is_user else "AI 分析结论"
            pdf.cell(0, 8, f" {role_text}", ln=True)
            
            pdf.set_font(font_family, '', 10)
            pdf.set_text_color(31, 41, 55)
            clean_content = msg['content'].replace('📊', '').replace('💡', '').replace('🔍', '').replace('🚀', '')
            
            if is_user:
                pdf.set_fill_color(240, 249, 245)
            else:
                pdf.set_fill_color(245, 248, 255)
            
            pdf.set_x(15)
            pdf.multi_cell(180, 7, clean_content, border=0, fill=True)
            
            if msg.get('sql'):
                pdf.ln(2)
                pdf.set_fill_color(249, 250, 251)
                pdf.set_text_color(59, 130, 246)
                pdf.set_font(font_family, '', 9) 
                sql_text = f" [执行 SQL]:\n {msg['sql']}"
                pdf.set_x(15)
                pdf.multi_cell(180, 5, sql_text, border=1, fill=True)
                pdf.set_font(font_family, '', 10)
                pdf.set_text_color(0, 0, 0)
                
            pdf.ln(10)
            
        pdf_output = bytes(pdf.output())
        return Response(
            content=pdf_output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=analysis_report_{session_id}.pdf"}
        )
    
    raise HTTPException(status_code=400, detail="不支持的导出格式")
