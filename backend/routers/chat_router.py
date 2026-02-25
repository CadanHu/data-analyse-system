"""
聊天路由 - 流式 HTTP 响应
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
_sql_agent_with_langchain = None

# 是否使用 LangChain
USE_LANGCHAIN = os.getenv("USE_LANGCHAIN", "false").lower() == "true"

def get_sql_agent():
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = SQLAgent()
    return _sql_agent

def get_sql_agent_with_langchain():
    global _sql_agent_with_langchain
    if _sql_agent_with_langchain is None:
        from agents.sql_agent_with_langchain import SQLAgentWithLangChain
        _sql_agent_with_langchain = SQLAgentWithLangChain()
    return _sql_agent_with_langchain


def generate_session_title(question: str) -> str:
    """根据用户问题自动生成会话标题"""
    max_length = 30
    if len(question) <= max_length:
        return question
    # 截取前30个字符，确保在中文边界
    for i in range(max_length, 10, -1):
        if question[i-1] in "，。！？,.!?:：；;":
            return question[:i]
    return question[:max_length] + "..."


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    print(f"\n" + "="*50)
    print(f"📥 收到流式聊天请求: session_id={request.session_id}")
    print(f"📝 用户问题: {request.question}")
    print(f"💡 思考模式: {request.enable_thinking}")
    print(f"📦 请求体: {request.dict()}")
    print("="*50)
    
    session_db = SessionDB()
    user_id = current_user["id"]
    memory_manager = get_memory_manager()
    from services.schema_service import SchemaService
    
    # 获取会话当前选中的数据库
    db_key = await session_db.get_session_database(request.session_id)
    print(f"🔍 从数据库获取会话 {request.session_id} 的数据库配置: {db_key}")
    
    if db_key:
        print(f"🎯 正在切换 SchemaService 数据库为: {db_key}")
        SchemaService.set_database(db_key)
    else:
        print(f"⚠️ 会话未关联数据库，将使用默认数据库")
    
    session = await session_db.get_session(request.session_id, user_id)
    if not session:
        print(f"❌ 找不到会话或无权访问: {request.session_id}")
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")

    # 如果会话标题为空或默认值，自动生成新标题
    if (session["title"] is None or session["title"] == "" or session["title"] == "新会话") and len(request.question) > 0:
        new_title = generate_session_title(request.question)
        await session_db.update_session_title(request.session_id, user_id, new_title)
        print(f"🏷️ 自动生成会话标题: {new_title}")

    # 获取历史对话（从 Memory Manager 或数据库）
    # 注意：在添加当前问题之前获取，这样 history_str 只包含真正的“历史”
    history_str = await memory_manager.get_history_text(request.session_id)

    # 保存用户消息到数据库
    user_message_id = str(uuid.uuid4())
    await session_db.create_message({
        "id": user_message_id,
        "session_id": request.session_id,
        "role": "user",
        "content": request.question,
        "created_at": datetime.now().isoformat()
    })
    
    # 添加到记忆
    await memory_manager.add_user_message(request.session_id, request.question)

    async def event_generator():
        assistant_message_id = str(uuid.uuid4())
        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_thinking = ""  # 用于记录 UI 状态
        assistant_reasoning = "" # 用于记录真实的模型推理过程
        assistant_data = ""
        assistant_chart_config = {}

        try:
            print("🚀 开始处理问题...")
            print(f"📦 使用 {'LangChain' if USE_LANGCHAIN else '原生'} SQL Agent")
            
            # 选择使用哪个 Agent
            if USE_LANGCHAIN:
                agent = get_sql_agent_with_langchain()
            else:
                agent = get_sql_agent()
            
            # 传递历史字符串给 SQL Agent
            async for event in agent.process_question_with_history(request.question, history_str, request.enable_thinking):
                event_type = event.get("event")
                event_data = event.get("data", {})
                print(f"📤 正在转发事件: {event_type}")

                if event_type == "thinking":
                    assistant_thinking = event_data.get("content", "")
                elif event_type == "model_thinking":
                    # 累加真实的模型思考过程
                    assistant_reasoning += event_data.get("content", "")
                elif event_type == "sql_generated":
                    assistant_sql = event_data.get("sql", "")
                    print(f"  └─ 生成 SQL: {assistant_sql[:100]}...")
                elif event_type == "sql_result":
                    print(f"  └─ 查询结果行数: {event_data.get('row_count', 0)}")
                    # 使用自定义 json_dumps 处理日期类型数据
                    assistant_data = json_dumps(event_data)
                elif event_type == "chart_ready":
                    assistant_chart_config = event_data.get("option", {})
                    assistant_chart_cfg = json_dumps(assistant_chart_config)
                elif event_type == "summary":
                    content_chunk = event_data.get("content", "")
                    assistant_content += content_chunk
                elif event_type == "done":
                    done_data = event_data
                    assistant_content = done_data.get("summary", assistant_content)
                    
                    # 动态更新会话标题逻辑
                    model_suggested_title = done_data.get("session_title", "")
                    if model_suggested_title:
                        # 检查当前标题是否为默认/通用标题
                        current_session = await session_db.get_session(request.session_id, user_id)
                        if current_session and (not current_session.get("title") or current_session["title"] in ["新会话", "未命名会话"] or len(current_session["title"]) > 25):
                            print(f"🏷️ 模型建议新标题: {model_suggested_title}")
                            await session_db.update_session_title(request.session_id, user_id, model_suggested_title)
                    
                    # done 事件数据中也包含最终的 reasoning
                    if not assistant_reasoning:
                        assistant_reasoning = done_data.get("reasoning", "")
                    print(f"✅ 处理完成，生成摘要字数: {len(assistant_content)}")

                # 生成事件对象
                yield {
                    "event": event_type,
                    "data": event_data
                }

                if event_type == "done":
                    print("💾 正在保存助手消息到数据库...")
                    # 保存助手消息到数据库
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_reasoning, # 存入真实的推理过程
                        "data": assistant_data,
                        "created_at": datetime.now().isoformat()
                    })
                    # 添加到记忆
                    await memory_manager.add_assistant_message(request.session_id, assistant_content)
                    await session_db.update_session_updated_at(request.session_id)
                    print(f"✨ 会话状态更新成功")

        except Exception as e:
            print(f"❌ 处理过程中出错: {str(e)}")
            traceback.print_exc()
            yield {
                "event": "error",
                "data": {"message": str(e)}
            }

    # 使用 StreamableHTTPService 生成流式响应
    return StreamingResponse(
        StreamableHTTPService.generate_stream(event_generator()),
        media_type="application/json",
        headers=StreamableHTTPService.get_response_headers()
    )


@router.get("/schema")
async def get_schema():
    from services.schema_service import SchemaService
    tables = await SchemaService.get_table_names()
    full_schema = await SchemaService.get_full_schema()
    return {
        "tables": tables,
        "schema": full_schema
    }
