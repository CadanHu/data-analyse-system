"""
聊天路由 - 流式 HTTP 响应 (v3.0 异步任务版)
"""
import uuid
import json
import traceback
import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from models.message import ChatRequest
from database.session_db import SessionDB
from routers.auth_router import get_current_user
from agents.sql_agent import SQLAgent
from agents.memory_manager import get_memory_manager
from services.stream_service import StreamableHTTPService
from services.pdf_service import pdf_service
from utils.json_utils import json_dumps
import os
from pydantic import BaseModel

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

@router.post("/chat/generate_report")
async def generate_report(
    request: GenerateReportRequest, 
    background_tasks: BackgroundTasks, 
    current_user: dict = Depends(get_current_user)
):
    """手动触发生成深度看板报告 (异步任务版：支持切页面不中断 + 自动发现)"""
    from services.knowledge_extraction_service import knowledge_extraction_service
    from database.session_db import session_db
    from database.session_db import MessageModel
    from sqlalchemy import select
    
    print(f"🚀 [Report] 异步分析请求已接收 (ID: {request.message_id})")

    # 1. 立即标记为“正在处理”并持久化，确保前端刷新后能读到此状态
    async with session_db.async_session() as session:
        stmt = select(MessageModel).where(MessageModel.id == request.message_id)
        db_res = await session.execute(stmt)
        db_msg = db_res.scalar_one_or_none()
        
        if not db_msg:
            raise HTTPException(status_code=404, detail="消息不存在")
            
        existing_data = {}
        if db_msg.data:
            try:
                existing_data = json.loads(db_msg.data) if isinstance(db_msg.data, str) else db_msg.data
            except: pass
            
        existing_data["report_status"] = "processing"
        existing_data["can_generate_report"] = False 
        db_msg.data = json.dumps(existing_data, ensure_ascii=False)
        await session.commit()

    # 2. 定义后台执行逻辑
    async def run_analysis_task():
        mock_markdown = f"# 原始分析摘要\n\n{request.content}"
        try:
            # 耗时任务
            html_report = await knowledge_extraction_service.generate_visual_report(
                mock_markdown, 
                "请基于当前分析结果生成深度可视化看板"
            )
            
            async with session_db.async_session() as task_session:
                stmt = select(MessageModel).where(MessageModel.id == request.message_id)
                db_res = await task_session.execute(stmt)
                db_msg = db_res.scalar_one_or_none()
                
                if db_msg:
                    data = json.loads(db_msg.data) if isinstance(db_msg.data, str) else db_msg.data
                    if html_report.get("error"):
                        data["report_status"] = "failed"
                        data["report_error"] = html_report.get("summary")
                    else:
                        data["report_status"] = "success"
                        data["html_report"] = html_report
                    
                    usage = html_report.get("_usage", {"prompt_tokens": 0, "completion_tokens": 0})
                    db_msg.tokens_prompt = (db_msg.tokens_prompt or 0) + usage["prompt_tokens"]
                    db_msg.tokens_completion = (db_msg.tokens_completion or 0) + usage["completion_tokens"]
                    db_msg.data = json.dumps(data, ensure_ascii=False)
                    await task_session.commit()
                    print(f"✅ [Report] 异步后台分析完成 (ID: {request.message_id})")
        except Exception as e:
            print(f"❌ [Report] 异步执行失败: {str(e)}")
            try:
                async with session_db.async_session() as err_session:
                    stmt = select(MessageModel).where(MessageModel.id == request.message_id)
                    db_res = await err_session.execute(stmt)
                    db_msg = db_res.scalar_one_or_none()
                    if db_msg:
                        data = json.loads(db_msg.data) if isinstance(db_msg.data, str) else db_msg.data
                        data["report_status"] = "failed"
                        db_msg.data = json.dumps(data, ensure_ascii=False)
                        await err_session.commit()
            except: pass

    # 3. 提交任务
    background_tasks.add_task(run_analysis_task)
    return {"status": "processing"}

@router.post("/chat/export/pdf")
async def export_pdf(request: ExportPDFRequest, current_user: dict = Depends(get_current_user)):
    """导出报告为 PDF"""
    report_data = {"title": request.title, "summary": request.summary, "html": request.html}
    pdf_path = await pdf_service.generate_report_pdf(report_data)
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="PDF 生成失败")
    return FileResponse(path=pdf_path, filename=os.path.basename(pdf_path), media_type="application/pdf")

