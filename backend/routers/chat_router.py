"""
聊天路由 - 流式 HTTP 响应 (v4.0 物理隔离版)
"""
import uuid
import json
import logging
import traceback
import asyncio
import os
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

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
from config import DEFAULT_PROVIDER
import re
from difflib import SequenceMatcher


def _detect_filename_hint(question: str) -> str:
    """从问题中提取疑似文件名（含日期前缀、扩展名或中文报告名等特征）。"""
    # 优先匹配带扩展名的文件名
    m = re.search(r'[\w\u4e00-\u9fff\-\.]+\.(pdf|xlsx?|csv|docx?|txt|pptx?)', question, re.IGNORECASE)
    if m:
        return m.group(0)
    # 其次匹配 8 位日期打头的字符串（如 20260320_棕榈油研报）
    m = re.search(r'\d{8}[\w\u4e00-\u9fff_\-]+', question)
    if m:
        return m.group(0)
    return ""


def _boost_by_filename(results: list, hint: str, boost: float = 0.3) -> list:
    """对文件名与 hint 模糊匹配的 chunk 加权重排，boost 值叠加到最终得分上。"""
    if not hint:
        return results
    hint_lower = hint.lower()
    scored = []
    for r in results:
        fname = r.get("metadata", {}).get("filename", "")
        base = r.get("scores", {}).get("final", 0.5)
        if fname:
            ratio = SequenceMatcher(None, hint_lower, fname.lower()).ratio()
            final = base + boost * ratio if ratio > 0.4 else base
        else:
            final = base
        scored.append((final, r))
    return [r for _, r in sorted(scored, key=lambda x: x[0], reverse=True)]


def _format_rag_chunks(results: list) -> list:
    """在 chunk 内容前附加来源文件名，让 AI 知道每段数据出处。"""
    formatted = []
    for r in results:
        fname = r.get("metadata", {}).get("filename", "")
        header = r.get("metadata", {}).get("header_path", "")
        prefix = ""
        if fname:
            prefix = f"[来源: {fname}"
            if header:
                prefix += f" > {header}"
            prefix += "]\n"
        formatted.append(prefix + r["content"])
    return formatted


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

async def _fetch_rag_context(
    question: str,
    session_id: str,
    user_id: int,
    rag_scope: str,
    provider: str,
    model_name: str,
    language: str,
    agent_instance,
    history_str: str,
    top_k: int = 5,
) -> str:
    """
    公共 RAG 检索函数，供 Standard/Thinking/RAG 模式复用。
    返回拼接好的 RAG 上下文字符串（可能为空）。
    """
    try:
        from services.vector_store import VectorStore
        from agents.context_budget import ContextBudget

        vs = VectorStore()
        search_query = await agent_instance.rewrite_query_for_rag(question, history_str, language=language)
        search_session_id = None if rag_scope == "global" else session_id
        fname_hint = _detect_filename_hint(question)
        results = await vs.search(search_query, top_k=top_k + 3, session_id=search_session_id, user_id=user_id)
        if fname_hint and results:
            results = _boost_by_filename(results, fname_hint)
        results = results[:top_k]
        if not results:
            return ""
        budget = ContextBudget(provider=provider, model_name=model_name or "")
        return budget.fit_rag_chunks(_format_rag_chunks(results), max_single_chunk_chars=1500)
    except Exception as e:
        logger.warning(f"[RAG-fetch] 检索失败: {e}")
        return ""


