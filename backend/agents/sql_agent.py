"""
SQL Agent 核心模块
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List, AsyncGenerator
from config import API_KEY, API_BASE_URL, MODEL_NAME, MAX_RETRY_COUNT
from utils.prompt_templates import SQL_GENERATION_PROMPT, SUMMARY_PROMPT, CHART_CONFIG_PROMPT, INTENT_CLASSIFICATION_PROMPT, CHAT_RESPONSE_PROMPT
from services.schema_service import SchemaService
from services.sql_executor import SQLExecutor


class SQLAgent:
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
        request_body = {
            "model": MODEL_NAME,
            "messages": messages,
            "temperature": temperature,
            "stream": True
        }
        
        if enable_thinking:
            request_body["thinking"] = {"type": "enabled"}
        
        print(f"📤 发送到 DeepSeek 的请求: model={MODEL_NAME}, enable_thinking={enable_thinking}")
        print(f"📤 Messages 数量: {len(messages)}")
        for i, msg in enumerate(messages):
            print(f"📤 Message {i} ({msg['role']}): {msg['content'][:200]}...")
        
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
                if response.status_code != 200:
                    error_text = await response.aread()
                    print(f"❌ DeepSeek API 错误: {response.status_code}")
                    print(f"❌ 错误响应: {error_text.decode('utf-8', errors='ignore')}")
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
                                reasoning_content = delta.get("reasoning_content", "")
                                content = delta.get("content", "")
                                if reasoning_content or content:
                                    yield {
                                        "reasoning_content": reasoning_content,
                                        "content": content
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
                                                                
    async def generate_sql_stream(
        self,
        question: str,
        schema: str,
        history: str = "",
        enable_thinking: bool = False,
        database_name: str = "业务数据库",
        database_type_info: str = "",
        table_list_query: str = "请使用：SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        quote_char: str = '"'
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt = SQL_GENERATION_PROMPT.format(
            database_name=database_name,
            database_type_info=database_type_info,
            schema=schema,
            history=history,
            question=question,
            table_list_query=table_list_query,
            quote_char=quote_char
        )

        messages = [
            {"role": "system", "content": "你是一个专业的数据分析助手。"},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.1, enable_thinking=enable_thinking):
            if delta["reasoning_content"]:
                yield {"type": "reasoning", "content": delta["reasoning_content"]}
            if delta["content"]:
                full_content += delta["content"]
                yield {"type": "content", "content": delta["content"]}
        
        yield {"type": "done", "result": self._parse_json_response(full_content)}

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
        
    def _parse_json_response(self, content: str) -> Dict[str, Any]:
        try:
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
            return json.loads(content)
        except Exception:
            return {
                "sql": "",
                "chart_type": "table",
                "reasoning": "解析失败"
            }

    async def generate_summary_stream(
        self,
        sql_result: str,
        chart_type: str,
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
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
        try:
            columns = sql_result.get("columns", [])
            rows = sql_result.get("rows", [])
            
            # 如果是 table 类型，默认用 bar
            if chart_type == "table":
                chart_type = "bar"
            
            print(f"📊 生成图表配置: chart_type={chart_type}, columns={columns}, rows_count={len(rows)}")
            
            if not rows:
                print("⚠️ 没有数据，返回默认配置")
                return self._get_default_chart_config(chart_type)

            if len(columns) < 2:
                print(f"⚠️ 列数不足 ({len(columns)}), 返回默认配置")
                return self._get_default_chart_config(chart_type)

            # 智能选择 x/y 轴
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
            
            print(f"  选择 x_axis={x_axis}, y_axis={y_axis}")

            if chart_type == "bar":
                config = {
                    "title": {"text": "数据分析", "left": "center"},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows]},
                    "yAxis": {"type": "value"},
                    "series": [{"name": y_axis, "type": "bar", "data": [row[y_axis] for row in rows]}]
                }
                print(f"✅ 返回柱状图配置")
                return config
            elif chart_type == "line":
                config = {
                    "title": {"text": "数据分析", "left": "center"},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows]},
                    "yAxis": {"type": "value"},
                    "series": [{"name": y_axis, "type": "line", "data": [row[y_axis] for row in rows], "smooth": True}]
                }
                print(f"✅ 返回折线图配置")
                return config
            elif chart_type == "pie":
                config = {
                    "title": {"text": "数据分析", "left": "center"},
                    "tooltip": {"trigger": "item"},
                    "series": [{
                        "name": y_axis,
                        "type": "pie",
                        "radius": "50%",
                        "data": [{"value": row[y_axis], "name": str(row[x_axis])} for row in rows]
                    }]
                }
                print(f"✅ 返回饼图配置")
                return config
            else:
                print(f"⚠️ 不支持的图表类型 {chart_type}, 返回默认")
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

    async def process_question(
        self,
        question: str,
        history_messages: List[Dict[str, str]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        history_str = self._format_history(history_messages or [])
        schema = await SchemaService.get_full_schema()
        tables = await SchemaService.get_table_names()

        yield {"event": "thinking", "data": {"content": "正在理解您的问题..."}}
        yield {"event": "schema_loaded", "data": {"tables": tables}}

        sql_result = None
        sql = ""
        chart_type = "table"
        last_error = None

        for attempt in range(MAX_RETRY_COUNT + 1):
            try:
                if attempt > 0:
                    yield {"event": "thinking", "data": {"content": f"正在修正 SQL (第 {attempt} 次重试)..."}}

                sql_response = await self.generate_sql(question, schema, history_str)
                sql = sql_response.get("sql", "")
                chart_type = sql_response.get("chart_type", "table")

                if not sql:
                    raise ValueError("未能生成有效的 SQL")
                
                print(f"📝 生成的 SQL: {sql}")

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
            summary = await self.generate_summary(formatted_result, chart_type)
            yield {"event": "summary", "data": {"content": summary}}
        except Exception as e:
            print(f"⚠️ 生成摘要失败，使用默认内容: {str(e)}")
            yield {"event": "summary", "data": {"content": "数据分析完成，但生成摘要时遇到问题。"}}

        yield {
            "event": "done",
            "data": {
                "sql": sql,
                "chart_config": chart_config,
                "summary": summary
            }
        }

    def _format_history(self, messages: List[Dict[str, str]]) -> str:
        if not messages:
            return ""
        
        lines = []
        for msg in messages[-5:]:
            role = "用户" if msg.get("role") == "user" else "助手"
            lines.append(f"{role}: {msg.get('content', '')}")
        
        return "\n".join(lines)

    async def process_question_with_history(
        self,
        question: str,
        history_str: str,
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """使用已格式化的历史字符串处理问题"""
        from config import DATABASES
        
        print(f"🚀 SQLAgent 准备开始生成查询...")
        print(f"📚 获取 Schema 信息...")
        schema = await SchemaService.get_full_schema()
        tables = await SchemaService.get_table_names()
        print(f"📊 数据库中共有 {len(tables)} 张表: {', '.join(tables)}")
        
        current_db_key = SchemaService.get_current_db_key()
        database_name = "业务数据库"
        db_type = "sqlite"
        
        if current_db_key in DATABASES:
            database_name = DATABASES[current_db_key]["name"]
            db_type = DATABASES[current_db_key].get("type", "sqlite")
        
        print(f"💾 当前数据库类型: {db_type}, 数据库名称: {database_name}")
        
        if db_type == "mysql":
            database_type_info = "【数据库类型】\nMySQL"
            table_list_query = "请使用：SHOW TABLES"
            quote_char = "`"
        elif db_type == "postgresql":
            database_type_info = "【数据库类型】\nPostgreSQL"
            table_list_query = "请使用：SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            quote_char = '"'
        else:
            database_type_info = ""
            table_list_query = "请使用：SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            quote_char = '"'

        yield {"event": "thinking", "data": {"content": "正在理解您的问题..."}}
        yield {"event": "schema_loaded", "data": {"tables": tables}}

        sql_result = None
        sql = ""
        chart_type = "table"
        last_error = None
        full_reasoning = ""

        print(f"🧠 开始调用 AI 模型生成 SQL (重试限制: {MAX_RETRY_COUNT})...")
        
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

        # 以下是原来的 SQL 生成逻辑
        for attempt in range(MAX_RETRY_COUNT + 1):
            try:
                if attempt > 0:
                    print(f"🔄 正在尝试第 {attempt} 次 SQL 修正...")
                    yield {"event": "thinking", "data": {"content": f"正在修正 SQL (第 {attempt} 次重试)..."}}

                full_reasoning = ""
                sql_response = None
                
                print(f"📡 正在发起 DeepSeek 流式请求...")
                async for stream_event in self.generate_sql_stream(
                    question, 
                    schema, 
                    history_str, 
                    enable_thinking, 
                    database_name,
                    database_type_info,
                    table_list_query,
                    quote_char
                ):
                    if stream_event["type"] == "reasoning":
                        full_reasoning += stream_event["content"]
                        yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                    elif stream_event["type"] == "content":
                        pass
                    elif stream_event["type"] == "done":
                        sql_response = stream_event["result"]
                
                if not sql_response:
                    print(f"❌ AI 未返回有效结果")
                    raise ValueError("未能生成有效的 SQL 响应")
                
                sql = sql_response.get("sql", "")
                chart_type = sql_response.get("chart_type", "table")

                if not sql:
                    print(f"❌ 生成的 SQL 为空，原始回复内容可能是非法 JSON")
                    raise ValueError("未能生成有效的 SQL")
                
                print(f"📝 AI 生成的 SQL: {sql}")

                yield {"event": "sql_generated", "data": {"sql": sql}}
                yield {"event": "sql_executing", "data": {"content": "正在查询数据库..."}}

                print(f"⚡ 执行 SQL 查询...")
                sql_result = await SQLExecutor.execute_sql(sql)
                print(f"✅ SQL 执行成功: {len(sql_result.get('rows', []))} 行数据")
                yield {"event": "sql_result", "data": sql_result}
                break

            except Exception as e:
                last_error = str(e)
                print(f"❌ SQL 执行/生成失败: {last_error}")
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
