"""
聊天路由 - 流式 HTTP 响应 (v4.0 物理隔离版)
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
from sqlalchemy import select

# 项目内导入
from models.message import ChatRequest
from database.session_db import SessionDB, session_db, SessionModel
from routers.auth_router import get_current_user
from agents.sql_agent import SQLAgent
from agents.memory_manager import get_memory_manager
from services.stream_service import StreamableHTTPService
from services.pdf_service import pdf_service
from services.user_context import set_user_api_keys
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

# ==================== 0. 辅助函数 (Helpers) ====================

async def _handle_session_auto_title(session_id: str, user_id: int, question: str, agent_instance, language: str, provider: str = None, model_name: str = None):
    """
    [Shared Helper] 异步生成并更新会话标题
    逻辑：仅当会话标题为空或为默认占位符时，触发 AI 生成新标题。
    """
    try:
        async with session_db.async_session() as session:
            # 1. 检查当前标题
            result = await session.execute(
                select(SessionModel.title).where(SessionModel.id == session_id)
            )
            current_title = result.scalar_one_or_none()

            # 2. 如果标题为空，则由 AI 生成新标题
            if not current_title or current_title.strip() == "":
                new_title = await agent_instance.generate_ai_title(question, provider=provider, model_name=model_name, language=language)
                if new_title:
                    await session_db.update_session_title(session_id, user_id, new_title)
                    print(f"✅ [Auto-Rename] 会话 {session_id[:8]} 已自动重命名: {new_title}")
    except Exception as e:
        print(f"⚠️ [Auto-Rename] 自动生成标题失败: {e}")

# ==================== 1. 物理隔离处理器 (Processors) ====================

async def run_scientist_mode(request: ChatRequest, current_user: dict):
    """
    科学家模式处理器 (Scientist Processor)
    规格：执行 Python 数据科学分析，严禁采集思考过程 (Thinking Isolation)
    """
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    
    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Starting Scientist Engine (正在启动科学家引擎)..."}}
        
        assistant_content = ""
        assistant_sql = "" # 存放代码
        assistant_chart_cfg = ""
        assistant_data_obj = {}
        # 🌟 核心隔离：科学家模式强制不采集 reasoning
        assistant_reasoning = "" 

        try:
            # 保存用户消息
            await session_db.create_message({
                "id": user_message_id, 
                "session_id": request.session_id, 
                "user_id": user_id,
                "role": "user", 
                "content": request.question,
                "parent_id": request.parent_id
            })

            # 准备数据
            import pandas as pd
            df_to_analyze = request.external_data
            if not df_to_analyze:
                try:
                    from database.session_db import MessageModel
                    from sqlalchemy import select
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
                except: df_to_analyze = pd.DataFrame()
            elif isinstance(df_to_analyze, list):
                df_to_analyze = pd.DataFrame(df_to_analyze)

            from agents.advanced_data_agent import AdvancedDataAgent
            agent_instance = AdvancedDataAgent()
            
            # 执行流
            async for event in agent_instance.process_analysis_flow(
                df_input=df_to_analyze, 
                question=request.question, 
                history=await memory_manager.get_history(request.session_id),
                language=request.language
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "chart_ready": assistant_chart_cfg = json_dumps(event_data.get("option", {}))
                elif event_type == "execution_result": 
                    assistant_data_obj = event_data
                    assistant_sql = event_data.get("code", "")
                
                # 转发事件 (过滤掉 model_thinking，虽然 Agent 此时不应产出)
                if event_type not in ["done", "model_thinking"]:
                    yield event
                elif event_type == "done":
                    # 保存 Assistant 消息
                    data_payload = assistant_data_obj
                    if event_data.get("can_generate_report"): data_payload["can_generate_report"] = True
                    
                    await session_db.create_message({
                        "id": assistant_message_id, 
                        "session_id": request.session_id, 
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant", 
                        "content": assistant_content, 
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg, 
                        "thinking": "", # 🌟 科学家模式强制隔离：不采集思考过程
                        "data": json_dumps(data_payload)
                    })
                    
                    yield {
                        "event": "done", 
                        "data": {
                            "message_id": assistant_message_id, 
                            "user_message_id": user_message_id, 
                            "session_title": (request.question or "New Analysis")[:50]
                        }
                    }
                    
                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))

        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"Scientist Mode Error: {str(e)}"}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="text/event-stream")


async def run_thinking_mode(request: ChatRequest, current_user: dict):
    """
    思考模式处理器 (Thinking Processor)
    规格：深度推理 SQL 生成，必须完整捕获并存储思维链 (Reasoning Capture)
    """
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    agent_instance = get_sql_agent()

    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Engaging Deep Reasoning (正在开启深度推理)..."}}

        assistant_content = ""
        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_reasoning = ""
        assistant_data_obj = {}

        try:
            await session_db.create_message({
                "id": user_message_id,
                "session_id": request.session_id,
                "user_id": user_id,
                "role": "user",
                "content": request.question,
                "parent_id": request.parent_id
            })
            print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}，session={request.session_id[:8]}")

            history_str = await memory_manager.get_history_text(request.session_id)
            
            async for event in agent_instance.process_question_with_history(
                request.question, history_str, 
                enable_thinking=True, # 强制开启
                provider=request.model_provider,
                model_name=request.model_name,
                language=request.language
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "sql_generated": assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result": assistant_data_obj = event_data
                elif event_type == "chart_ready": assistant_chart_cfg = json_dumps(event_data.get("option", {}))

                if event_type != "done":
                    yield event
                else:
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_reasoning,
                        "data": json_dumps(assistant_data_obj)
                    })
                    print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}")
                    print(f"💾 [DB] 助手消息已存储 → messages.id={assistant_message_id[:8]}，thinking={len(assistant_reasoning)}字，content={len(assistant_content)}字")
                    yield {
                        "event": "done",
                        "data": {
                            "message_id": assistant_message_id,
                            "user_message_id": user_message_id,
                            "session_title": (request.question or "Deep Analysis")[:50]
                        }
                    }

                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"Thinking Mode Error: {str(e)}"}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="text/event-stream")


async def run_rag_mode(request: ChatRequest, current_user: dict):
    """
    RAG 模式处理器 (RAG Processor)
    规格：结合向量数据库检索结果进行回答
    """
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    agent_instance = get_sql_agent()

    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Retrieving Context (正在检索相关知识)..."}}
        
        # 1. 执行 RAG 检索
        rag_context = ""
        try:
            from services.vector_store import VectorStore
            vs = VectorStore()
            history_str = await memory_manager.get_history_text(request.session_id)
            search_query = await agent_instance.rewrite_query_for_rag(request.question, history_str, language=request.language)
            # global 模式不传 session_id，检索当前用户全部会话的知识
            search_session_id = None if request.rag_scope == "global" else request.session_id
            search_results = await vs.search(search_query, top_k=4, session_id=search_session_id)
            if search_results:
                # 每条片段最多保留 600 字符，总 RAG 内容不超过 3000 字符，避免 prompt 过长超时
                MAX_CHUNK = 600
                MAX_TOTAL = 3000
                parts = []
                total = 0
                for r in search_results:
                    chunk = r['content'][:MAX_CHUNK]
                    if total + len(chunk) > MAX_TOTAL:
                        break
                    parts.append(f"- {chunk}")
                    total += len(chunk)
                rag_context = "\n".join(parts)
                yield {"event": "thinking", "data": {"content": f"Found {len(parts)} related snippets (已检索到 {len(parts)} 条相关背景)."}}
        except Exception as re:
            print(f"⚠️ [RAG] Retrieval failed: {re}")

        assistant_content = ""
        assistant_reasoning = ""

        try:
            await session_db.create_message({
                "id": user_message_id, 
                "session_id": request.session_id, 
                "user_id": user_id,
                "role": "user", 
                "content": request.question,
                "parent_id": request.parent_id
            })

            history_str = await memory_manager.get_history_text(request.session_id)
            
            async for event in agent_instance.process_question_with_history(
                request.question, history_str, 
                knowledge_context=rag_context, # 注入 RAG 背景
                enable_thinking=request.enable_thinking,
                language=request.language
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "summary": assistant_content += event_data.get("content", "")

                if event_type != "done":
                    yield event
                else:
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "thinking": assistant_reasoning,
                        "data": json_dumps(event_data)
                    })
                    yield {
                        "event": "done", 
                        "data": {
                            "message_id": assistant_message_id, 
                            "user_message_id": user_message_id,
                            "session_title": (request.question or "Knowledge Base")[:50]
                        }
                    }
                    
                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"RAG Mode Error: {str(e)}"}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="text/event-stream")


async def run_depth_mode(request: ChatRequest, current_user: dict):
    """
    深度模式处理器 (Depth Processor)
    规格：针对复杂任务进行多步分析 (当前通过强化 Prompt 的 SQLAgent 实现，后续可接入 LangGraph)
    """
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    agent_instance = get_sql_agent()

    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Initializing Deep Analysis (正在初始化深度分析逻辑)..."}}
        
        assistant_content = ""
        assistant_sql = ""
        assistant_reasoning = ""
        assistant_data_obj = {}

        try:
            await session_db.create_message({
                "id": user_message_id, 
                "session_id": request.session_id, 
                "user_id": user_id,
                "role": "user", 
                "content": request.question,
                "parent_id": request.parent_id
            })

            history_str = await memory_manager.get_history_text(request.session_id)
            
            # 深度模式：强制使用推理模型并注入深度分析指令
            async for event in agent_instance.process_question_with_history(
                f"【深度分析指令】请针对该问题进行多维度建模。用户问题：{request.question}", 
                history_str, 
                enable_thinking=True, 
                language=request.language
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "sql_generated": assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result": assistant_data_obj = event_data

                if event_type != "done":
                    yield event
                else:
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "thinking": assistant_reasoning,
                        "data": json_dumps(assistant_data_obj)
                    })
                    yield {
                        "event": "done",
                        "data": {
                            "message_id": assistant_message_id,
                            "user_message_id": user_message_id,
                            "session_title": (request.question or "Depth Analysis")[:50]
                        }
                    }
                    
                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"Depth Mode Error: {str(e)}"}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="text/event-stream")

async def run_standard_mode(request: ChatRequest, current_user: dict):
    """
    标准模式处理器 (Standard Processor)
    规格：普通 SQL 查询与简单对话
    """
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    agent_instance = get_sql_agent()

    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Starting (正在启动)..."}}
        
        assistant_content = ""
        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_reasoning = ""
        assistant_data_obj = {}

        try:
            await session_db.create_message({
                "id": user_message_id,
                "session_id": request.session_id,
                "user_id": user_id,
                "role": "user",
                "content": request.question,
                "parent_id": request.parent_id
            })
            print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}，session={request.session_id[:8]}")

            history_str = await memory_manager.get_history_text(request.session_id)

            async for event in agent_instance.process_question_with_history(
                request.question, history_str,
                enable_thinking=request.enable_thinking,
                provider=request.model_provider,
                model_name=request.model_name,
                language=request.language
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "sql_generated": assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result": assistant_data_obj = event_data
                elif event_type == "chart_ready": assistant_chart_cfg = json_dumps(event_data.get("option", {}))

                if event_type != "done":
                    yield event
                else:
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "user_id": user_id,
                        "parent_id": user_message_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_reasoning,
                        "data": json_dumps(assistant_data_obj)
                    })
                    print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}")
                    print(f"💾 [DB] 助手消息已存储 → messages.id={assistant_message_id[:8]}，sql={'有' if assistant_sql else '无'}，content={len(assistant_content)}字")
                    yield {
                        "event": "done",
                        "data": {
                            "message_id": assistant_message_id,
                            "user_message_id": user_message_id,
                            "session_title": (request.question or "New Chat")[:50]
                        }
                    }

                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"content": f"Standard Mode Error: {str(e)}"}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="text/event-stream")


# ==================== 2. 路由主入口 (Router) ====================

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
    """手动触发生成深度看板报告"""
    from services.knowledge_extraction_service import knowledge_extraction_service
    from database.session_db import MessageModel
    from sqlalchemy import select
    
    print(f"🚀 [Report] 异步分析请求已接收 (ID: {request.message_id})")

    async with session_db.async_session() as session:
        result = await session.execute(select(MessageModel).where(MessageModel.id == request.message_id))
        msg = result.scalar_one_or_none()
        if msg:
            data_obj = {}
            if msg.data:
                try: data_obj = json.loads(msg.data)
                except: pass
            
            data_obj["report_status"] = "processing"
            data_obj["can_generate_report"] = False 
            msg.data = json_dumps(data_obj)
            await session.commit()

    background_tasks.add_task(
        knowledge_extraction_service.analyze_and_generate_report,
        request.message_id,
        request.content,
        request.session_id
    )
    
    return {"status": "processing", "message": "Report generation task started"}

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    """
    多模式分发入口 (Multi-mode Dispatcher)
    """
    user_id = current_user["id"]

    # 🔑 1. 从 Session 中读取用户选择的模型 (前端传来的优先，Session 存储作兜底)
    if not request.model_provider:
        session_info = await session_db.get_session(request.session_id, user_id)
        if session_info:
            request.model_provider = session_info.get("model_provider")
            if not request.model_name:
                request.model_name = session_info.get("model_name")

    # 🔑 2. 查询用户存储的 API Key，注入到 ContextVar (LLMFactory 会自动读取)
    # 如果 session 没有配置 provider，自动使用用户最近配置的 API Key 对应的 provider
    provider = request.model_provider
    if not provider:
        all_keys = await session_db.get_all_api_keys(user_id)
        if all_keys:
            sorted_keys = sorted(all_keys, key=lambda k: k.get("updated_at") or "", reverse=True)
            provider = sorted_keys[0]["provider"]
            request.model_provider = provider
            if not request.model_name and sorted_keys[0].get("model_name"):
                request.model_name = sorted_keys[0]["model_name"]
            print(f"🔑 [ChatStream] 用户 {user_id} 未配置会话 provider，自动使用最近配置的: {provider}")
    provider = provider or "deepseek"
    user_key_record = await session_db.get_api_key(user_id, provider)
    if user_key_record:
        ctx_keys = {
            f"{provider}_api_key": user_key_record["api_key"],
        }
        if user_key_record.get("base_url"):
            ctx_keys[f"{provider}_base_url"] = user_key_record["base_url"]
        # 如果用户没有指定 model_name，使用其为该供应商存储的默认 model_name
        if not request.model_name and user_key_record.get("model_name"):
            request.model_name = user_key_record["model_name"]
        set_user_api_keys(ctx_keys)
        print(f"🔑 [ChatStream] 已为用户 {user_id} 注入 {provider} 自定义 API Key")

    # 🌟 3. 核心分发逻辑
    if request.enable_data_science_agent:
        return await run_scientist_mode(request, current_user)
    elif request.enable_depth:
        return await run_depth_mode(request, current_user)
    elif request.enable_rag:
        return await run_rag_mode(request, current_user)
    elif request.enable_thinking:
        return await run_thinking_mode(request, current_user)
    else:
        return await run_standard_mode(request, current_user)