def get_sql_agent():
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = SQLAgent()
    return _sql_agent

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    session_db_inst = SessionDB()
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    from services.schema_service import SchemaService
    
    try:
        session = await session_db_inst.get_session(request.session_id, user_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        db_key = await session_db_inst.get_session_database(request.session_id)
        if db_key: SchemaService.set_database(db_key)

        # 保存用户消息
        user_message_id = str(uuid.uuid4())
        await session_db_inst.create_message({
            "id": user_message_id, "session_id": request.session_id, "parent_id": request.parent_id,
            "role": "user", "content": request.question, "created_at": datetime.now().isoformat()
        })
        await memory_manager.add_user_message(request.session_id, request.question)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    # RAG 检索
    rag_context = ""
    if request.enable_rag:
        try:
            from services.vector_store import VectorStore
            vs = VectorStore()
            agent = get_sql_agent()
            history_str = await memory_manager.get_history_text(request.session_id)
            search_query = await agent.rewrite_query_for_rag(request.question, history_str, provider=request.model_provider)
            search_results = await vs.search(search_query, top_k=8, session_id=request.session_id)
            if search_results:
                rag_context = "\n".join([f"- {r['content']}" for r in search_results])
        except: pass

    async def event_generator():
        assistant_message_id = str(uuid.uuid4())
        yield {"event": "thinking", "data": {"content": "正在启动 AI 引擎..."}}

        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_reasoning = ""
        assistant_data_obj = {}

        try:
            if rag_context:
                yield {"event": "rag_retrieval", "data": {"content": rag_context, "status": "completed"}}

            # --- 🚀 数据科学家模式 ---
            if request.enable_data_science_agent:
                from agents.advanced_data_agent import AdvancedDataAgent
                import pandas as pd
                from services.sql_executor import SQLExecutor
                from services.schema_service import SchemaService
                
                data_map = {}
                tables = await SchemaService.get_table_names()
                active_tables = [t for t in tables if t in ['orders', 'products', 'customers']] or tables[:3]
                for table in active_tables:
                    db_data = await SQLExecutor.execute_sql(f"SELECT * FROM `{table}` LIMIT 10000")
                    import decimal
                    cleaned_rows = [{k: (float(v) if isinstance(v, decimal.Decimal) else v) for k, v in row.items()} for row in db_data["rows"]]
                    data_map[f"df_{table}"] = pd.DataFrame(cleaned_rows)
                
                ds_agent = AdvancedDataAgent(provider=request.model_provider, model_name=request.model_name)
                
                # 自动生成标题
                new_title = await ds_agent.generate_ai_title(request.question)
                from database.session_db import session_db
                await session_db.update_session_title(request.session_id, user_id, new_title)

                full_summary = ""
                full_code = ""
                full_chart_cfg = ""
                full_plot_image = ""
                
                async for event in ds_agent.process_analysis_flow(data_map, request.question, history=await memory_manager.get_history(request.session_id)):
                    event_type = event.get("event")
                    if event_type == "plot_ready": full_plot_image = event["data"].get("image", "")
                    elif event_type == "summary": full_summary += event["data"].get("content", "")
                    elif event_type == "chart_ready": full_chart_cfg = json.dumps(event["data"].get("option", {}), ensure_ascii=False)
                    elif event_type == "done":
                        full_code = event["data"].get("code", "")
                        assistant_data_obj = event["data"].get("result", {})
                    yield event

                # 保存消息并发送 ID 同步信号
                assistant_data_final = {"result": assistant_data_obj, "plot_image_base64": full_plot_image, "is_data_science": True}
                from database.session_db import session_db
                await session_db.create_message({
                    "id": assistant_message_id, "session_id": request.session_id, "parent_id": user_message_id,
                    "role": "assistant", "content": full_summary, "sql": full_code, 
                    "chart_cfg": full_chart_cfg, "data": json.dumps(assistant_data_final, ensure_ascii=False)
                })
                yield {"event": "done", "data": {"message_id": assistant_message_id, "user_message_id": user_message_id, "session_title": new_title}}
                return

            # --- 🚀 传统 SQL 模式 ---
            agent = get_sql_agent()
            history_str = await memory_manager.get_history_text(request.session_id)
            async for event in agent.process_question_with_history(request.question, history_str, knowledge_context=rag_context, enable_thinking=request.enable_thinking, provider=request.model_provider):
                if event["event"] == "model_thinking": assistant_reasoning += event["data"].get("content", "")
                elif event["event"] == "sql_generated": assistant_sql = event["data"].get("sql", "")
                elif event["event"] == "sql_result": assistant_data_obj = event["data"]
                elif event["event"] == "chart_ready": assistant_chart_cfg = json.dumps(event["data"].get("option", {}))
                elif event["event"] == "summary": assistant_content += event["data"].get("content", "")
                elif event["event"] == "done":
                    # 自动标题
                    new_title = await agent.generate_ai_title(request.question, provider=request.model_provider)
                    from database.session_db import session_db
                    await session_db.update_session_title(request.session_id, user_id, new_title)
                    
                    data_payload = assistant_data_obj
                    if event["data"].get("can_generate_report"): data_payload["can_generate_report"] = True
                    
                    await session_db.create_message({
                        "id": assistant_message_id, "session_id": request.session_id, "parent_id": user_message_id,
                        "role": "assistant", "content": assistant_content, "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg, "thinking": assistant_reasoning,
                        "data": json.dumps(data_payload, ensure_ascii=False)
                    })
                    event["data"]["message_id"] = assistant_message_id
                    event["data"]["user_message_id"] = user_message_id
                    event["data"]["session_title"] = new_title
                yield event

        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"message": str(e)}}

    return StreamingResponse(StreamableHTTPService.generate_stream(event_generator()), media_type="application/json")

@router.get("/schema")
async def get_schema():
    from services.schema_service import SchemaService
    return {"tables": await SchemaService.get_table_names(), "schema": await SchemaService.get_full_schema()}
