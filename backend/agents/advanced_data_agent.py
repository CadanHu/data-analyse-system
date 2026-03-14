import json
import re
import pandas as pd
from typing import Dict, Any, List, AsyncGenerator, Optional
from services.llm_factory import llm_factory
from services.python_executor import python_executor
from config import ModelProvider, DEFAULT_PROVIDER
from utils.logger import logger
from utils.prompt_templates import get_prompt

class AdvancedDataAgent:
    """
    AI Data Scientist Agent (v3.0) - 最终稳定版
    """
    
    def __init__(self, provider: str = None, model_name: str = None):
        self.provider = provider or DEFAULT_PROVIDER
        self.model_name = model_name
        
    async def process_analysis_flow(
        self, 
        df_input: Any, 
        question: str, 
        history: List[Dict[str, str]] = None,
        language: str = "zh"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        全链路分析流程：流式方案生成 + 静默代码执行
        """
        # 1. 准备上下文
        if isinstance(df_input, dict):
            dataset_context = "【多表数据集变量】\n" if language == "zh" else "[Multi-table Dataset Variables]\n"
            for name, df in df_input.items():
                dataset_context += f"- `{name}`: {list(df.columns)} ({len(df)} rows)\n"
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

        thinking_msg = "正在启动数据科学家引擎..." if language == "zh" else "Starting Data Scientist Engine..."
        yield {"event": "thinking", "data": {"content": thinking_msg}}
        
        if language == "zh":
            system_prompt = f"""你是一个顶尖的数据科学家。
【上下文】
{dataset_context}
{prev_code_context}

【核心指令】
1. **实时方案说明**：首先用中文流利地说明你的分析思路。
2. **强制绘图**：只要涉及趋势、对比或分布分析，**必须**编写 Matplotlib/Seaborn 绘图代码，并显式调用 `plt.show()`。不要只给出一个配置字典。
3. **代码实现**：将分析代码放在唯一的 ```python ... ``` 块中。
   - **语法要求**：严禁使用中文全角引号（如 ‘, ’, “, ”），所有 Python 字符串必须使用标准 ASCII 引号 (' 或 ")。
   - 必须使用 `df_xxx` 变量。
   - 最终数据 -> `result_data`。
   - 可视化配置 (ECharts) -> `viz_config`。
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

[Core Instructions]
1. **Real-time Plan explanation**: Explain your analysis logic fluently in English first.
2. **Mandatory Plotting**: Whenever trend, comparison, or distribution analysis is involved, you **MUST** write Matplotlib/Seaborn plotting code and explicitly call `plt.show()`. Do not just provide a config dictionary.
3. **Code Implementation**: Put the analysis code in a unique ```python ... ``` block.
   - **Syntax**: Use standard ASCII quotes (' or ") for Python strings.
   - Must use `df_xxx` variables.
   - Final data -> `result_data`.
   - Visualization config (ECharts) -> `viz_config`.
   - Report text -> `summary_text`.
3. **Prohibitions**:
   - DO NOT include `![...](data:...)` image strings in `summary_text`.
   - DO NOT use triple backticks within the text explanation.
"""

        llm = llm_factory.get_langchain_model(
            provider=self.provider, 
            model_name=self.model_name, 
            temperature=0.1,
            streaming=True 
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            *([{"role": m["role"], "content": m["content"]} for m in history[-6:]] if history else []),
            {"role": "user", "content": question}
        ]

        full_response = ""
        print("📡 [Agent] 发起流式请求...")
        
        # 🚀 恢复流式输出：让用户第一时间看到 AI 的分析方案
        async for chunk in llm.astream(messages):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            full_response += content
            yield {"event": "summary", "data": {"content": content}}

        # 提取并执行代码
        code_match = re.search(r"```python\n([\s\S]*?)```", full_response)
        ai_code = code_match.group(1).strip() if code_match else None

        if ai_code:
            exec_msg = "方案制定完成，正在执行深度计算..." if language == "zh" else "Plan completed, executing complex calculations..."
            yield {"event": "thinking", "data": {"content": exec_msg}}
            exec_result = python_executor.execute_analysis(df_input, ai_code)
            
            if not exec_result["success"]:
                err_msg = f"执行出错: {exec_result['error']}" if language == "zh" else f"Execution Error: {exec_result['error']}"
                yield {"event": "error", "data": {"message": err_msg}}
                return

            # 发送图表
            if exec_result["plot_image"]:
                yield {"event": "plot_ready", "data": {"image": exec_result["plot_image"]}}
            
            if exec_result["viz_config"]:
                yield {"event": "chart_ready", "data": {"option": exec_result["viz_config"]}}
            
            # 发送代码运行后的追加总结 (如果有)
            if exec_result["summary"]:
                report_text = exec_result["summary"]
                # 🚀 强力过滤：剔除任何嵌入的图片标记，防止前端裂开
                report_text = re.sub(r'!\[.*?\]\(data:image\/.*?;base64,.*?\)', '', report_text)
                discovery_tag = "**💡 核心发现：**" if language == "zh" else "**💡 Key Findings:**"
                yield {"event": "summary", "data": {"content": f"\n\n---\n{discovery_tag}\n{report_text}"}}
            
            yield {"event": "done", "data": {
                "result": exec_result["data"], 
                "code": ai_code,
                "plot_image_base64": exec_result["plot_image"]
            }}
        else:
            yield {"event": "done", "data": {}}

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
