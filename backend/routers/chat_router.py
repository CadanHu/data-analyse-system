"""
聊天路由 - 流式 HTTP 响应
"""
import uuid
import json
import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.message import ChatRequest
from database.session_db import SessionDB
from agents.sql_agent import SQLAgent
from agents.memory_manager import get_memory_manager
from services.stream_service import StreamableHTTPService
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
async def chat_stream(request: ChatRequest):
    print(f"📥 收到聊天请求: session_id={request.session_id}, question={request.question[:50]}..., enable_thinking={request.enable_thinking}")
    
    session_db = SessionDB()
    memory_manager = get_memory_manager()
    from services.schema_service import SchemaService
    
    # 切换到会话关联的数据库
    db_key = await session_db.get_session_database(request.session_id)
    if db_key:
        SchemaService.set_database(db_key)
        print(f"🎯 已切换到会话关联的数据库: {db_key}")
    
    session = await session_db.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 如果会话标题为空或默认值，自动生成新标题
    if (session["title"] is None or session["title"] == "" or session["title"] == "新会话") and len(request.question) > 0:
        new_title = generate_session_title(request.question)
        await session_db.update_session_title(request.session_id, new_title)
        print(f"🏷️ 自动生成会话标题: {new_title}")

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

    # 获取历史对话（从 Memory Manager 或数据库）
    history_str = await memory_manager.get_history_text(request.session_id)

    async def event_generator():
        assistant_message_id = str(uuid.uuid4())
        assistant_sql = ""
        assistant_chart_cfg = ""
        assistant_content = ""
        assistant_thinking = ""
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
                print(f"📤 发送事件: {event_type}")

                if event_type == "thinking":
                    assistant_thinking = event_data.get("content", "")
                elif event_type == "sql_generated":
                    assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result":
                    assistant_data = json.dumps(event_data, ensure_ascii=False)
                elif event_type == "chart_ready":
                    assistant_chart_config = event_data.get("option", {})
                    assistant_chart_cfg = json.dumps(assistant_chart_config, ensure_ascii=False)
                elif event_type == "summary":
                    assistant_content += event_data.get("content", "")
                elif event_type == "done":
                    done_data = event_data
                    assistant_content = done_data.get("summary", assistant_content)

                # 生成事件对象
                yield {
                    "event": event_type,
                    "data": event_data
                }

                if event_type == "done":
                    print("✅ 处理完成，保存助手消息")
                    # 保存助手消息到数据库
                    await session_db.create_message({
                        "id": assistant_message_id,
                        "session_id": request.session_id,
                        "role": "assistant",
                        "content": assistant_content,
                        "sql": assistant_sql,
                        "chart_cfg": assistant_chart_cfg,
                        "thinking": assistant_thinking,
                        "data": assistant_data,
                        "created_at": datetime.now().isoformat()
                    })
                    # 添加到记忆
                    await memory_manager.add_assistant_message(request.session_id, assistant_content)
                    await session_db.update_session_updated_at(request.session_id)

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


@router.get("/databases")
async def get_databases():
    """获取所有可用的数据库列表"""
    from config import DATABASES
    from services.schema_service import SchemaService
    
    current_db_path = SchemaService.get_current_db_path()
    
    databases = []
    for key, config in DATABASES.items():
        databases.append({
            "key": key,
            "name": config["name"],
            "path": str(config["path"]),
            "is_current": str(config["path"]) == str(current_db_path)
        })
    
    return {"databases": databases}


@router.post("/database/switch")
async def switch_database(request: dict):
    """切换数据库"""
    from config import DATABASES
    from services.schema_service import SchemaService
    
    db_key = request.get("database_key")
    if db_key not in DATABASES:
        raise HTTPException(status_code=400, detail=f"数据库 {db_key} 不存在")
    
    SchemaService.set_database(db_key)
    
    return {
        "message": f"已切换到 {DATABASES[db_key]['name']}",
        "database": {
            "key": db_key,
            "name": DATABASES[db_key]["name"]
        }
    }
