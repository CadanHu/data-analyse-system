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

@router.post("/chat/export/pdf")
async def export_chat_pdf(
    request: ExportPDFRequest,
    current_user: dict = Depends(get_current_user)
):
    """导出单个分析报告为 PDF"""
    from utils.logger import logger
    try:
        report_data = {
            "title": request.title,
            "summary": request.summary,
            "html": request.html
        }
        pdf_path = await pdf_service.generate_report_pdf(report_data)
        if not pdf_path or not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="生成 PDF 失败")
        
        return FileResponse(
            path=pdf_path,
            filename=os.path.basename(pdf_path),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={os.path.basename(pdf_path)}"}
        )
    except Exception as e:
        logger.error(f"❌ [PDF Export Endpoint] 导出失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
            # 🚀 核心修复：不能直接设置不存在的列，必须更新 data JSON
            data_obj = {}
            if msg.data:
                try: data_obj = json.loads(msg.data)
                except: pass
            
            data_obj["report_status"] = "processing"
            data_obj["can_generate_report"] = False # 防止重复点击
            msg.data = json_dumps(data_obj)
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
            if request.enable_data_science_agent:
                import pandas as pd
                df_to_analyze = request.external_data
                if not df_to_analyze:
                    try:
                        from database.session_db import MessageModel
                        from sqlalchemy import select
                        import json
                        last_data = []
                        async with session_db.async_session() as session:
                            res = await session.execute(
                                select(MessageModel)
                                .where(MessageModel.session_id == request.session_id)
                                .where(MessageModel.role == 'assistant')
                                .order_by(MessageModel.created_at.desc())
                                .limit(5)
                            )
                            for msg in res.scalars():
                                if msg.data:
                                    try:
                                        parsed = json.loads(msg.data)
                                        if "rows" in parsed and parsed["rows"]:
                                            last_data = parsed["rows"]
                                            break
                                    except: pass
                        df_to_analyze = pd.DataFrame(last_data)
                    except Exception as e:
                        df_to_analyze = pd.DataFrame()
                elif isinstance(df_to_analyze, list):
                    df_to_analyze = pd.DataFrame(df_to_analyze)

                from agents.advanced_data_agent import AdvancedDataAgent
                agent_instance = AdvancedDataAgent()
                process_iter = agent_instance.process_analysis_flow(
                    df_input=df_to_analyze, 
                    question=request.question, 
                    history=await memory_manager.get_history(request.session_id),
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
                    # 4. 先保存消息（不含 title），再立即发送 done 事件给前端
                    data_payload = assistant_data_obj
                    if event_data.get("can_generate_report"): 
                        data_payload["can_generate_report"] = True
                    
                    # 保存 Assistant 消息
                    await session_db.create_message({
                        "id": assistant_message_id, 
                        "session_id": request.session_id, 
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant", 
                        "content": assistant_content, 
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg, 
                        "reasoning": assistant_reasoning,
                        "data": json_dumps(data_payload)
                    })
                    
                    # 🚀 关键修复：立即发送 done 事件，不等待 title 生成
                    # title 生成可能耗时 20-30s，在 done 之前等待会导致 Docker 网络层超时后
                    # 触发 GeneratorExit，整个 SSE 流崩溃
                    yield {
                        "event": "done", 
                        "data": {
                            "message_id": assistant_message_id, 
                            "user_message_id": user_message_id, 
                            "session_title": (request.question or "New Chat")[:50]  # 先用问题本身占位
                        }
                    }
                    
                    # 🚀 Title 生成作为后台任务，完全不阻塞 SSE 流
                    async def _update_title_bg():
                        try:
                            new_title = await agent_instance.generate_ai_title(
                                request.question,
                                provider=request.model_provider,
                                model_name=request.model_name,
                                language=request.language
                            )
                            new_title = (new_title or request.question or "New Chat")[:100]
                            await session_db.update_session_title(request.session_id, user_id, new_title)
                            print(f"✅ [Title-BG] 标题已更新: {new_title}")
                        except Exception as te:
                            print(f"⚠️ [Title-BG] 标题更新失败 (非致命): {te}")
                    
                    import asyncio
                    asyncio.create_task(_update_title_bg())

        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"System Internal Error (系统内部错误): {str(e)}"}}

    return StreamingResponse(
        StreamableHTTPService.generate_stream(event_generator()), 
        media_type="text/event-stream",
        headers=StreamableHTTPService.get_response_headers()
    )