async def _handle_session_auto_title(session_id: str, user_id: int, question: str, agent_instance, language: str, provider: str = None, model_name: str = None):
    """
    [Shared Helper] 异步生成并更新会话标题
    逻辑：仅当会话标题为空或为默认占位符时，触发 AI 生成新标题。
    注意：标题生成始终使用 provider 的默认标准模型（model_name=None），
    避免在 thinking 模式下使用重型推理模型（如 deepseek-reasoner）生成标题，速度慢且无必要。
    """
    try:
        async with session_db.async_session() as session:
            # 1. 检查当前标题
            result = await session.execute(
                select(SessionModel.title).where(SessionModel.id == session_id)
            )
            current_title = result.scalar_one_or_none()

            # 2. 如果标题为空，则由 AI 生成新标题（强制 model_name=None，用标准模型）
            if not current_title or current_title.strip() == "":
                new_title = await agent_instance.generate_ai_title(question, provider=provider, model_name=None, language=language)
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

            # RAG 检索：科学家模式也需要 PDF 知识库内容
            rag_knowledge = ""
            try:
                from services.vector_store import VectorStore
                vs = VectorStore()
                sql_agent_tmp = get_sql_agent()
                history_str_tmp = await memory_manager.get_history_text(request.session_id)
                search_query = await sql_agent_tmp.rewrite_query_for_rag(request.question, history_str_tmp, language=request.language)
                search_session_id = None if request.rag_scope == "global" else request.session_id
                fname_hint = _detect_filename_hint(request.question)
                search_results = await vs.search(search_query, top_k=8, session_id=search_session_id, user_id=user_id)
                if fname_hint and search_results:
                    search_results = _boost_by_filename(search_results, fname_hint)
                search_results = search_results[:5]
                if search_results:
                    from agents.context_budget import ContextBudget
                    budget = ContextBudget(
                        provider=request.model_provider or DEFAULT_PROVIDER,
                        model_name=request.model_name or "",
                    )
                    rag_knowledge = budget.fit_rag_chunks(_format_rag_chunks(search_results), max_single_chunk_chars=1500)
                    if rag_knowledge:
                        hint_tip = f"（文件名匹配: {fname_hint}）" if fname_hint else ""
                        yield {"event": "thinking", "data": {"content": f"已检索到 {len(search_results)} 条 PDF 知识{hint_tip}，注入数据科学家上下文..."}}
            except Exception as rag_err:
                print(f"⚠️ [Scientist RAG] 检索失败: {rag_err}")

            from agents.advanced_data_agent import AdvancedDataAgent
            agent_instance = AdvancedDataAgent()

            # 执行流
            async for event in agent_instance.process_analysis_flow(
                df_input=df_to_analyze,
                question=request.question,
                history=await memory_manager.get_history(request.session_id),
                language=request.language,
                knowledge_context=rag_knowledge
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
            yield {"event": "error", "data": {"message": f"Scientist Mode Error: {str(e)}"}}

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

            # ── RAG 检索（思考模式同样需要，用于 rag_sufficient 路由判断）────
            rag_context = await _fetch_rag_context(
                question=request.question,
                session_id=request.session_id,
                user_id=user_id,
                rag_scope=request.rag_scope or "session",
                provider=request.model_provider or DEFAULT_PROVIDER,
                model_name=request.model_name or "",
                language=request.language,
                agent_instance=agent_instance,
                history_str=history_str,
            )
            if rag_context:
                yield {"event": "thinking", "data": {"content": "已检索到相关知识，正在判断是否需要查询数据库..."}}

            async for event in agent_instance.process_question_with_history(
                request.question, history_str,
                knowledge_context=rag_context,
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
                elif event_type == "db_confirmation_needed":
                    assistant_data_obj = {"db_confirmation_needed": True}

                if event_type not in ["done", "db_confirmation_needed"]:
                    yield event
                elif event_type == "db_confirmation_needed":
                    yield event
                else:
                    save_data = assistant_data_obj if assistant_data_obj else {}
                    if event_data.get("db_confirmation_needed"):
                        save_data = {"db_confirmation_needed": True}
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
                        "data": json_dumps(save_data)
                    })
                    print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}")
                    print(f"💾 [DB] 助手消息已存储 → messages.id={assistant_message_id[:8]}，thinking={len(assistant_reasoning)}字，content={len(assistant_content)}字")
                    done_payload: dict = {
                        "message_id": assistant_message_id,
                        "user_message_id": user_message_id,
                        "session_title": (request.question or "Deep Analysis")[:50]
                    }
                    if event_data.get("db_confirmation_needed"):
                        done_payload["db_confirmation_needed"] = True
                    yield {"event": "done", "data": done_payload}

                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"message": f"Thinking Mode Error: {str(e)}"}}

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

        # 1. 执行 RAG 检索（向量 + 知识图谱）
        rag_context = ""
        history_str = await memory_manager.get_history_text(request.session_id)
        try:
            from services.vector_store import VectorStore
            from agents.context_router import get_context_profile
            from agents.context_budget import ContextBudget

            q_preview = request.question[:60].replace('\n', ' ')
            logger.info(f"[RAG] 🔍 开始检索 | user={user_id} | 问题: 「{q_preview}」")

            # ── 意图路由 ──────────────────────────────────────────
            ctx_profile = get_context_profile(request.question)
            logger.info(
                f"[RAG] 意图判断: intent={ctx_profile.intent_hint} | "
                f"needs_graph={ctx_profile.needs_graph} | "
                f"needs_global_graph={ctx_profile.needs_global_graph}"
            )

            # ── 向量检索 ──────────────────────────────────────────
            vs = VectorStore()
            search_query = await agent_instance.rewrite_query_for_rag(request.question, history_str, language=request.language)
            logger.info(f"[RAG] 向量检索 | 改写查询: 「{search_query[:80]}」")
            search_session_id = None if request.rag_scope == "global" else request.session_id
            fname_hint = _detect_filename_hint(request.question)
            search_results = await vs.search(search_query, top_k=8, session_id=search_session_id, user_id=user_id)
            if fname_hint and search_results:
                search_results = _boost_by_filename(search_results, fname_hint)
                logger.info(f"[RAG] 文件名提示命中: {fname_hint}，已对结果重排序")
            search_results = search_results[:5]
            logger.info(f"[RAG] ✔ 向量检索完成: 命中 {len(search_results)} 条片段")

            budget = ContextBudget(
                provider=request.model_provider or DEFAULT_PROVIDER,
                model_name=request.model_name or "",
            )
            vector_context = ""
            if search_results:
                raw_chunks = _format_rag_chunks(search_results)
                vector_context = budget.fit_rag_chunks(raw_chunks, max_single_chunk_chars=1500)
                logger.info(f"[RAG] 向量上下文: {len(vector_context)} 字符注入 Prompt")
            else:
                logger.info("[RAG] 向量检索无命中，跳过向量上下文注入")

            # ── 知识图谱检索 ──────────────────────────────────────
            graph_context = ""
            if ctx_profile.needs_global_graph:
                logger.info("[RAG] 🌐 触发全局图谱搜索 (Map-Reduce 模式)")
                from services.graph_rag_service import graph_rag_service
                yield {"event": "thinking", "data": {"content": "Starting Map-Reduce Global Search (正在启动 Map-Reduce 全局搜索分析)..."}}

                final_answer = await graph_rag_service.global_search_mapreduce(
                    request.question, user_id,
                    level=2,
                    provider=request.model_provider,
                    model_name=request.model_name
                )

                # 直接保存并返回答案，跳过后续 Standard LLM 流程
                await session_db.create_message({
                    "id": assistant_message_id,
                    "session_id": request.session_id,
                    "user_id": user_id,
                    "parent_id": user_message_id,
                    "role": "assistant",
                    "content": final_answer,
                    "thinking": "Map-Reduce 全局图谱分析已完成。",
                    "data": json_dumps({"is_global_graph_answer": True})
                })

                yield {"event": "answer", "data": {"content": final_answer}}
                yield {
                    "event": "done",
                    "data": {
                        "message_id": assistant_message_id,
                        "user_message_id": user_message_id,
                        "session_title": (request.question or "Global Analysis")[:50]
                    }
                }
                asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
                return  # 🔴 关键点：直接返回，不再走下面的 chat 流程

            elif ctx_profile.needs_graph:
                logger.info("[RAG] 🔗 触发本地图谱搜索（关系型问题 → 实体 BFS 遍历）")
                from services.graph_rag_service import graph_rag_service
                graph_context = await graph_rag_service.search(
                    request.question, history_str, user_id,
                    provider=request.model_provider, model_name=request.model_name
                )
                if graph_context:
                    logger.info(f"[RAG] ✔ 图谱关系注入: {len(graph_context)} 字符")
                    yield {"event": "thinking", "data": {"content": "Found graph relations (已找到相关图谱关系)."}}
                else:
                    logger.info("[RAG] 图谱遍历无结果（实体未入库或图谱为空）")
            else:
                logger.info("[RAG] 本次问题不触发知识图谱检索")

            # ── 汇总上下文 ────────────────────────────────────────
            rag_context = "\n\n".join(filter(None, [graph_context, vector_context]))
            if rag_context:
                snippet_count = vector_context.count("\n- ") + (1 if vector_context else 0)
                logger.info(
                    f"[RAG] ✅ 上下文汇总完成: 总长度={len(rag_context)} 字符 "
                    f"(图谱={len(graph_context)}, 向量={len(vector_context)})"
                )
                yield {"event": "thinking", "data": {"content": f"Found {snippet_count} related snippets (已检索到 {snippet_count} 条相关背景)."}}
            else:
                logger.info("[RAG] ⚠ 本次检索无任何上下文，将直接回答")
        except Exception as re:
            logger.warning(f"[RAG] ❌ 检索流程异常: {re}")
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

            async for event in agent_instance.process_question_with_history(
                request.question, history_str,
                knowledge_context=rag_context, # 注入 RAG 背景（向量 + 图谱）
                enable_thinking=request.enable_thinking,
                language=request.language,
                force_chat=True  # RAG 模式永远走 chat 路径，禁止触发 HITL SQL 流程
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
            yield {"event": "error", "data": {"message": f"RAG Mode Error: {str(e)}"}}

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
            yield {"event": "error", "data": {"message": f"Depth Mode Error: {str(e)}"}}

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

            # ── RAG 检索（标准模式也需要，用于 rag_sufficient 路由判断）──────
            rag_context = ""
            if not request.no_database:
                rag_context = await _fetch_rag_context(
                    question=request.question,
                    session_id=request.session_id,
                    user_id=user_id,
                    rag_scope=request.rag_scope or "session",
                    provider=request.model_provider or DEFAULT_PROVIDER,
                    model_name=request.model_name or "",
                    language=request.language,
                    agent_instance=agent_instance,
                    history_str=history_str,
                )
                if rag_context:
                    yield {"event": "thinking", "data": {"content": "已检索到相关知识，正在判断是否需要查询数据库..."}}

            async for event in agent_instance.process_question_with_history(
                request.question, history_str,
                knowledge_context=rag_context,
                enable_thinking=request.enable_thinking,
                provider=request.model_provider,
                model_name=request.model_name,
                language=request.language,
                force_chat=request.no_database
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking": assistant_reasoning += event_data.get("content", "")
                elif event_type == "summary": assistant_content += event_data.get("content", "")
                elif event_type == "sql_generated": assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result": assistant_data_obj = event_data
                elif event_type == "chart_ready": assistant_chart_cfg = json_dumps(event_data.get("option", {}))
                elif event_type == "db_confirmation_needed":
                    # 记录为特殊 data，前端据此渲染确认按钮
                    assistant_data_obj = {"db_confirmation_needed": True}

                if event_type not in ["done", "db_confirmation_needed"]:
                    yield event
                elif event_type == "db_confirmation_needed":
                    # 转发给前端
                    yield event
                else:
                    # 持久化消息（含 db_confirmation_needed 标记）
                    save_data = assistant_data_obj if assistant_data_obj else {}
                    if event_data.get("db_confirmation_needed"):
                        save_data = {"db_confirmation_needed": True}
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
                        "data": json_dumps(save_data)
                    })
                    print(f"💾 [DB] 用户消息已存储 → messages.id={user_message_id[:8]}")
                    print(f"💾 [DB] 助手消息已存储 → messages.id={assistant_message_id[:8]}，sql={'有' if assistant_sql else '无'}，content={len(assistant_content)}字")
                    done_payload: dict = {
                        "message_id": assistant_message_id,
                        "user_message_id": user_message_id,
                        "session_title": (request.question or "New Chat")[:50]
                    }
                    if event_data.get("db_confirmation_needed"):
                        done_payload["db_confirmation_needed"] = True
                    yield {"event": "done", "data": done_payload}

                    # 异步更新标题
                    asyncio.create_task(_handle_session_auto_title(request.session_id, user_id, request.question, agent_instance, request.language, provider=request.model_provider, model_name=request.model_name))
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"message": f"Standard Mode Error: {str(e)}"}}

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
    request_id = str(uuid.uuid4())
    if request.enable_data_science_agent:
        resp = await run_scientist_mode(request, current_user)
    elif request.enable_depth:
        resp = await run_depth_mode(request, current_user)
    elif request.enable_rag:
        resp = await run_rag_mode(request, current_user)
    elif request.enable_thinking:
        resp = await run_thinking_mode(request, current_user)
    else:
        resp = await run_standard_mode(request, current_user)
    resp.headers["X-Request-Id"] = request_id
    return resp


