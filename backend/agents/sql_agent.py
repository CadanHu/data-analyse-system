"""
SQL Agent 核心模块
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List, AsyncGenerator
from config import API_KEY, API_BASE_URL, CHAT_MODEL, REASONER_MODEL, MAX_RETRY_COUNT, ModelProvider, DEFAULT_PROVIDER
from services.llm_factory import llm_factory
from services.schema_service import SchemaService
from services.sql_executor import SQLExecutor
from utils.prompt_templates import get_prompt

class SQLAgent:
    async def _chat_completion(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7,
        provider: str = None,
        model_name: str = None
    ) -> str:
        provider = provider or DEFAULT_PROVIDER
        model_name = model_name or llm_factory.get_model_params(provider)["model"]
        
        # 🚀 调试：打印发送给模型的全量 Prompt
        print(f"\n📤 [Prompt ({provider})] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
        import json
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        print(f"<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n")

        # 使用 LangChain 统一调用
        llm = llm_factory.get_langchain_model(provider=provider, model_name=model_name, temperature=temperature)
        from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
        
        lc_messages = []
        for m in messages:
            if m["role"] == "system": lc_messages.append(SystemMessage(content=m["content"]))
            elif m["role"] == "user": lc_messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant": lc_messages.append(AIMessage(content=m["content"]))
        
        response = await llm.ainvoke(lc_messages)
        content = response.content
        
        print(f"\n📡 [{provider} 交互详情]")
        print(f"📥 [模型]: {model_name}")
        print(f"📥 [响应]: {content[:200]}...")
        print("-" * 30)
        
        return content
    
    async def _chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        enable_thinking: bool = True,
        provider: str = None,
        model_name: str = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        provider = provider or DEFAULT_PROVIDER

        # 深度处理模型选择
        if not model_name:
            params = llm_factory.get_model_params(provider, is_reasoning=enable_thinking)
            model_name = params["model"]

        print(f"\n📤 [Prompt ({provider}) 流式请求] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
        import json
        print(json.dumps(messages, ensure_ascii=False, indent=2))
        print(f"<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n")

        print(f"\n📡 [{provider} 流式请求发起]")
        print(f"📤 [模型]: {model_name} | [思考模式]: {enable_thinking}")

        full_content = ""
        full_reasoning = ""

        # 对 DeepSeek/OpenAI 使用原生客户端以正确捕获 reasoning_content
        if provider in [ModelProvider.DEEPSEEK, ModelProvider.OPENAI]:
            client = llm_factory.get_openai_client(provider)
            stream = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                stream=True
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                reasoning = getattr(delta, "reasoning_content", None) or ""
                content = delta.content or ""

                if reasoning:
                    full_reasoning += reasoning
                    yield {"reasoning_content": reasoning, "content": ""}
                if content:
                    full_content += content
                    yield {"reasoning_content": "", "content": content}
        else:
            # Gemini / Claude 等使用 LangChain 封装
            llm = llm_factory.get_langchain_model(
                provider=provider,
                model_name=model_name,
                temperature=temperature,
                streaming=True
            )
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
            lc_messages = []
            for m in messages:
                if m["role"] == "system": lc_messages.append(SystemMessage(content=m["content"]))
                elif m["role"] == "user": lc_messages.append(HumanMessage(content=m["content"]))
                elif m["role"] == "assistant": lc_messages.append(AIMessage(content=m["content"]))

            async for chunk in llm.astream(lc_messages):
                content = chunk.content if hasattr(chunk, "content") else str(chunk)
                reasoning = ""
                if hasattr(chunk, "additional_kwargs"):
                    reasoning = chunk.additional_kwargs.get("reasoning_content", "")
                if reasoning:
                    full_reasoning += reasoning
                    yield {"reasoning_content": reasoning, "content": ""}
                if content:
                    full_content += content
                    yield {"reasoning_content": "", "content": content}

        # 请求结束时日志
        if full_content:
            print(f"\n📥 [{provider} 完整回答]:\n{full_content[:500]}...")
        if full_reasoning:
            print(f"\n🤔 [{provider} 思考过程]:\n{full_reasoning[:200]}...")
        print("-" * 30)
    async def generate_ai_title(self, question: str, provider: str = None, model_name: str = None, language: str = "zh") -> str:
        """根据对话内容生成专业标题 (AI 智能版)"""
        prompt_tmpl = get_prompt("SESSION_TITLE", language)
        prompt = prompt_tmpl.format(question=question)
        messages = [{"role": "user", "content": prompt}]
        try:
            # 使用较快的 chat 模型，低温确保稳定性
            title = await self._chat_completion(messages, temperature=0.3, provider=provider, model_name=model_name)
            return title.strip().replace('"', '').replace("'", "")
        except Exception as e:
            print(f"⚠️ [Agent] 生成标题失败: {e}")
            return question[:15] + "..."

    async def rewrite_query_for_rag(self, question: str, history: str, provider: str = None, model_name: str = None, language: str = "zh") -> str:
        """利用 AI 将用户问题重写为更精准的检索词 (解决追问场景)"""
        if not history or len(question) > 30:
            return question # 如果问题足够长或没历史，直接返回
            
        prompt_tmpl = get_prompt("RAG_REWRITE", language)
        prompt = prompt_tmpl.format(history=history[-500:], question=question)
        
        try:
            # 使用同步 chat 接口快速获取结果
            rewritten = await self._chat_completion([{"role": "user", "content": prompt}], temperature=0.1, provider=provider, model_name=model_name)
            return rewritten.strip().replace('"', '').replace("'", "")
        except:
            return question

    async def _classify_intent(self, question: str, provider: str = None, model_name: str = None, language: str = "zh") -> str:
        prompt_tmpl = get_prompt("INTENT_CLASSIFICATION", language)
        prompt = prompt_tmpl.format(question=question)
        system_msg = "你是一个智能助手，负责根据用户问题判断其意图。" if language == "zh" else "You are an AI assistant classified user intent."
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt}
        ]
        response_content = await self._chat_completion(messages, temperature=0.0, provider=provider, model_name=model_name)
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
        knowledge_context: str = "", # 🚀 新增：知识库检索内容
        enable_thinking: bool = False,
        database_name: str = "业务数据库",
        database_type_info: str = "",
        database_version: str = "unknown",
        table_list_query: str = "请使用：SHOW TABLES",
        quote_char: str = '"',
        provider: str = None,
        model_name: str = None,
        language: str = "zh"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt_tmpl = get_prompt("SQL_GENERATION", language)
        prompt = prompt_tmpl.format(
            database_name=database_name,
            database_type_info=database_type_info,
            database_version=database_version,
            schema=schema,
            history=history,
            question=question,
            knowledge_context=knowledge_context, # 🚀 注入提示词
            table_list_query=table_list_query,
            quote_char=quote_char
        )

        system_msg = "你是一个专业的数据分析助手。" if language == "zh" else "You are a professional data analysis assistant."
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.1, enable_thinking=enable_thinking, provider=provider, model_name=model_name):
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
        knowledge_context: str = "", # 🚀 新增：知识库检索内容
        enable_thinking: bool = False,
        database_name: str = "未知",
        database_type: str = "未知",
        tables: str = "未知",
        provider: str = None,
        model_name: str = None,
        language: str = "zh"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt_tmpl = get_prompt("CHAT_RESPONSE", language)
        prompt = prompt_tmpl.format(
            history=history,
            question=question,
            knowledge_context=knowledge_context, # 🚀 注入提示词
            database_name=database_name,
            database_type=database_type,
            tables=tables
        )

        system_msg = "你是一个智能数据分析助手。" if language == "zh" else "You are an intelligent data analysis assistant."
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.7, enable_thinking=enable_thinking, provider=provider, model_name=model_name):
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
        enable_thinking: bool = False,
        provider: str = None,
        model_name: str = None,
        language: str = "zh"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt_tmpl = get_prompt("SUMMARY", language)
        prompt = prompt_tmpl.format(
            sql_result=sql_result,
            chart_type=chart_type
        )

        system_msg = "你是一个专业的数据分析师。" if language == "zh" else "You are a professional data analyst."
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt}
        ]

        full_content = ""
        async for delta in self._chat_completion_stream(messages, temperature=0.3, enable_thinking=enable_thinking, provider=provider, model_name=model_name):
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
        viz_config: Optional[Dict[str, Any]] = None,
        provider: str = None,
        model_name: str = None,
        language: str = "zh"
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
                ai_config = await self._generate_complex_chart_config(sql_result, chart_type, provider=provider, model_name=model_name, language=language)
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

    async def _generate_complex_chart_config(self, sql_result: Dict[str, Any], chart_type: str, provider: str = None, model_name: str = None, language: str = "zh") -> Optional[Dict[str, Any]]:
        """调用 AI 生成复杂图表的 ECharts 配置"""
        from utils.json_utils import json_dumps
        try:
            prompt_tmpl = get_prompt("CHART_CONFIG", language)
            prompt = prompt_tmpl.format(
                sql_result=json_dumps(sql_result, indent=2),
                chart_type=chart_type
            )
            system_msg = "你是一个专业的数据可视化专家，擅长使用 ECharts。" if language == "zh" else "You are a professional data visualization expert, skilled in ECharts."
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ]
            
            response = await self._chat_completion(messages, temperature=0.2, provider=provider, model_name=model_name)

            # 🌟 增强版 JSON 提取逻辑
            content = response.strip()
            # 1. 尝试移除 Markdown 代码块标记
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            # 2. 尝试正则匹配最外层的 { ... }
            json_match = re.search(r'(\{[\s\S]*\})', content)
            if json_match:
                try:
                    config = json.loads(json_match.group(1))
                    return config
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON 解析初次失败，尝试清理末尾: {e}")
                    # 3. 兜底：如果解析失败，尝试修复常见的截断问题（如多余的逗号）
                    fixed_content = re.sub(r',\s*\}', '}', json_match.group(1))
                    try:
                        return json.loads(fixed_content)
                    except:
                        return None
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
        knowledge_context: str = "", # 🚀 新增：知识库检索内容
        enable_thinking: bool = False,
        provider: str = None,
        model_name: str = None,
        language: str = "zh"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """增强的处理逻辑：集成 SQL 引擎与 RAG 知识库"""
        from config import DATABASES
        
        # 统一 provider
        provider = provider or DEFAULT_PROVIDER
        
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

        intent = await self._classify_intent(question, provider=provider, model_name=model_name, language=language)

        if intent == "chat":
            full_summary_reasoning = ""
            summary_content = ""
            async for stream_event in self._generate_chat_response_stream(
                question, 
                history_str, 
                knowledge_context=knowledge_context, # 🚀 传递 RAG 内容
                enable_thinking=enable_thinking, 
                database_name=database_name, 
                database_type=db_type, 
                tables=", ".join(tables),
                provider=provider,
                model_name=model_name,
                language=language
            ):
                if stream_event["type"] == "reasoning":
                    full_summary_reasoning += stream_event["content"]
                    yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                elif stream_event["type"] == "content":
                    summary_content += stream_event["content"]
                    yield {"event": "summary", "data": {"content": stream_event["content"]}}
            yield {"event": "done", "data": {"summary": summary_content, "reasoning": full_summary_reasoning}}
            return

        # HITL 逻辑：分支 1 - 生成方案
        is_executing_after_plan = (intent == "confirmation")
        if intent == "sql_query" and not is_executing_after_plan:
            plan_prompt_tmpl = get_prompt("PLAN_GENERATION", language)
            plan_prompt = plan_prompt_tmpl.format(
                database_name=database_name, 
                database_type=db_type, 
                schema=schema, 
                history=history_str, 
                question=question,
                knowledge_context=knowledge_context
            )
            full_plan = ""
            full_reasoning = ""
            system_msg = "你是一个专业的数据分析顾问。" if language == "zh" else "You are a professional data analysis consultant."
            async for delta in self._chat_completion_stream([{"role": "system", "content": system_msg}, {"role": "user", "content": plan_prompt}], temperature=0.3, enable_thinking=enable_thinking, provider=provider, model_name=model_name):
                if delta["reasoning_content"]:
                    full_reasoning += delta["reasoning_content"]
                    yield {"event": "model_thinking", "data": {"content": delta["reasoning_content"]}}
                if delta["content"]:
                    full_plan += delta["content"]
                    yield {"event": "summary", "data": {"content": delta["content"]}}
            yield {"event": "done", "data": {"summary": full_plan, "reasoning": full_reasoning}}
            return

        # HITL 逻辑：分支 2 - 执行方案 (当用户说“可以”时)
        execution_question = question
        if is_executing_after_plan:
            # 🚀 增强逻辑：从历史中提取“分析方案”
            plan_context = ""
            if history_str:
                # 寻找包含“方案”或“思路”的消息片段
                msgs = history_str.split("\n\n")
                for msg in reversed(msgs):
                    if "方案" in msg or "思路" in msg or "关联逻辑" in msg:
                        plan_context = msg[:2000] 
                        break
            
            if plan_context:
                execution_question = (
                    f"用户已确认执行你刚才提出的分析方案。\n"
                    f"【确认执行的方案内容】\n{plan_context}\n"
                    f"请立即根据上述方案生成最终的 SELECT SQL 语句并执行查询。严禁生成闲聊。用户指令：{question}"
                )
            else:
                execution_question = f"根据你刚才提出的分析方案，请立即生成最终的 SELECT SQL 语句并执行查询。严禁使用 DROP/CREATE 等操作。当前指令：{question}"

        last_error = ""
        for attempt in range(MAX_RETRY_COUNT + 1):
            try:
                # 如果是重试，将错误信息加入上下文
                current_question = execution_question
                if last_error:
                    current_question = f"你上一次生成的 SQL 执行失败了，错误信息是：{last_error}。请修正 SQL 并重新生成。只允许 SELECT 语句。原始指令：{execution_question}"

                full_reasoning = ""
                sql_response = None
                # 🚀 关键：注入 SQL 生成过程
                async for stream_event in self.generate_sql_stream(current_question, schema, history_str, knowledge_context, enable_thinking, database_name, database_type_info, db_version, table_list_query, quote_char, provider=provider, model_name=model_name, language=language):
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
                chart_config = await self.generate_chart_config(sql_result, chart_type, viz_config, provider=provider, model_name=model_name, language=language)
                yield {"event": "chart_ready", "data": {"option": chart_config, "chart_type": chart_config.get("chart_type", chart_type)}}
                
                formatted_result = SQLExecutor.format_sql_result(sql_result)
                summary = ""
                async for stream_event in self.generate_summary_stream(formatted_result, chart_type, enable_thinking, provider=provider, model_name=model_name, language=language):
                    if stream_event["type"] == "reasoning":
                        yield {"event": "model_thinking", "data": {"content": stream_event["content"]}}
                    elif stream_event["type"] == "content":
                        summary += stream_event["content"]
                        yield {"event": "summary", "data": {"content": stream_event["content"]}}
                
                # 🚀 优化：不再自动构建深度分析看板，节省 Token
                # 改为返回一个标记，由用户手动点击按钮触发
                yield {"event": "done", "data": {
                    "sql": sql, 
                    "chart_config": chart_config, 
                    "summary": summary, 
                    "reasoning": full_reasoning, 
                    "session_title": sql_response.get("session_title", "")
                }}
                break

            except Exception as e:
                last_error = str(e)
                print(f"❌ [Agent] SQL 执行尝试 {attempt + 1} 失败: {last_error}")
                
                # 🚀 关键优化：如果是由于表不存在导致的错误，重试通常没有意义且浪费 Token
                if "doesn't exist" in last_error or "no such table" in last_error:
                    print(f"🛑 [Agent] 检测到硬伤错误（表不存在），停止重试以节省 Token。")
                    yield {"event": "error", "data": {"message": f"分析失败：请求的表不存在。错误详情: {last_error}"}}
                    return

                if attempt >= MAX_RETRY_COUNT:
                    yield {"event": "error", "data": {"message": f"分析失败（已达最大重试次数）: {last_error}"}}
                    return
