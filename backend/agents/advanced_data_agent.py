import json
import re
import pandas as pd
from typing import Dict, Any, List, AsyncGenerator, Optional
from services.llm_factory import llm_factory
from services.python_executor import python_executor
from config import ModelProvider, DEFAULT_PROVIDER
from utils.logger import logger
from utils.prompt_templates import get_prompt

# ─── 分析意图关键词（命中则需要代码生成，否则走事实查询路径）─────────────────
_ANALYSIS_KEYWORDS = {
    # 中文 — 可视化
    "图表", "画图", "画一张", "生成图", "柱状图", "折线图", "饼图", "散点图",
    "可视化", "绘制", "绘图",
    # 中文 — 深度分析
    "分析", "趋势", "预测", "对比", "比较", "回归", "相关性",
    "统计分析", "汇总分析", "深度分析", "数据分析",
    # 中文 — 计算类（简单查询词不在此列）
    "计算", "排行", "排名", "环比计算", "同比计算",
    # 英文 — 可视化
    "chart", "plot", "graph", "visualize", "visualization",
    "bar chart", "line chart", "pie chart", "scatter",
    # 英文 — 分析
    "trend", "forecast", "compare", "comparison", "analyze", "analysis",
    "regression", "correlation", "statistics", "ranking",
}


def _needs_code_generation(question: str) -> bool:
    """
    判断问题是否需要代码生成（分析/可视化），还是仅事实查询。
    保守原则：不确定时返回 False（走轻量文字路径），避免强制代码出错。
    """
    q = question.lower()
    return any(kw in q for kw in _ANALYSIS_KEYWORDS)


