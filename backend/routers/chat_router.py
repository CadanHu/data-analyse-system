"""
聊天路由 - 流式 HTTP 响应 (v3.0 异步任务版)
"""
import uuid
import json
import traceback
import asyncio
import os
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse

# 项目内导入
from models.message import ChatRequest
from database.session_db import SessionDB, session_db
from routers.auth_router import get_current_user
from agents.sql_agent import SQLAgent
from agents.memory_manager import get_memory_manager
from services.stream_service import StreamableHTTPService
from services.pdf_service import pdf_service
from utils.json_utils import json_dumps

class ExportPDFRequest(BaseModel):
    title: str
    summary: str
    html: str

class GenerateReportRequest(BaseModel):
    message_id: str
    content: str
    session_id: str

router = APIRouter()
_sql_agent = None

def get_sql_agent():
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = SQLAgent()
    return _sql_agent

@router.post("/chat/generate_report")
async def generate_report(
    request: GenerateReportRequest, 
    background_tasks: BackgroundTasks, 
    current_user: dict = Depends(get_current_user)
):
    """手动触发生成深度看板报告 / Manually trigger deep dashboard report generation"""
    from services.knowledge_extraction_service import knowledge_extraction_service
    from database.session_db import MessageModel
    from sqlalchemy import select
    
    print(f"🚀 [Report] 异步分析请求已接收 / Async report request received (ID: {request.message_id})")

    async with session_db.async_session() as session:
        result = await session.execute(select(MessageModel).where(MessageModel.id == request.message_id))
        msg = result.scalar_one_or_none()
        if msg:
            msg.report_status = "processing"
            msg.can_generate_report = False
            await session.commit()

    background_tasks.add_task(
        knowledge_extraction_service.analyze_and_generate_report,
        request.message_id,
        request.content,
        request.session_id
    )
    
    return {"status": "processing", "message": "Report generation task started (报告生成任务已启动)"}

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    
    # 🌟 核心修复点 1: 在生成器外部生成固定 ID，防止重试或循环导致 ID 漂移
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    
    # 🌟 核心修复点 2: 严格确定 parent_id 逻辑
    # 如果用户是从历史分支提问，使用指定的 parent_id；否则不指定。
    effective_parent_id = request.parent_id

    # RAG 检索上下文 (可选)
    rag_context = ""
    if request.enable_rag:
        try:
            from services.vector_store import VectorStore
            vs = VectorStore()
            agent = get_sql_agent()
            history_str = await memory_manager.get_history_text(request.session_id)
            search_query = await agent.rewrite_query_for_rag(request.question, history_str, provider=request.model_provider, language=request.language)
            search_results = await vs.search(search_query, top_k=8, session_id=request.session_id)
            if search_results:
                rag_context = "\n".join([f"- {r['content']}" for r in search_results])
        except: pass

    async def event_generator():
        # 初始状态
        yield {"event": "thinking", "data": {"content": "Starting AI Engine (正在启动 AI 引擎)..."}}

        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_reasoning = ""
        assistant_data_obj = {}

        try:
            # 1. 保存用户消息到数据库
            await session_db.create_message({
                "id": user_message_id, 
                "session_id": request.session_id, 
                "user_id": user_id,
                "role": "user", 
                "content": request.question,
                "parent_id": effective_parent_id
            })

            # 2. 模式分发执行 AI 逻辑
            if request.enable_data_science:
                from agents.advanced_data_agent import AdvancedDataAgent
                agent_instance = AdvancedDataAgent()
                process_iter = agent_instance.process_analysis_flow(
                    df_input=request.external_data, 
                    question=request.question, 
                    history=request.history,
                    language=request.language
                )
            else:
                agent_instance = get_sql_agent()
                history_str = await memory_manager.get_history_text(request.session_id)
                process_iter = agent_instance.process_question_with_history(
                    request.question, history_str, 
                    knowledge_context=rag_context, 
                    enable_thinking=request.enable_thinking, 
                    provider=request.model_provider,
                    model_name=request.model_name,
                    language=request.language
                )

            # 3. 循环吐出 AI 事件
            async for event in process_iter:
                event_type = event["event"]
                event_data = event.get("data", {})

                # 累积状态
                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "sql_generated": assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result": assistant_data_obj = event_data
                elif event_type == "chart_ready": assistant_chart_cfg = json_dumps(event_data.get("option", {}))
                elif event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "summary_ready": assistant_content += event_data.get("content", "")
                elif event_type == "code_generated": assistant_sql = event_data.get("code", "")
                elif event_type == "execution_result": assistant_data_obj = event_data

                # 🌟 必须 Yield 转发给前端，否则页面不会更新
                if event_type != "done":
                    yield event
                else:
                    # 4. 当 AI 完成后，执行持久化
                    new_title = await agent_instance.generate_ai_title(request.question, provider=request.model_provider, model_name=request.model_name, language=request.language)
                    await session_db.update_session_title(request.session_id, user_id, new_title)
                    
                    # 组合最终数据负载
                    data_payload = assistant_data_obj
                    if event_data.get("can_generate_report"): 
                        data_payload["can_generate_report"] = True
                    
                    # 保存 Assistant 消息
                    await session_db.create_message({
                        "id": assistant_message_id, 
                        "session_id": request.session_id, 
                        "user_id": user_id, # 确保绑定用户
                        "parent_id": user_message_id, # Assistant 的父级必然是这条提问
                        "role": "assistant", 
                        "content": assistant_content, 
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg, 
                        "reasoning": assistant_reasoning,
                        "data": json_dumps(data_payload)
                    })
                    
                    # 发送最终 done 事件给前端
                    yield {
                        "event": "done", 
                        "data": {
                            "message_id": assistant_message_id, 
                            "user_message_id": user_message_id, 
                            "session_title": new_title
                        }
                    }

        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"System Internal Error (系统内部错误): {str(e)}"}}

    return StreamingResponse(
        StreamableHTTPService.generate_stream(event_generator()), 
        media_type="text/event-stream",
        headers=StreamableHTTPService.get_response_headers()
    )