# ==================== 3. 无状态单次调用 (Stateless Once) ====================

class OnceRequest(BaseModel):
    """
    无状态单次调用请求体 / Stateless single-call request body
    无需提前创建 session，系统自动创建临时会话并在响应 Header 中返回 session_id。
    调用方可按需调用 DELETE /api/sessions/{session_id} 清理。
    """
    question: str
    database_key: Optional[str] = "classic_business"
    enable_data_science_agent: bool = False
    enable_depth: bool = False
    enable_rag: bool = False
    enable_thinking: bool = False
    no_database: bool = False
    external_data: Optional[List[Dict[str, Any]]] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    language: Optional[str] = "zh"


@router.post("/chat/once")
async def chat_once(request: OnceRequest, current_user: dict = Depends(get_current_user)):
    """
    无状态单次调用入口 / Stateless single-call dispatcher

    自动创建临时 session，完成分析后在响应 Header X-Session-Id 中返回 session_id，
    调用方可按需清理（DELETE /api/sessions/{session_id}）。
    响应格式与 /chat/stream 完全一致（SSE 流）。
    """
    user_id = current_user["id"]

    # 1. 自动创建临时会话
    session_id = await session_db.create_session(
        user_id=user_id,
        title="[once]",
        database_key=request.database_key or "classic_business",
    )

    # 2. 组装 ChatRequest
    chat_req = ChatRequest(
        session_id=session_id,
        question=request.question,
        enable_data_science_agent=request.enable_data_science_agent,
        enable_depth=request.enable_depth,
        enable_rag=request.enable_rag,
        enable_thinking=request.enable_thinking,
        no_database=request.no_database,
        external_data=request.external_data,
        model_provider=request.model_provider,
        model_name=request.model_name,
        language=request.language,
    )

    # 3. 解析 API Key（与 chat_stream 相同逻辑）
    provider = chat_req.model_provider
    if not provider:
        all_keys = await session_db.get_all_api_keys(user_id)
        if all_keys:
            sorted_keys = sorted(all_keys, key=lambda k: k.get("updated_at") or "", reverse=True)
            provider = sorted_keys[0]["provider"]
            chat_req.model_provider = provider
            if not chat_req.model_name and sorted_keys[0].get("model_name"):
                chat_req.model_name = sorted_keys[0]["model_name"]
    provider = provider or DEFAULT_PROVIDER
    user_key_record = await session_db.get_api_key(user_id, provider)
    if user_key_record:
        ctx_keys = {f"{provider}_api_key": user_key_record["api_key"]}
        if user_key_record.get("base_url"):
            ctx_keys[f"{provider}_base_url"] = user_key_record["base_url"]
        if not chat_req.model_name and user_key_record.get("model_name"):
            chat_req.model_name = user_key_record["model_name"]
        set_user_api_keys(ctx_keys)

    # 4. 分发到对应模式处理器
    if chat_req.enable_data_science_agent:
        response = await run_scientist_mode(chat_req, current_user)
    elif chat_req.enable_depth:
        response = await run_depth_mode(chat_req, current_user)
    elif chat_req.enable_rag:
        response = await run_rag_mode(chat_req, current_user)
    elif chat_req.enable_thinking:
        response = await run_thinking_mode(chat_req, current_user)
    else:
        response = await run_standard_mode(chat_req, current_user)

    # 5. 在响应 Header 中暴露 session_id 和 request_id
    response.headers["X-Session-Id"] = session_id
    response.headers["X-Request-Id"] = str(uuid.uuid4())
    return response
