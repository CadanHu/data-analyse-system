"""
SQL Agent 核心模块
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List, AsyncGenerator
from config import API_KEY, API_BASE_URL, CHAT_MODEL, REASONER_MODEL, MAX_RETRY_COUNT
from utils.prompt_templates import (
    SQL_GENERATION_PROMPT, SUMMARY_PROMPT, CHART_CONFIG_PROMPT, 
    INTENT_CLASSIFICATION_PROMPT, CHAT_RESPONSE_PROMPT, PLAN_GENERATION_PROMPT
)
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
                    "model": CHAT_MODEL,
                    "messages": messages,
                    "temperature": temperature
                }
            )
            response.raise_for_status()
            result = response.json()
            
            # --- 核心改进：打印详细交互日志 ---
            print(f"\n📡 [DeepSeek 交互详情]")
            print(f"📥 [模型]: {result.get('model')}")
            raw_content = result.get('choices')[0].get('message').get('content')
            print(f"📥 [原始响应]: {json.dumps(raw_content, ensure_ascii=False, indent=2)}")
            usage = result.get("usage", {})
            print(f"💰 [Token 消耗]: 总计 {usage.get('total_tokens', 0)}, 提示 {usage.get('prompt_tokens', 0)}, 回答 {usage.get('completion_tokens', 0)}")
            print("-" * 30)
            
            return result["choices"][0]["message"]["content"]
    
    async def _chat_completion_stream(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7,
        enable_thinking: bool = True
    ) -> AsyncGenerator[Dict[str, Any], None]:
        # 根据开关选择模型
        active_model = REASONER_MODEL if enable_thinking else CHAT_MODEL
        
        request_body = {
            "model": active_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True} # 启用精准结算
        }
        
        print(f"\n📡 [DeepSeek 流式请求发起]")
        print(f"📤 [模型]: {active_model} | [思考模式]: {enable_thinking}")
        
        full_content = ""
        full_reasoning = ""

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
                    print(f"❌ DeepSeek API 错误: {response.status_code} - {error_text.decode()}")
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            
                            # 1. 精确结算日志 (通常在最后一个 chunk)
                            if chunk.get("usage"):
                                usage = chunk["usage"]
                                print(f"\n💰 [流式 Token 结算]")
                                print(f"   - 总计: {usage.get('total_tokens', 0)}")
                                print(f"   - 提示 (Prompt): {usage.get('prompt_tokens', 0)}")
                                print(f"   - 回答 (Completion): {usage.get('completion_tokens', 0)}")
                                if usage.get('completion_tokens_details', {}).get('reasoning_tokens'):
                                    print(f"   - 推理 (Reasoning): {usage['completion_tokens_details']['reasoning_tokens']}")
                            
                            # 2. 内容处理与实时提示
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                
                                # 实时捕获思考
                                reasoning = delta.get("reasoning_content", "")
                                if reasoning:
                                    if not full_reasoning:
                                        print("🧠 [AI 正在思考...]")
                                    full_reasoning += reasoning
                                
                                # 实时捕获回答
                                content = delta.get("content", "")
                                if content:
                                    full_content += content
                                
                                if reasoning or content:
                                    yield {
                                        "reasoning_content": reasoning,
                                        "content": content
                                    }
                        except json.JSONDecodeError:
                            pass
                
                # 请求结束时，打印完整响应内容
                if full_content:
                    print(f"\n📥 [AI 完整回答]:\n{full_content}")
                if full_reasoning:
                    print(f"\n🧠 [AI 完整思考过程]:\n{full_reasoning}")
                print("-" * 30)
    async def _classify_intent(self, question: str) -> str:
        prompt = INTENT_CLASSIFICATION_PROMPT.format(question=question)
        messages = [
            {"role": "system", "content": "你是一个智能助手，负责根据用户问题判断其意图。"},
            {"role": "user", "content": prompt}
        ]
        response_content = await self._chat_completion(messages, temperature=0.0)
        try:
            intent_json = json.loads(response_content)
            return intent_json.get("intent", "chat")
        except json.JSONDecodeError:
            return "chat"
                                                                
    async def generate_sql_stream(
        self,
        question: str,
        schema: str,
        history: str = "",
        enable_thinking: bool = False,
        database_name: str = "业务数据库",
        database_type_info: str = "",
        database_version: str = "unknown",
        table_list_query: str = "请使用：SHOW TABLES",
        quote_char: str = '"'
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt = SQL_GENERATION_PROMPT.format(
            database_name=database_name,
            database_type_info=database_type_info,
            database_version=database_version,
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
        enable_thinking: bool = False,
        database_name: str = "未知",
        database_type: str = "未知",
        tables: str = "未知"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt = CHAT_RESPONSE_PROMPT.format(
            history=history,
            question=question,
            database_name=database_name,
            database_type=database_type,
            tables=tables
        )

        messages = [
            {"role": "system", "content": "你是一个智能数据分析助手。"},
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
                "viz_config": {},
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
        chart_type: str,
        viz_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        根据 SQL 结果和 AI 建议生成图表配置
        """
        try:
            columns = sql_result.get("columns", [])
            rows = sql_result.get("rows", [])
            viz_config = viz_config or {}
            
            # 特殊处理：单行单列 -> card
            if chart_type == "card" or (len(rows) == 1 and len(columns) == 1):
                val = rows[0][columns[0]]
                return {
                    "chart_type": "card",
                    "value": val,
                    "label": viz_config.get("title") or columns[0],
                    "unit": ""
                }

            if chart_type == "table":
                return {"chart_type": "table"}

            if not rows or not columns:
                return self._get_default_chart_config(chart_type)

            # 对于复杂图表，调用 AI 生成配置
            complex_types = [
                "area", "scatter", "radar", "funnel", "gauge", "heatmap", 
                "treemap", "sankey", "boxplot", "waterfall", "candlestick"
            ]
            if chart_type in complex_types:
                ai_config = await self._generate_complex_chart_config(sql_result, chart_type)
                if ai_config:
                    return ai_config

            # 智能映射 X/Y 轴 (基础图表回退方案)
            x_axis = viz_config.get("x") if viz_config.get("x") in columns else None
            y_axis = viz_config.get("y") if viz_config.get("y") in columns else None

            if not x_axis or not y_axis:
                # 降级：启发式匹配
                numeric_cols = [c for c in columns if isinstance(rows[0].get(c), (int, float))]
                category_cols = [c for c in columns if c not in numeric_cols]
                
                x_axis = x_axis or (category_cols[0] if category_cols else columns[0])
                y_axis = y_axis or (numeric_cols[0] if numeric_cols else (columns[1] if len(columns) > 1 else columns[0]))

            title = viz_config.get("title") or "分析结果"

            if chart_type == "bar":
                return {
                    "title": {"text": title, "left": "center", "top": 10},
                    "tooltip": {"trigger": "axis"},
                    "grid": {"top": 60, "bottom": 40, "left": 60, "right": 20},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows], "axisLabel": {"rotate": 30 if len(rows) > 5 else 0}},
                    "yAxis": {"type": "value"},
                    "series": [{"name": y_axis, "type": "bar", "data": [row[y_axis] for row in rows], "itemStyle": {"borderRadius": [4, 4, 0, 0]}}]
                }
            elif chart_type == "line" or chart_type == "area":
                series_config = {
                    "name": y_axis, 
                    "type": "line", 
                    "data": [row[y_axis] for row in rows], 
                    "smooth": True, 
                    "symbol": "circle", 
                    "symbolSize": 8
                }
                if chart_type == "area":
                    series_config["areaStyle"] = {"opacity": 0.3}
                
                return {
                    "title": {"text": title, "left": "center", "top": 10},
                    "tooltip": {"trigger": "axis"},
                    "grid": {"top": 60, "bottom": 40, "left": 60, "right": 20},
                    "xAxis": {"type": "category", "data": [str(row[x_axis]) for row in rows]},
                    "yAxis": {"type": "value"},
                    "series": [series_config]
                }
            elif chart_type == "pie":
                return {
                    "title": {"text": title, "left": "center", "top": 10},
                    "tooltip": {"trigger": "item"},
                    "series": [{
                        "name": y_axis,
                        "type": "pie",
                        "radius": ["40%", "70%"],
                        "avoidLabelOverlap": True,
                        "itemStyle": {"borderRadius": 10, "borderColor": "#fff", "borderWidth": 2},
                        "data": [{"value": row[y_axis], "name": str(row[x_axis])} for row in rows]
                    }]
                }
            
            return self._get_default_chart_config(chart_type)
        except Exception as e:
            print(f"❌ 图表生成错误: {str(e)}")
            return self._get_default_chart_config(chart_type)

    async def _generate_complex_chart_config(self, sql_result: Dict[str, Any], chart_type: str) -> Optional[Dict[str, Any]]:
        """调用 AI 生成复杂图表的 ECharts 配置"""
        from utils.json_utils import json_dumps
        try:
            prompt = CHART_CONFIG_PROMPT.format(
                sql_result=json_dumps(sql_result, indent=2),
                chart_type=chart_type
            )
            messages = [
                {"role": "system", "content": "你是一个专业的数据可视化专家，擅长使用 ECharts。"},
                {"role": "user", "content": prompt}
            ]
            
            response = await self._chat_completion(messages, temperature=0.2)
            
            # 提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                config = json.loads(json_match.group(0))
                return config
            return None
        except Exception as e:
            print(f"❌ AI 复杂图表生成失败: {str(e)}")
            return None

    def _get_default_chart_config(self, chart_type: str) -> Dict[str, Any]:
        return {
            "title": {"text": "暂无有效数据", "left": "center"},
            "series": []
        }

    async def process_question_with_history(
        self,
        question: str,
        history_str: str,
        enable_thinking: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """增强的处理逻辑：包含 viz_config 解析"""
        from config import DATABASES
        
        schema = await SchemaService.get_full_schema(include_sample=True)
        tables = await SchemaService.get_table_names()
        db_version = await SchemaService.get_db_version()
        
        current_db_key = SchemaService.get_current_db_key()
        database_name = "业务数据库"
        db_type = "mysql"
        
        if current_db_key in DATABASES:
            database_name = DATABASES[current_db_key]["name"]
            db_type = DATABASES[current_db_key].get("type", "mysql")
        
        if db_type == "mysql":
            database_type_info = "【数据库类型】\nMySQL"
            table_list_query = "请使用：SHOW TABLES"
            quote_char = "`"
        elif db_type == "postgresql":
            database_type_info = "【数据库类型】\nPostgreSQL"
            table_list_query = "请使用：SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            quote_char = '"'
        else:
            database_type_info = f"【数据库类型】\n{db_type}"
            table_list_query = "请根据数据库类型使用标准 SQL 查询表列表"
            quote_char = '"'

        yield {"event": "thinking", "data": {"content": "正在理解您的问题..."}}
        yield {"event": "schema_loaded", "data": {"tables": tables}}

        intent = await self._classify_intent(question)

        if intent == "chat":
            full_summary_reasoning = ""
            summary_content = ""
            async for stream_event in self._generate_chat_response_stream(question, history_str, enable_thinking, database_name, db_type, ", ".join(tables)):
                if stream_event["type"] == "reasoning":
                    full_summary_reasoning += stream_event["content"]
                    yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "content":
                    summary_content += stream_event["content"]
                    yield {"event": "summary", "data": {"content": stream_event["content"]}}
            yield {"event": "done", "data": {"summary": summary_content, "reasoning": full_summary_reasoning}}
            return

        # HITL 逻辑
        is_executing_after_plan = (intent == "confirmation")
        if intent == "sql_query" and not is_executing_after_plan:
            plan_prompt = PLAN_GENERATION_PROMPT.format(database_name=database_name, database_type=db_type, schema=schema, history=history_str, question=question)
            full_plan = ""
            full_reasoning = ""
            async for delta in self._chat_completion_stream([{"role": "system", "content": "你是一个专业的数据分析顾问。"}, {"role": "user", "content": plan_prompt}], temperature=0.3, enable_thinking=enable_thinking):
                if delta["reasoning_content"]:
                    full_reasoning += delta["reasoning_content"]
                    yield {"event": "model_thinking", "data": {"content": delta["reasoning_content"]}}
                if delta["content"]:
                    full_plan += delta["content"]
                    yield {"event": "summary", "data": {"content": delta["content"]}}
            yield {"event": "done", "data": {"summary": full_plan, "reasoning": full_reasoning}}
            return

        execution_question = question
        last_error = ""
        if is_executing_after_plan:
            execution_question = f"根据你刚才提出的分析方案，请立即生成最终的 SELECT SQL 语句并执行查询。严禁使用 DROP/CREATE 等操作。当前指令：{question}"

        for attempt in range(MAX_RETRY_COUNT + 1):
            try:
                # 如果是重试，将错误信息加入上下文
                current_question = execution_question
                if last_error:
                    current_question = f"你上一次生成的 SQL 执行失败了，错误信息是：{last_error}。请修正 SQL 并重新生成。只允许 SELECT 语句。原始指令：{execution_question}"

                full_reasoning = ""
                sql_response = None
                async for stream_event in self.generate_sql_stream(current_question, schema, history_str, enable_thinking, database_name, database_type_info, db_version, table_list_query, quote_char):
                    if stream_event["type"] == "reasoning":
                        full_reasoning += stream_event["content"]
                        yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                    elif stream_event["type"] == "done":
                        sql_response = stream_event["result"]
                
                if not sql_response: raise ValueError("未能生成有效的 SQL JSON 响应")
                
                sql = sql_response.get("sql", "")
                if not sql: raise ValueError("生成的 JSON 中没有 SQL 语句")
                
                chart_type = sql_response.get("chart_type", "table")
                viz_config = sql_response.get("viz_config", {})

                yield {"event": "sql_generated", "data": {"sql": sql}}
                yield {"event": "sql_executing", "data": {"content": "正在查询数据库..."}}

                sql_result = await SQLExecutor.execute_sql(sql)
                yield {"event": "sql_result", "data": sql_result}
                
                # 关键：传递 viz_config
                chart_config = await self.generate_chart_config(sql_result, chart_type, viz_config)
                yield {"event": "chart_ready", "data": {"option": chart_config, "chart_type": chart_config.get("chart_type", chart_type)}}
                
                formatted_result = SQLExecutor.format_sql_result(sql_result)
                summary = ""
                async for stream_event in self.generate_summary_stream(formatted_result, chart_type, enable_thinking):
                    if stream_event["type"] == "reasoning":
                        yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                    elif stream_event["type"] == "content":
                        summary += stream_event["content"]
                        yield {"event": "summary", "data": {"content": stream_event["content"]}}
                
                yield {"event": "done", "data": {"sql": sql, "chart_config": chart_config, "summary": summary, "reasoning": full_reasoning, "session_title": sql_response.get("session_title", "")}}
                break

            except Exception as e:
                last_error = str(e)
                print(f"❌ [Agent] SQL 执行尝试 {attempt + 1} 失败: {last_error}")
                if attempt >= MAX_RETRY_COUNT:
                    yield {"event": "error", "data": {"message": f"分析失败: {last_error}"}}
                    return
