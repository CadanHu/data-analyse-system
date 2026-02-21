"""
SQL Agent 核心模块
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List, AsyncGenerator
from config import API_KEY, API_BASE_URL, MODEL_NAME, MAX_RETRY_COUNT
from utils.prompt_templates import SQL_GENERATION_PROMPT, SUMMARY_PROMPT, CHART_CONFIG_PROMPT
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

    async def generate_sql(
        self,
        question: str,
        schema: str,
        history: str = ""
    ) -> Dict[str, Any]:
        prompt = SQL_GENERATION_PROMPT.format(
            schema=schema,
            history=history,
            question=question
        )

        content = await self._chat_completion(
            messages=[
                {"role": "system", "content": "你是一个专业的数据分析助手。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )

        return self._parse_json_response(content)

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

    async def generate_summary(
        self,
        sql_result: str,
        chart_type: str
    ) -> str:
        prompt = SUMMARY_PROMPT.format(
            sql_result=sql_result,
            chart_type=chart_type
        )

        content = await self._chat_completion(
            messages=[
                {"role": "system", "content": "你是一个专业的数据分析师。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3
        )

        return content or ""

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
        history_str: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """使用已格式化的历史字符串处理问题"""
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
