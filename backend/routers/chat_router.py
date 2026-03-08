"""
聊天路由 - 流式 HTTP 响应 (日志增强版)
"""
import uuid
import json
import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
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
async def generate_report(request: GenerateReportRequest, current_user: dict = Depends(get_current_user)):
    """手动触发生成深度看板报告"""
    from services.knowledge_extraction_service import knowledge_extraction_service
    from database.session_db import session_db
    from database.session_db import MessageModel
    from sqlalchemy import update, select
    
    print(f"🚀 [Report] 用户请求手动生成看板: {request.message_id}")
    
    # 1. 调用核心生成引擎
    mock_markdown = f"# 原始分析摘要\n\n{request.content}"
    try:
        html_report = await knowledge_extraction_service.generate_visual_report(mock_markdown, "请基于当前分析结果生成深度可视化看板")
        
        # 🚀 关键改进：如果服务层标记了错误，不持久化，直接报错
        if html_report.get("error"):
            print(f"❌ [Report] 生成引擎返回错误，中止持久化: {html_report.get('summary')}")
            raise Exception(html_report.get("summary"))

        # 2. 使用更严谨的合并策略持久化到数据库
        async with session_db.async_session() as session:
            # 先查出原始数据
            stmt = select(MessageModel).where(MessageModel.id == request.message_id)
            db_res = await session.execute(stmt)
            db_msg = db_res.scalar_one_or_none()
            
            if db_msg:
                # 合并 JSON
                existing_data = {}
                if db_msg.data:
                    try:
                        existing_data = json.loads(db_msg.data) if isinstance(db_msg.data, str) else db_msg.data
                    except: pass
                
                # 更新字段
                existing_data["html_report"] = html_report
                existing_data["can_generate_report"] = False # 生成后标记为已完成
                
                # 提取 Token
                usage = html_report.get("_usage", {"prompt_tokens": 0, "completion_tokens": 0})
                
                db_msg.data = json.dumps(existing_data, ensure_ascii=False)
                db_msg.tokens_prompt = (db_msg.tokens_prompt or 0) + usage["prompt_tokens"]
                db_msg.tokens_completion = (db_msg.tokens_completion or 0) + usage["completion_tokens"]
                
                await session.commit()
                print(f"✅ [Report] 数据库持久化成功 (ID: {request.message_id})")
            else:
                print(f"⚠️ [Report] 数据库找不到消息 ID: {request.message_id}")

        return {"status": "success", "html_report": html_report}
    except Exception as e:
        print(f"❌ [Report] 手动生成失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/export/pdf")
async def export_pdf(request: ExportPDFRequest, current_user: dict = Depends(get_current_user)):
    """导出深度分析报告为 PDF"""
    print(f"📡 [PDF] 正在为用户 {current_user.get('username')} 生成离线报告: {request.title}")
    
    report_data = {
        "title": request.title,
        "summary": request.summary,
        "html": request.html
    }
    
    pdf_path = await pdf_service.generate_report_pdf(report_data)
    
    if not pdf_path or not os.path.exists(pdf_path):
        print("❌ [PDF] 生成报告失败")
        raise HTTPException(status_code=500, detail="PDF 生成失败")
        
    print(f"✅ [PDF] 报告已就绪: {os.path.basename(pdf_path)}")
    return FileResponse(
        path=pdf_path,
        filename=os.path.basename(pdf_path),
        media_type="application/pdf"
    )

def get_sql_agent():
    global _sql_agent
    if _sql_agent is None:
        print("🤖 [Agent] 正在初始化 SQLAgent...")
        _sql_agent = SQLAgent()
        print("✅ [Agent] SQLAgent 初始化完成")
    return _sql_agent

