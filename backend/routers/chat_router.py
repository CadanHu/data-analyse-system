"""
聊天路由 - 流式 HTTP 响应 (日志增强版)
"""
import uuid
import json
import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from models.message import ChatRequest
from database.session_db import SessionDB
from routers.auth_router import get_current_user
from agents.sql_agent import SQLAgent
from agents.memory_manager import get_memory_manager
from services.stream_service import StreamableHTTPService
from utils.json_utils import json_dumps
import os

router = APIRouter()
_sql_agent = None

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
    
    session_db = SessionDB()
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    from services.schema_service import SchemaService
    
    try:
        print("📂 [会话] 正在从数据库加载会话信息...")
        session = await session_db.get_session(request.session_id, user_id)
        if not session:
            print(f"❌ [会话] 找不到会话: {request.session_id}")
            raise HTTPException(status_code=404, detail="会话不存在")
        print(f"📂 [会话] 加载成功: {session.get('title')}")

        # 设置数据库 Schema
        db_key = await session_db.get_session_database(request.session_id)
        if db_key:
            print(f"🎯 [数据库] 切换至会话指定库: {db_key}")
            SchemaService.set_database(db_key)

        # 保存用户消息
        print("💾 [数据库] 正在保存用户提问...")
        user_message_id = str(uuid.uuid4())
        await session_db.create_message({
            "id": user_message_id,
            "session_id": request.session_id,
            "parent_id": request.parent_id, # 分支功能：记录父节点
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
            # 关键改进：增加 session_id 过滤，只检索当前会话上传的文件
            search_results = await vs.search(request.question, top_k=3, session_id=request.session_id)
            if search_results:
                rag_context = "\n\n【参考知识库内容】:\n" + "\n".join([f"- {r['content']}" for r in search_results])
                print(f"✅ [RAG] 检索成功，获取到 {len(search_results)} 条片段")
                print(f"📄 [RAG 检索内容片段]:")
                for i, res in enumerate(search_results):
                    print(f"   [{i+1}] {res['content'][:200]}...")
            else:
                print("⚠️ [RAG] 知识库检索结果为空")
        except Exception as e:
            print(f"❌ [RAG] 检索出错: {str(e)}")

    async def event_generator():
        assistant_message_id = str(uuid.uuid4())
        print(f"🚀 [处理] 启动事件生成器，助手消息 ID: {assistant_message_id}")
        
        # 立即发送一个开始信号给前端，确认连接已通
        yield {"event": "thinking", "data": {"content": "正在启动 AI 引擎..."}}

        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_reasoning = ""
        assistant_data = ""

        try:
            if rag_context:
                print("📡 [流] 发送 RAG 检索结果事件...")
                yield {"event": "rag_retrieval", "data": {"content": rag_context, "status": "completed"}}

            print("🤖 [Agent] 正在调用 AI 模型处理...")
            agent = get_sql_agent()
            final_question = request.question + rag_context
            
            print(f"📝 [最终发送给 AI 的问题组合]:\n{final_question}")
            print("-" * 50)
            
            history_str = await memory_manager.get_history_text(request.session_id)
            
            async for event in agent.process_question_with_history(final_question, history_str, request.enable_thinking):
                event_type = event.get("event")
                event_data = event.get("data", {})

                # 记录核心流事件 (仅限关键节点)
                if event_type in ["sql_generated", "done"]:
                    print(f"📡 [流] 关键事件: {event_type}")

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
                    
                    # --- 核心修复：在 yield 之前完成所有操作 ---
                    # 1. 自动更新标题逻辑
                    current_title = session.get("title", "")
                    new_title = event_data.get("session_title") or generate_session_title(request.question)
                    if current_title == "新会话" or not current_title:
                        print(f"📝 [会话] 自动更新标题为: {new_title}")
                        await session_db.update_session_title(request.session_id, user_id, new_title)
                        event_data["session_title"] = new_title # 注入到即将发送的事件中

                    # 2. 保存助手回答到消息表
                    print("💾 [数据库] 正在保存助手回答...")
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "parent_id": user_message_id, # 分支功能：记录父节点
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_reasoning,
                        "data": assistant_data,
                        "created_at": datetime.now().isoformat()
                    })
                    await memory_manager.add_assistant_message(request.session_id, assistant_content)
                    await session_db.update_session_updated_at(request.session_id)

                yield event

                if event_type == "done":
                    print("✅ [处理] 全流程结束")

        except Exception as e:
            print(f"❌ [生成器内部错误]: {str(e)}")
            traceback.print_exc()
            yield {"event": "error", "data": {"message": str(e)}}

    print("📡 [响应] 正在返回 StreamingResponse...")
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
