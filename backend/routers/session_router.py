from fastapi import APIRouter, HTTPException, Depends, Response, status
from fastapi.responses import FileResponse
from typing import List, Optional
import io
import os
import json
import uuid
import markdown
from datetime import datetime
from pydantic import BaseModel

from database.session_db import session_db
from routers.auth_router import get_current_user
from services.pdf_service import pdf_service
from utils.json_utils import json_dumps

router = APIRouter(prefix="/sessions", tags=["会话管理"])

# --- 模型定义 ---

class SessionTitleUpdate(BaseModel):
    title: str

class SessionModesUpdate(BaseModel):
    enable_data_science_agent: Optional[bool] = None
    enable_thinking: Optional[bool] = None
    enable_rag: Optional[bool] = None

class SessionDatabaseUpdate(BaseModel):
    database_key: str

class BranchActivationRequest(BaseModel):
    message_ids: List[str]

class SessionCreate(BaseModel):
    database_key: Optional[str] = "classic_business"

# --- 辅助函数：构建全会话 HTML ---

def build_session_html(session_title: str, messages: List[dict]) -> str:
    """构建精美的会话 HTML 模板"""
    
    # 基础样式
    style = """
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 40px; }
        .header { text-align: center; border-bottom: 2px solid #06d6a0; padding-bottom: 20px; margin-bottom: 40px; }
        .header h1 { color: #050810; margin: 0; font-size: 28px; }
        .header .meta { color: #666; font-size: 14px; margin-top: 10px; }
        
        .message { margin-bottom: 35px; padding: 20px; border-radius: 12px; border: 1px solid #eee; }
        .user-msg { background-color: #f0fdf5; border-left: 5px solid #06d6a0; }
        .assistant-msg { background-color: #f8fafc; border-left: 5px solid #3b82f6; }
        
        .role { font-weight: bold; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
        .user-msg .role { color: #059669; }
        .assistant-msg .role { color: #2563eb; }
        
        .content { font-size: 15px; word-wrap: break-word; }
        .content img { max-width: 100%; border-radius: 8px; margin-top: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        
        .thinking { background: #fffbeb; border: 1px solid #fde68a; padding: 15px; border-radius: 8px; font-size: 13px; color: #92400e; font-style: italic; margin-bottom: 15px; }
        .sql-box { background: #0f172a; color: #f8fafc; padding: 15px; border-radius: 8px; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 13px; margin: 15px 0; overflow-x: auto; }
        
        table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 14px; }
        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
        th { background-color: #f1f5f9; }
        
        footer { text-align: center; margin-top: 60px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    </style>
    """
    
    body_content = f"""
    <div class="header">
        <h1>{session_title}</h1>
        <div class="meta">数据脉动 (DataPulse) 智能分析报告 · 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}</div>
    </div>
    """
    
    for msg in messages:
        role_class = "user-msg" if msg['role'] == "user" else "assistant-msg"
        role_name = "👤 用户提问" if msg['role'] == "user" else "🤖 AI 分析结论"
        
        msg_html = f'<div class="message {role_class}">'
        msg_html += f'<div class="role">{role_name}</div>'
        
        # 1. 思考过程 (如果存在)
        if msg.get('thinking'):
            msg_html += f'<div class="thinking"><b>🤔 思考过程:</b><br>{msg["thinking"]}</div>'
        
        # 2. Markdown 正文渲染
        # 注意：这里需要处理科学模式下 Base64 图片的情况
        content_md = msg['content']
        content_html = markdown.markdown(content_md, extensions=['tables', 'fenced_code'])
        msg_html += f'<div class="content">{content_html}</div>'
        
        # 3. SQL 代码块
        if msg.get('sql'):
            msg_html += f'<div class="sql-box"><b>SQL Query:</b><br><pre>{msg["sql"]}</pre></div>'
            
        # 4. 科学家模式图表 (Base64)
        if msg.get('data'):
            try:
                data_obj = json.loads(msg['data'])
                if data_obj.get('plot_image_base64'):
                    img_data = data_obj['plot_image_base64']
                    if not img_data.startswith('data:'):
                        img_data = f"data:image/png;base64,{img_data}"
                    msg_html += f'<div class="content"><img src="{img_data}" alt="Analysis Chart"></div>'
            except:
                pass
                
        msg_html += '</div>'
        body_content += msg_html
        
    body_content += f"<footer>© {datetime.now().year} DataPulse - 您的智能数据科学家助理</footer>"
    
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'>{style}</head><body>{body_content}</body></html>"


# --- API 路由 ---

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(data: Optional[SessionCreate] = None, current_user: dict = Depends(get_current_user)):
    """创建新会话"""
    user_id = current_user["id"]
    db_key = data.database_key if data else "classic_business"
    session_id = await session_db.create_session(user_id=user_id, title="", database_key=db_key)
    return {"id": session_id, "title": "", "database_key": db_key}

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

@router.patch("/{session_id}/modes")
async def update_session_modes(session_id: str, data: SessionModesUpdate, current_user: dict = Depends(get_current_user)):
    """更新会话的模式开关 (科学家、思考、知识库)"""
    user_id = current_user["id"]
    modes = data.dict(exclude_none=True)
    success = await session_db.update_session_modes(session_id, user_id, modes)
    if not success:
        raise HTTPException(status_code=404, detail="更新模式失败或无权限")
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
async def get_messages(session_id: str, all: bool = False, current_user: dict = Depends(get_current_user)):
    """获取会话的所有消息。all=true 返回所有分支，false 仅返回当前分支。"""
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权限")
    
    return await session_db.get_messages(session_id, all_branches=all)

@router.post("/{session_id}/activate_branch")
async def activate_branch(session_id: str, data: BranchActivationRequest, current_user: dict = Depends(get_current_user)):
    """激活指定的消息链分支"""
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    success = await session_db.activate_branch(session_id, data.message_ids)
    if not success:
        raise HTTPException(status_code=500, detail="激活分支失败")
    return {"success": True}

@router.get("/{session_id}/export")
async def export_session(
    session_id: str, 
    format: str = "txt", 
    current_user: dict = Depends(get_current_user)
):
    """导出整个会话对话内容 (V4.0 Playwright 增强版)"""
    user_id = current_user["id"]
    session = await session_db.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    messages = await session_db.get_messages(session_id)
    if not messages:
        raise HTTPException(status_code=404, detail="会话中没有消息")
    
    session_title = session.get("title") or "未命名分析会话"
    
    if format == "txt":
        content = f"会话标题: {session_title}\n导出时间: {datetime.now().isoformat()}\n" + "="*30 + "\n\n"
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
        content = f"# {session_title}\n\n*导出时间: {datetime.now().isoformat()}*\n\n---\n\n"
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
        from utils.logger import logger
        try:
            # 1. 构建 HTML
            html_content = build_session_html(session_title, messages)
            
            # 2. 调用 Playwright 渲染引擎
            pdf_path = await pdf_service.generate_report_pdf({
                "title": session_title,
                "html": html_content
            })
            
            if not pdf_path or not os.path.exists(pdf_path):
                raise Exception("Playwright 渲染 PDF 失败")
                
            return FileResponse(
                path=pdf_path,
                filename=f"DataPulse_Session_{session_id}.pdf",
                media_type="application/pdf"
            )
        except Exception as e:
            logger.error(f"❌ [PDF-Export] 会话导出失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"PDF 导出失败: {str(e)}")
    
    raise HTTPException(status_code=400, detail="不支持的导出格式")