class AdvancedDataAgent:
    """
    AI Data Scientist Agent (v3.1)
    - rag_factual_mode: RAG 有答案的事实查询 → 直接文字回答，不生成代码
    - rag_analysis_mode: RAG + 分析/可视化需求 → 强制代码生成（原有行为）
    """

    def __init__(self, provider: str = None, model_name: str = None):
        self.provider = provider or DEFAULT_PROVIDER
        self.model_name = model_name

    async def process_analysis_flow(
        self,
        df_input: Any,
        question: str,
        history: List[Dict[str, str]] = None,
        language: str = "zh",
        knowledge_context: str = ""
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        全链路分析流程：流式方案生成 + 静默代码执行

        路径判断：
          rag_factual_mode  → 直接从 RAG 文字回答，不写代码
          rag_analysis_mode → 强制代码 + 可视化（原流程）
          有数据库 DataFrame → 代码分析（原流程）
        """
        # ── 1. 意图 & 模式判断 ────────────────────────────────────────────────
        is_empty_df = (
            not isinstance(df_input, dict)
            and (df_input is None or (hasattr(df_input, '__len__') and len(df_input) == 0))
        )
        rag_only_mode = is_empty_df and bool(knowledge_context)
        rag_needs_code = rag_only_mode and _needs_code_generation(question)
        rag_factual_mode = rag_only_mode and not rag_needs_code  # 事实查询路径

        thinking_msg = "正在启动数据科学家引擎..." if language == "zh" else "Starting Data Scientist Engine..."
        yield {"event": "thinking", "data": {"content": thinking_msg}}

        llm = llm_factory.get_langchain_model(
            provider=self.provider,
            model_name=self.model_name,
            temperature=0.1,
            streaming=True
        )

        # ── 2a. 事实查询路径（RAG 有数据，问题不需要代码）────────────────────
        if rag_factual_mode:
            if language == "zh":
                system_prompt = f"""你是一个智能数据分析助手。
请从下方【参考知识库内容 (RAG)】中，直接回答用户的问题。

【参考知识库内容 (RAG)】
{knowledge_context}

【回答要求】
1. 仔细阅读 [上文衔接] 和 [正文] 两部分，HTML 表格（<table>/<tr>/<td>）中的数据同样有效，必须解析所有行和列，不得遗漏。
2. 直接给出答案和数据，不要生成 Python 代码，不要描述"分析步骤"或"分析思路"。
3. 不受对话历史中旧答案的影响，以当前 RAG 知识库内容为最终依据。
4. 若 RAG 中确实没有该数据，直接说明，不要编造。"""
            else:
                system_prompt = f"""You are an intelligent data analysis assistant.
Answer the user's question directly from the RAG knowledge below.

[Reference Knowledge (RAG)]
{knowledge_context}

[Instructions]
1. Read BOTH [上文衔接] and [正文] sections carefully. HTML tables (<table>/<tr>/<td>) are valid data — parse ALL rows and columns without omission.
2. Give a direct factual answer. Do NOT generate Python code or describe analysis steps.
3. Do NOT rely on previous conversation answers — the current RAG content is the ground truth.
4. If the data is genuinely absent from RAG, say so clearly."""

            from agents.context_budget import ContextBudget
            budget = ContextBudget(provider=self.provider, model_name=self.model_name or "")
            trimmed_history, _ = budget.fit_messages(
                system=system_prompt,
                history=[{"role": m["role"], "content": m["content"]} for m in (history or [])],
                rag_context="",
                question=question,
            )
            messages = [
                {"role": "system", "content": system_prompt},
                *trimmed_history,
                {"role": "user", "content": question}
            ]

            print("📡 [Agent] RAG 事实查询路径，直接文字回答...")
            async for chunk in llm.astream(messages):
                content = chunk.content if hasattr(chunk, "content") else str(chunk)
                yield {"event": "summary", "data": {"content": content}}

            yield {"event": "done", "data": {}}
            return

        # ── 2b. 代码生成路径（有数据库 或 RAG + 分析需求）────────────────────
        if isinstance(df_input, dict):
            dataset_context = "【多表数据集变量】\n" if language == "zh" else "[Multi-table Dataset Variables]\n"
            for name, df in df_input.items():
                dataset_context += f"- `{name}`: {list(df.columns)} ({len(df)} rows)\n"
        elif rag_needs_code:
            dataset_context = (
                "【数据来源：无数据库】你必须从下方 RAG 知识库内容中提取具体数值，用代码构建 pandas DataFrame，然后直接生成可视化图表。严禁以文字描述可视化框架，必须输出可执行代码。"
                "RAG 内容中包含 HTML 表格时，必须解析所有行和列，不得以对话历史中的旧答案代替当前 RAG 内容。\n"
                if language == "zh"
                else "[Data Source: No database] You MUST extract specific numeric values from the RAG knowledge below, construct pandas DataFrames in code, and directly produce visualizations. Never describe a visualization framework — output executable code only. "
                "When RAG content contains HTML tables, parse ALL rows and columns. Do NOT rely on previous conversation answers — the current RAG content is the ground truth.\n"
            )
        else:
            dataset_context = f"变量 `df`: {list(df_input.columns)} ({len(df_input)}行)\n" if language == "zh" else f"Variable `df`: {list(df_input.columns)} ({len(df_input)} rows)\n"

        prev_code_context = ""
        if history:
            prev_codes = []
            for m in history:
                content = m.get("content", "")
                if m.get("role") == "assistant" and "```python" in content:
                    code = re.search(r"```python\n([\s\S]*?)```", content)
                    if code: prev_codes.append(code.group(1))
            if prev_codes:
                prev_code_context = "\n【历史执行代码】\n" if language == "zh" else "\n[Historical Execution Code]\n"
                prev_code_context += "\n".join(prev_codes)

        rag_section_zh = f"\n【参考知识库内容 (RAG)】\n{knowledge_context}\n" if knowledge_context else ""
        rag_section_en = f"\n[Reference Knowledge (RAG)]\n{knowledge_context}\n" if knowledge_context else ""

        rag_only_extra_zh = (
            '\n⚠️ **【强制执行——无数据库 RAG 分析模式】**\n'
            '当前没有数据库，所有数据必须从上方 RAG 知识库内容中提取并在代码中硬编码。\n'
            '**【HTML 表格解析（极重要）】**：RAG 内容中的 `[上文衔接]` 和 `[正文]` 两部分都必须仔细阅读。'
            '若 RAG 内容中包含 HTML 表格（`<table>`、`<tr>`、`<td>` 标签），**必须解析表格所有行和列的数据，绝对不能遗漏任何数据行**。'
            '不要只读正文叙述文字，表格中的数值同样是有效数据。'
            '**不要受对话历史中旧答案的影响，以当前 RAG 知识库内容为最终依据。**\n'
            '你的回复必须同时包含：\n'
            '① 文字分析说明（正常输出）\n'
            '② 一个完整的 ```python\\n...\\n``` 代码块，内容要求：\n'
            '   - 用 pd.DataFrame({"列名": [值1, 值2, ...]}) 把 RAG 中所有数值硬编码为 DataFrame\n'
            '   - 用 matplotlib/seaborn 绘制趋势图或预测图，显式调用 plt.show()\n'
            '   - 如有预测需求，用 numpy polyfit 或线性回归等方法实现，禁止只输出文字推断\n'
            '   - 把核心结论写入 summary_text 变量\n'
            '**绝对禁止只输出文字分析而没有代码块。** 缺少 ```python 代码块 = 任务失败。\n'
            if rag_needs_code else ""
        )
        rag_only_extra_en = (
            '\n⚠️ **[MANDATORY — No-Database RAG Analysis Mode]**\n'
            'No database is connected. All data MUST be extracted from the RAG content above and hard-coded in your code.\n'
            '**[HTML Table Parsing — CRITICAL]**: Read BOTH `[上文衔接]` and `[正文]` sections in the RAG content carefully. '
            'If the RAG content contains HTML tables (`<table>`, `<tr>`, `<td>` tags), **you MUST parse ALL rows and columns — never skip any data row**. '
            'Do not rely solely on narrative text; table values are equally valid data. '
            '**Do NOT be influenced by previous answers in conversation history — the current RAG content is the ground truth.**\n'
            'Your reply MUST contain both:\n'
            '① Text analysis explanation (normal output)\n'
            '② A complete ```python\\n...\\n``` code block that:\n'
            '   - Hard-codes all numeric values from RAG into DataFrames using pd.DataFrame({"col": [v1, v2, ...]})\n'
            '   - Draws at least one trend or forecast chart with matplotlib/seaborn, calls plt.show()\n'
            '   - For prediction tasks: implement regression or polyfit — never just describe a prediction in text\n'
            '   - Writes key conclusions into summary_text\n'
            '**Absolutely forbidden to output only text with no code block.** Missing ```python block = task failure.\n'
            if rag_needs_code else ""
        )

        if language == "zh":
            system_prompt = f"""你是一个顶尖的数据科学家。
【上下文】
{dataset_context}
{prev_code_context}
{rag_section_zh}
【核心指令】
{rag_only_extra_zh}1. **实时方案说明**：首先用中文流利地说明你的分析思路。
2. **强制绘图 (必须使用英文标签)**：只要涉及趋势、对比或分布分析，**必须**编写 Matplotlib/Seaborn 绘图代码，并显式调用 `plt.show()`。
   - **注意**：图表标题 (Title)、轴标签 (Axis Labels)、图例 (Legend) **必须使用英文**，以防字体缺失导致方块。
   - **布局规范（极重要）**：使用 `fig.suptitle()` 时，**必须**用 `plt.tight_layout(rect=[0, 0, 1, 0.94])` 而非 `plt.tight_layout()`，否则子图会被压缩至图片顶部，底部留白。若无 `suptitle`，使用 `plt.tight_layout()` 即可。`figsize` 高度至少为子图行数 × 4（例如 3 行 → `figsize=(15, 12)`）。
3. **代码实现**：将分析代码放在唯一的 ```python ... ``` 块中。
   - **语法要求**：严禁使用中文全角引号（如 ', ', ", "），所有 Python 字符串必须使用标准 ASCII 引号 (' 或 ")。
   - **Pandas 版本约束**：我们使用的是 Pandas 2.2.0+。**严禁使用废弃的频率别名 (如 'M', 'Q', 'Y')**。对于月末、季末、年末，**强制使用 'ME', 'QE', 'YE' 等新型 offsets 特性**。
   - **NumPy 广播约束（极重要）**：**严禁**在 `np.where(condition, x, y)` 中让 `x` 或 `y` 的长度与 `condition` 不一致。例如，给满足条件的子集填入渐变值，**必须**先创建全量数组再用布尔索引赋值：`arr = np.zeros(n); arr[mask] = np.linspace(0, 5, mask.sum())`，**严禁**写成 `arr = np.where(mask, np.linspace(0, 5, mask.sum()), 0)`（形状不匹配会直接崩溃）。
   - **浮点数格式约束（极重要）**：**严禁**对浮点数值使用 `':d'` 整数格式符（如 `f'{{value:d}}'`），这会导致 `ValueError: Unknown format code 'd' for object of type 'float'`。浮点数必须使用 `':.1f'`、`':.2f'`、`':g'` 或 `str(round(...))` 等格式。
   - 变量命名：使用 `df_xxx` 格式（RAG 模式下可自行用 `pd.DataFrame(...)` 构建）。
   - 最终数据 -> `result_data`。
   - 可视化配置 (ECharts) -> `viz_config` (标题和标签也必须是英文)。
   - 报告文本 -> `summary_text`。
3. **禁止事项**：
   - 严禁在 `summary_text` 中包含 `![...](data:...)` 这种图片字符串。
   - 严禁在文字说明中使用三重反引号。
"""
        else:
            system_prompt = f"""You are a top-tier Data Scientist.
[Context]
{dataset_context}
{prev_code_context}
{rag_section_en}
[Core Instructions]
{rag_only_extra_en}1. **Real-time Plan explanation**: Explain your analysis logic fluently in English first.
2. **Mandatory Plotting**: Whenever trend, comparison, or distribution analysis is involved, you **MUST** write Matplotlib/Seaborn plotting code and explicitly call `plt.show()`. Do not just provide a config dictionary.
   - **Layout Rule (CRITICAL)**: When using `fig.suptitle()`, you **MUST** call `plt.tight_layout(rect=[0, 0, 1, 0.94])` instead of plain `plt.tight_layout()`. Plain `tight_layout()` ignores suptitle and squashes all subplots into the top of the figure, leaving a large blank area below. Without suptitle, `plt.tight_layout()` is fine. Set `figsize` height to at least rows × 4 (e.g., 3 rows → `figsize=(15, 12)`).
3. **Code Implementation**: Put the analysis code in a unique ```python ... ``` block.
   - **Syntax**: Use standard ASCII quotes (' or ") for Python strings.
   - **Pandas Version Constraint**: We use Pandas 2.2.0+. **DO NOT** use deprecated frequency aliases like 'M', 'Q', or 'Y'. You **MUST** use 'ME' (Month End), 'QE' (Quarter End), 'YE' (Year End) instead.
   - **NumPy Broadcasting Constraint (CRITICAL)**: **NEVER** pass arrays of different lengths as the `x` or `y` arguments to `np.where(condition, x, y)`. To assign a linspace to a masked subset, pre-allocate and use boolean indexing: `arr = np.zeros(n); arr[mask] = np.linspace(0, 5, mask.sum())`. **NEVER** write `arr = np.where(mask, np.linspace(0, 5, mask.sum()), 0)` — this causes a shape mismatch crash.
   - **Float Format Constraint (CRITICAL)**: **NEVER** use the `':d'` integer format specifier on float values (e.g. `f'{{value:d}}'`) — this raises `ValueError: Unknown format code 'd' for object of type 'float'`. Always use `':.1f'`, `':.2f'`, `':g'`, or `str(round(...))` for floats.
   - Must use `df_xxx` variables.
   - Final data -> `result_data`.
   - Visualization config (ECharts) -> `viz_config`.
   - Report text -> `summary_text`.
3. **Prohibitions**:
   - DO NOT include `![...](data:...)` image strings in `summary_text`.
   - DO NOT use triple backticks within the text explanation.
"""

        from agents.context_budget import ContextBudget
        budget = ContextBudget(provider=self.provider, model_name=self.model_name or "")
        trimmed_history, _ = budget.fit_messages(
            system=system_prompt,
            history=[{"role": m["role"], "content": m["content"]} for m in (history or [])],
            rag_context="",
            question=question,
        )
        messages = [
            {"role": "system", "content": system_prompt},
            *trimmed_history,
            {"role": "user", "content": question}
        ]

        full_response = ""
        print("📡 [Agent] 发起流式请求...")

        MAX_RETRIES = 1
        exec_result = None
        ai_code = None

        for attempt in range(MAX_RETRIES + 1):
            full_response = ""
            if attempt > 0:
                print(f"📡 [Agent] 发起重试请求自我修复 (Attempt {attempt})...")

            async for chunk in llm.astream(messages):
                content = chunk.content if hasattr(chunk, "content") else str(chunk)
                full_response += content
                if attempt == 0:
                    yield {"event": "summary", "data": {"content": content}}

            code_match = re.search(r"```python\n([\s\S]*?)```", full_response)
            ai_code = code_match.group(1).strip() if code_match else None

            if not ai_code:
                if attempt == MAX_RETRIES:
                    yield {"event": "done", "data": {}}
                    return
                # rag_needs_code 模式未生成代码：追加强制指令重试
                if rag_needs_code:
                    force_msg = (
                        "你的上一次回复只有文字分析，没有输出任何 Python 代码。这是不允许的。\n"
                        "现在你必须立刻输出一个完整的 ```python\\n...\\n``` 代码块，要求：\n"
                        "1. 从上方 RAG 内容中把所有数值（价格、日期、百分比等）用 pd.DataFrame({...}) 硬编码到代码里\n"
                        "2. 用 matplotlib 绘制至少一张趋势或对比图，调用 plt.show()\n"
                        "3. 把分析结论写入 summary_text 变量\n"
                        "不要重复解释，直接给出可运行的代码。"
                    ) if language == "zh" else (
                        "Your previous reply contained only text analysis with no Python code block. This is not allowed.\n"
                        "You MUST now output a complete ```python\\n...\\n``` block that:\n"
                        "1. Hard-codes all numeric values (prices, dates, percentages) from the RAG content above using pd.DataFrame({...})\n"
                        "2. Draws at least one trend or comparison chart with matplotlib and calls plt.show()\n"
                        "3. Writes analysis conclusions into summary_text\n"
                        "No explanations — just runnable code."
                    )
                    messages.append({"role": "assistant", "content": full_response})
                    messages.append({"role": "user", "content": force_msg})
                continue

            exec_msg = "方案制定完成，正在执行深度计算..." if language == "zh" else "Plan completed, executing complex calculations..."
            if attempt > 0:
                exec_msg = "正在执行修复后的代码..." if language == "zh" else "Executing fixed code..."
            yield {"event": "thinking", "data": {"content": exec_msg}}

            exec_result = python_executor.execute_analysis(df_input, ai_code)

            if exec_result["success"]:
                break
            else:
                if attempt < MAX_RETRIES:
                    err_msg = exec_result['error']
                    warn_msg = f"代码运行出错，正在进行自我修复 ({attempt+1}/{MAX_RETRIES})..." if language == "zh" else f"Execution failed, self-correcting ({attempt+1}/{MAX_RETRIES})..."
                    yield {"event": "thinking", "data": {"content": warn_msg}}

                    messages.append({"role": "assistant", "content": full_response})
                    error_prompt = f"The code execution failed with this Python error:\n{err_msg}\nPlease fix the bug and output the complete corrected python code in a ```python\n...\n``` block."
                    messages.append({"role": "user", "content": error_prompt})
                else:
                    err_msg = f"执行出错: {exec_result['error']}" if language == "zh" else f"Execution Error: {exec_result['error']}"
                    yield {"event": "error", "data": {"message": err_msg}}
                    return

        if exec_result and exec_result["success"]:
            if exec_result["plot_image"]:
                yield {"event": "plot_ready", "data": {"image": exec_result["plot_image"]}}

            if exec_result["viz_config"]:
                yield {"event": "chart_ready", "data": {"option": exec_result["viz_config"]}}

            if exec_result["summary"]:
                report_text = exec_result["summary"]
                report_text = re.sub(r'!\[.*?\]\(data:image\/.*?;base64,.*?\)', '', report_text)
                discovery_tag = "**💡 核心发现：**" if language == "zh" else "**💡 Key Findings:**"
                yield {"event": "summary", "data": {"content": f"\n\n---\n{discovery_tag}\n{report_text}"}}

            payload = {
                "rows": exec_result["data"],
                "code": ai_code,
                "plot_image_base64": exec_result["plot_image"],
                "is_data_science": True,
                "can_generate_report": True
            }
            yield {"event": "execution_result", "data": payload}
            yield {"event": "done", "data": payload}

    async def generate_ai_title(self, question: str, provider: str = None, model_name: str = None, language: str = "zh") -> str:
        """生成极简的会话标题"""
        llm = llm_factory.get_langchain_model(provider=provider or self.provider, model_name=model_name or self.model_name, temperature=0)
        prompt_tmpl = get_prompt("SESSION_TITLE", language)
        prompt = prompt_tmpl.format(question=question)
        try:
            res = await llm.ainvoke(prompt)
            return res.content.strip()
        except:
            return "数据科学分析" if language == "zh" else "Data Science Analysis"

advanced_data_agent = AdvancedDataAgent()