def generate_session_title(question: str) -> str:
    max_length = 30
    return question[:max_length] if len(question) <= max_length else question[:max_length] + "..."

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    print(f"\n📥 [收到请求] ========================================")
    print(f"📥 [用户]: {current_user.get('username')} (ID: {current_user.get('id')})")
    print(f"📥 [会话]: {request.session_id}")
    print(f"📥 [问题]: {request.question}")
    print(f"📥 [选项]: RAG={request.enable_rag}, 思考={request.enable_thinking}")
    
    session_db_inst = SessionDB()
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    from services.schema_service import SchemaService
    
    try:
        print("📂 [会话] 正在从数据库加载会话信息...")
        session = await session_db_inst.get_session(request.session_id, user_id)
        if not session:
            print(f"❌ [会话] 找不到会话: {request.session_id}")
            raise HTTPException(status_code=404, detail="会话不存在")
        print(f"📂 [会话] 加载成功: {session.get('title')}")

        # 设置数据库 Schema
        db_key = await session_db_inst.get_session_database(request.session_id)
        if db_key:
            print(f"🎯 [数据库] 切换至会话指定库: {db_key}")
            SchemaService.set_database(db_key)

        # 保存用户消息
        print("💾 [数据库] 正在保存用户提问...")
        user_message_id = str(uuid.uuid4())
        await session_db_inst.create_message({
            "id": user_message_id,
            "session_id": request.session_id,
            "parent_id": request.parent_id,
            "role": "user",
            "content": request.question,
            "created_at": datetime.now().isoformat()
        })
        await memory_manager.add_user_message(request.session_id, request.question)
        print(f"✅ [数据库] 用户消息保存成功 (ID: {user_message_id})")

    except Exception as e:
        print(f"❌ [请求阶段错误]: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    # --- RAG 检索逻辑 ---
    rag_context = ""
    if request.enable_rag:
        print("\n🔍 [RAG] 知识库模式已开启，开始检索...")
        try:
            from services.vector_store import VectorStore
            vs = VectorStore()
            search_results = await vs.search(request.question, top_k=3, session_id=request.session_id)
            if search_results:
                rag_context = "\n\n【参考知识库内容】:\n" + "\n".join([f"- {r['content']}" for r in search_results])
                print(f"✅ [RAG] 检索成功，获取到 {len(search_results)} 条片段")
            else:
                print("⚠️ [RAG] 知识库检索结果为空")
        except Exception as e:
            print(f"❌ [RAG] 检索出错: {str(e)}")

    async def event_generator():
        assistant_message_id = str(uuid.uuid4())
        print(f"🚀 [处理] 启动事件生成器，助手消息 ID: {assistant_message_id}")
        
        yield {"event": "thinking", "data": {"content": "正在启动 AI 引擎..."}}

        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_reasoning = ""
        assistant_data = ""

        try:
            if rag_context:
                yield {"event": "rag_retrieval", "data": {"content": rag_context, "status": "completed"}}

            print("🤖 [Agent] 正在调用 AI 模型处理...")
            agent = get_sql_agent()
            final_question = request.question + rag_context
            history_str = await memory_manager.get_history_text(request.session_id)
            
            async for event in agent.process_question_with_history(final_question, history_str, request.enable_thinking):
                event_type = event.get("event")
                event_data = event.get("data", {})

                if event_type == "model_thinking":
                    assistant_reasoning += event_data.get("content", "")
                elif event_type == "sql_generated":
                    assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result":
                    assistant_data = json_dumps(event_data)
                elif event_type == "chart_ready":
                    assistant_chart_cfg = json_dumps(event_data.get("option", {}))
                elif event_type == "summary":
                    assistant_content += event_data.get("content", "")
                elif event_type == "done":
                    assistant_content = event_data.get("summary", assistant_content)
                    
                    # AI 智能生成标题
                    current_title = session.get("title", "")
                    if current_title.startswith("新会话") or not current_title:
                        new_title = await agent.generate_ai_title(request.question)
                        from database.session_db import session_db
                        await session_db.update_session_title(request.session_id, user_id, new_title)
                        event_data["session_title"] = new_title 

                    # 合并数据
                    final_data_payload = {}
                    try:
                        if assistant_data:
                            final_data_payload = json.loads(assistant_data)
                    except: pass
                    
                    if "html_report" in event_data:
                        final_data_payload["html_report"] = event_data["html_report"]
                    
                    # 关键：确保 can_generate_report 标志也存入数据库，以便刷新后按钮还在
                    if event_data.get("can_generate_report"):
                        final_data_payload["can_generate_report"] = True

                    assistant_data_json = json_dumps(final_data_payload)

                    # 保存消息
                    from database.session_db import session_db
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "parent_id": user_message_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_reasoning,
                        "data": assistant_data_json,
                        "created_at": datetime.now().isoformat()
                    })
                    await memory_manager.add_assistant_message(request.session_id, assistant_content)
                    await session_db.update_session_updated_at(request.session_id)

                    # 🚀 传回真实的数据库 ID，确保后续“生成看板”能找到记录
                    event_data["message_id"] = assistant_message_id

                yield event

        except Exception as e:
            print(f"❌ [生成器内部错误]: {str(e)}")
            traceback.print_exc()
            yield {"event": "error", "data": {"message": str(e)}}

    return StreamingResponse(
        StreamableHTTPService.generate_stream(event_generator()),
        media_type="application/json",
        headers=StreamableHTTPService.get_response_headers()
    )

@router.get("/schema")
async def get_schema():
    from services.schema_service import SchemaService
    return {
        "tables": await SchemaService.get_table_names(),
        "schema": await SchemaService.get_full_schema()
    }
