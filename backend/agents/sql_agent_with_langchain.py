"""
LangChain SQL Agent 兼容层
提供与原 SQLAgent 相同的接口，实现无缝替换
"""
import json
from typing import Dict, Any, Optional, List, AsyncGenerator
from pathlib import Path

from config import MAX_RETRY_COUNT, DATABASES
from services.schema_service import SchemaService
from services.sql_executor import SQLExecutor
from utils.prompt_templates import SUMMARY_PROMPT, INTENT_CLASSIFICATION_PROMPT, CHAT_RESPONSE_PROMPT
from agents.langchain_sql_agent import get_langchain_sql_agent
import httpx
from config import API_KEY, API_BASE_URL, MODEL_NAME


class SQLAgentWithLangChain:
    """
    使用 LangChain 的 SQL Agent
    提供与原 SQLAgent 相同的接口
    """
    
    async def _chat_completion(self, messages: List[Dict[str, str]], temperature: float = 0.7) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL_NAME,
                    "messages": messages,
                    "temperature": temperature
                }
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]

    async def _chat_completion_stream(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7,
        enable_thinking: bool = True
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        调用 DeepSeek API 进行流式生成（用于摘要）
        """
        request_body = {
            "model": MODEL_NAME,
            "messages": messages,
            "temperature": temperature,
            "stream": True
        }
        
        if enable_thinking:
            request_body["thinking"] = {"type": "enabled"}
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json=request_body
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                yield {
                                    "reasoning_content": delta.get("reasoning_content", ""),
                                    "content": delta.get("content", "")
                                }
                        except json.JSONDecodeError:
                            pass
    
    async def _classify_intent(self, question: str) -> str:
        prompt = INTENT_CLASSIFICATION_PROMPT.format(question=question)
        messages = [
            {"role": "system", "content": "你是一个智能助手，负责根据用户问题判断其意图。"},
            {"role": "user", "content": prompt}
        ]
        response_content = await self._chat_completion(messages, temperature=0.0)
        try:
            intent_json = json.loads(response_content)
            return intent_json.get("intent", "chat") # 默认归类为 chat
        except json.JSONDecodeError:
            print(f"❌ 意图识别结果解析失败: {response_content}")
            return "chat"
    
    async def _generate_chat_response_stream(
        self,
        question: str,
        history: str = "",
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt = CHAT_RESPONSE_PROMPT.format(
            history=history,
            question=question
        )

        messages = [
            {"role": "system", "content": "你是一个智能数据分析助手的AI模型。"},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.7, enable_thinking=enable_thinking):
            if delta["reasoning_content"]:
                yield {"type": "reasoning", "content": delta["reasoning_content"]}
            if delta["content"]:
                full_content += delta["content"]
                yield {"type": "content", "content": delta["content"]}
        
        yield {"type": "done", "result": full_content or ""}

    async def generate_summary_stream(
        self,
        sql_result: str,
        chart_type: str,
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        生成分析摘要（复用原方法）
        """
        prompt = SUMMARY_PROMPT.format(
            sql_result=sql_result,
            chart_type=chart_type
        )

        messages = [
            {"role": "system", "content": "你是一个专业的数据分析师。"},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.3, enable_thinking=enable_thinking):
            if delta["reasoning_content"]:
                yield {"type": "reasoning", "content": delta["reasoning_content"]}
            if delta["content"]:
                full_content += delta["content"]
                yield {"type": "content", "content": delta["content"]}
        
        yield {"type": "done", "result": full_content or ""}
    
    async def generate_chart_config(
        self,
        sql_result: Dict[str, Any],
        chart_type: str
    ) -> Dict[str, Any]:
        """
        生成图表配置（复用原逻辑）
        """
        try:
            columns = sql_result.get("columns", [])
            rows = sql_result.get("rows", [])
            
            if chart_type == "table":
                chart_type = "bar"
            
            if not rows:
                return self._get_default_chart_config(chart_type)

            if len(columns) < 2:
                return self._get_default_chart_config(chart_type)

            numeric_cols = []
            category_cols = []
            
            for col in columns:
                if len(rows) > 0:
                    val = rows[0].get(col)
                    if isinstance(val, (int, float)):
                        numeric_cols.append(col)
                    else:
                        category_cols.append(col)
            
            if not category_cols:
                category_cols = [columns[0]]
            
            if not numeric_cols:
                numeric_cols = [columns[1]] if len(columns) > 1 else [columns[0]]
            
            x_axis = category_cols[0]
            y_axis = numeric_cols[0]

            if chart_type == "bar":
                return {
                    "title": {"text": "数据分析", "left": "center"},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows]},
                    "yAxis": {"type": "value"},
                    "series": [{"name": y_axis, "type": "bar", "data": [row[y_axis] for row in rows]}]
                }
            elif chart_type == "line":
                return {
                    "title": {"text": "数据分析", "left": "center"},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows]},
                    "yAxis": {"type": "value"},
                    "series": [{"name": y_axis, "type": "line", "data": [row[y_axis] for row in rows], "smooth": True}]
                }
            elif chart_type == "pie":
                return {
                    "title": {"text": "数据分析", "left": "center"},
                    "tooltip": {"trigger": "item"},
                    "series": [{
                        "name": y_axis,
                        "type": "pie",
                        "radius": "50%",
                        "data": [{"value": row[y_axis], "name": str(row[x_axis])} for row in rows]
                    }]
                }
            else:
                return self._get_default_chart_config(chart_type)
        except Exception as e:
            print(f"❌ 生成图表配置出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._get_default_chart_config(chart_type)
    
    def _get_default_chart_config(self, chart_type: str) -> Dict[str, Any]:
        return {
            "title": {"text": "暂无数据", "left": "center"},
            "xAxis": {"type": "category", "data": []},
            "yAxis": {"type": "value"},
            "series": [{"type": chart_type if chart_type in ["bar", "line"] else "bar", "data": []}]
        }
    
    async def process_question_with_history(
        self,
        question: str,
        history_str: str,
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        使用已格式化的历史字符串处理问题
        这个方法与原 SQLAgent 接口完全兼容
        """
        # 1. 意图识别
        yield {"event": "thinking", "data": {"content": "正在识别您的问题意图..."}}
        intent = await self._classify_intent(question)
        print(f"🎯 识别到的意图: {intent}")

        if intent == "chat":
            yield {"event": "thinking", "data": {"content": "正在生成智能回复..."}}
            full_summary_reasoning = ""
            summary_content = ""
            async for stream_event in self._generate_chat_response_stream(question, history_str, enable_thinking):
                if stream_event["type"] == "reasoning":
                    full_summary_reasoning += stream_event["content"]
                    yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "content":
                    summary_content += stream_event["content"]
                    yield {"event": "summary", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "done":
                    summary_content = stream_event["result"]
            
            yield {
                "event": "done",
                "data": {
                    "sql": "",
                    "chart_config": {},
                    "summary": summary_content,
                    "reasoning": full_summary_reasoning or "根据意图识别，这是一个聊天问题，无需查询数据库。"
                }
            }
            return
        
        schema = await SchemaService.get_full_schema()
        tables = await SchemaService.get_table_names()
        
        current_db_path = SchemaService.get_current_db_path()
        database_name = "业务数据库"
        for key, config in DATABASES.items():
            if str(config["path"]) == str(current_db_path):
                database_name = config["name"]
                break

        yield {"event": "thinking", "data": {"content": "正在理解您的问题..."}}
        yield {"event": "schema_loaded", "data": {"tables": tables}}

        sql_result = None
        sql = ""
        chart_type = "table"
        last_error = None
        full_reasoning = ""

        for attempt in range(MAX_RETRY_COUNT + 1):
            try:
                if attempt > 0:
                    yield {"event": "thinking", "data": {"content": f"正在修正 SQL (第 {attempt} 次重试)..."}}

                full_reasoning = ""
                sql_response = None
                
                # 获取 LangChain Agent
                langchain_agent = get_langchain_sql_agent(Path(current_db_path))
                
                # 调用 LangChain Agent 流式生成
                async for stream_event in langchain_agent.generate_sql_stream(
                    question, 
                    schema, 
                    history_str, 
                    enable_thinking, 
                    database_name
                ):
                    if stream_event["type"] == "reasoning":
                        full_reasoning += stream_event["content"]
                        yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                    elif stream_event["type"] == "content":
                        pass
                    elif stream_event["type"] == "done":
                        sql_response = stream_event["result"]
                
                if not sql_response:
                    raise ValueError("未能生成有效的 SQL 响应")
                
                sql = sql_response.get("sql", "")
                chart_type = sql_response.get("chart_type", "table")

                if not sql:
                    raise ValueError("未能生成有效的 SQL")
                
                print(f"📝 [LangChain] 生成的 SQL: {sql}")

                yield {"event": "sql_generated", "data": {"sql": sql}}
                yield {"event": "sql_executing", "data": {"content": "正在查询数据库..."}}

                sql_result = await SQLExecutor.execute_sql(sql)
                print(f"✅ SQL 执行成功: {len(sql_result.get('rows', []))} 行数据")
                yield {"event": "sql_result", "data": sql_result}
                break

            except Exception as e:
                last_error = str(e)
                print(f"❌ SQL 执行失败 (尝试 {attempt + 1}/{MAX_RETRY_COUNT + 1}): {last_error}")
                import traceback
                traceback.print_exc()
                if attempt >= MAX_RETRY_COUNT:
                    yield {"event": "error", "data": {"message": f"查询失败: {last_error}"}}
                    return

        if sql_result is None:
            yield {"event": "error", "data": {"message": f"查询失败: {last_error}"}}
            return

        yield {"event": "thinking", "data": {"content": "正在生成图表配置..."}}
        chart_config = await self.generate_chart_config(sql_result, chart_type)
        yield {"event": "chart_ready", "data": {"option": chart_config, "chart_type": chart_type}}

        try:
            yield {"event": "thinking", "data": {"content": "正在生成分析摘要..."}}
            formatted_result = SQLExecutor.format_sql_result(sql_result)
            
            full_summary_reasoning = ""
            summary = ""
            async for stream_event in self.generate_summary_stream(formatted_result, chart_type, enable_thinking):
                if stream_event["type"] == "reasoning":
                    full_summary_reasoning += stream_event["content"]
                    yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "content":
                    summary += stream_event["content"]
                    yield {"event": "summary", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "done":
                    summary = stream_event["result"]
            
            if not summary:
                yield {"event": "summary", "data": {"content": "数据分析完成。"}}
                
        except Exception as e:
            print(f"⚠️ 生成摘要失败，使用默认内容: {str(e)}")
            yield {"event": "summary", "data": {"content": "数据分析完成，但生成摘要时遇到问题。"}}
            summary = "数据分析完成，但生成摘要时遇到问题。"

        yield {
            "event": "done",
            "data": {
                "sql": sql,
                "chart_config": chart_config,
                "summary": summary,
                "reasoning": full_reasoning
            }
        }



# 全局 Agent 实例缓存
_agent_instance: Optional[SQLAgentWithLangChain] = None


def get_sql_agent_with_langchain() -> SQLAgentWithLangChain:
    """
    获取 LangChain SQL Agent 实例（带缓存）
    """
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = SQLAgentWithLangChain()
    return _agent_instance
