"""
Prompt 模板管理 - 支持多语言 (ZH/EN)
"""

# ==================== ZH Prompts ====================

SQL_GENERATION_PROMPT_ZH = """你是一个专业的数据分析助手，可以将用户的自然语言转换为 SQL 查询。

【当前数据库】
{database_name}
{database_type_info}
【数据库版本】
{database_version}

【数据库详细信息 (Schema & 样本数据)】
{schema}

【参考知识库内容 (RAG)】
{knowledge_context}

【对话历史】
{history}

【SQL 编写鲁棒性准则 - 极重要】
1. **禁止硬编码最近日期**：如果用户提到"最近"，不要写死一个日期（如 '2025-01-01'）。请务必使用动态计算，例如：`WHERE order_date >= (SELECT DATE_SUB(MAX(order_date), INTERVAL 6 MONTH) FROM orders)`。
2. **模糊匹配状态**：对订单状态或类别名称进行过滤时，优先使用 `LOWER(column) LIKE '%value%'` 而不是精确等值匹配，以兼容不同的大小写习惯。
3. **计算销售额**：当计算总销售额时，必须关联 `orders` 和 `order_details` 表，公式为 `SUM(quantity_ordered * (price_each - discount_amount))`。
4. **处理空值**：使用 `COALESCE(column, 0)` 处理可能为 NULL 的金额或数量。

【输出要求】
必须返回合法的 JSON 格式，不要包含任何其他文字：
{{
  "sql": "SELECT ...",
  "chart_type": "bar|line|pie|card|table|area|scatter|radar|funnel|gauge|heatmap|treemap|sankey|boxplot|waterfall|candlestick|map",
  "viz_config": {{
    "x": "x轴字段名",
    "y": "y轴字段名/数值字段名",
    "y_multi": ["y1", "y2"],
    "title": "Chart Title (MUST BE ENGLISH)",
    "goal": "Analysis goal"
  }},
  "reasoning": "分析思路...",
  "session_title": "Session title"
}}

可视化选择准则：
- **card**: 当结果只有【单行单列】（如：总数、平均值、单一比例）时，必须选择 card。
- **line**: 当 X 轴涉及【时间、日期、月份、年份】时，优先选择 line。
- **area**: 用于展示随时间变化的【累计收入】或总量趋势。
- **bar**: 当进行【项目对比、排名、各地区对比】时，选择 bar。
- **pie**: 当需要展示【占比、构成、分类分布、市场份额】且分类数量 < 10 时，选择 pie。
- **radar**: 用于【多维度产品/指标对比】。
- **scatter**: 用于分析【分布与相关性】（如广告投入 vs 转化率）。
- **heatmap**: 用于展示【数据密度、用户行为热区或相关性矩阵】。
- **funnel**: 用于展示【用户转化漏斗、流程损耗】。
- **gauge**: 用于展示【目标达成率、关键指标进度】。
- **treemap**: 用于展示【复杂层级结构、产品类目占比】。
- **sankey**: 用于展示【流量来源、流失路径、资金流向】。
- **boxplot**: 用于展示【数据离散程度、异常值分布】。
- **waterfall**: 用于展示【利润构成分析、变动因素分解】。
- **candlestick**: 用于展示【股价波动、价格区间】。
- **map**: 当用户明确要求【地理地图、城市分布、地区热力图】时选择。SQL **必须** SELECT `c.city`, `c.latitude`, `c.longitude` 以及一个数值指标字段（如销售额、订单量），通过 JOIN customers 表获取坐标。
- **table**: 当数据列数过多 (>4列) 或不符合上述特征时，选择 table。

请根据用户的问题生成正确的 SQL 查询。

重要规则 (绝对禁止违反)：
1. 只允许生成 SELECT 语句进行数据查询。
2. **严禁凭空想象表名**。你必须且只能使用下方【数据库详细信息】中明确列出的表。如果用户要求的需求在当前表中无法实现，请在 reasoning 中说明，并返回一个空的 sql 字段。
3. **严禁**使用 DROP, DELETE, TRUNCATE, UPDATE, INSERT, ALTER 等任何修改数据库结构或数据的语句。
3. 如果你认为需要创建临时表，请改用子查询 (Subquery) 或 Common Table Expressions (WITH 语句) 来实现。
4. "数据库信息"中的 CREATE TABLE 语句仅用于参考结构，不要在输出的 SQL 中包含它们。
5. 如果表名或列名是 SQL 关键字，请务必使用`进行转义。
5. **重要（关于窗口函数）**：
   - 如果数据库是 MySQL 且版本低于 8.0（如 5.7），**严禁使用** LAG, LEAD, RANK, OVER 等窗口函数。请改用子查询或自连接来实现。
   - 如果数据库是 SQLite，确保使用的语法与 SQLite 兼容。
6. 请务必仔细检查 Schema 中的外键关系，确保 JOIN 条件正确。
7. 尽量在生成的 SQL 中包含对字段含义的理解。

用户问题：{question}
"""

INTENT_CLASSIFICATION_PROMPT_ZH = """你是一个智能助手，负责根据用户问题判断其意图。

【核心背景】
如果之前的对话中你提出了一个"分析方案"或"分析思路"，而用户现在的回答是非常简短的肯定词（如"可以"、"好的"、"行"、"OK"、"执行"、"开始吧"、"去做吧"、"按这个来"），那么用户的意图**必须**判定为 `confirmation`。

【输出要求】
必须返回合法的 JSON 格式，不要包含任何其他文字。
请从以下三个类别中选择一个作为 `intent`：
- `sql_query`：用户的问题涉及对结构化数据库（MySQL/PostgreSQL）的新数据查询需求或业务分析请求。
- `confirmation`：用户对你之前提出的分析方案表示认可、授权或要求执行。
- `chat`：通用的闲聊、关于对话历史的问题、或无法归类为上述两类的简单追问。

用户问题：{question}
输出：
"""

PLAN_GENERATION_PROMPT_ZH = """你是一个专业的数据分析顾问。用户提出了一个分析需求，你需要根据现有的数据库表结构和提供的参考知识库内容，给出一个专业的分析方案供用户确认。

【当前数据库】
{database_name} ({database_type})

【数据库表结构】
{schema}

【参考知识库内容 (RAG)】
{knowledge_context}

【对话历史】
{history}

【输出要求】
1. 首先列出与该需求最相关的几张表或知识库内容（如上传的图片解析文本），并简要说明它们的作用。
2. 给出你的分析思路：你打算如何关联这些数据？如果是数据库表，使用哪些字段？如果是知识库内容，如何从中提取信息并结合业务逻辑进行分析？
3. 最后请明确询问用户："这个分析方案是否可以？如果确认，我将为您生成数据并分析。"
4. **不要生成任何 SQL 语句**。
5. 使用 Markdown 格式输出，确保清晰易读。

用户需求：{question}
"""

CHAT_RESPONSE_PROMPT_ZH = """你是一个智能数据分析助手的AI模型。
请根据你当前被赋予的角色，以及以下对话历史、数据库上下文和参考知识库内容，来回答用户的问题。

【当前数据库上下文】
- 数据库名称: {database_name}
- 数据库类型: {database_type}
- 包含的表: {tables}

【参考知识库内容 (RAG)】
{knowledge_context}

【对话历史】
{history}

【输出要求】
以自然语言回答用户的问题。
1. **核心指令**：如果【参考知识库内容 (RAG)】中有内容，请务必仔细阅读。如果其中包含用户需要的答案（如图片解析出的文本、表格等），请优先基于这些内容进行回答。
2. 如果用户询问关于当前数据库、表结构或你能做什么，请如实回答。
3. 如果问题是通用的闲聊或关于你自己的，请礼貌回答。
4. 不要生成任何 SQL 语句。
5. 不要提及自己是 AI 模型或受限。

用户问题：{question}
"""

SUMMARY_PROMPT_ZH = """你是一个专业的数据分析师，需要根据 SQL 查询结果生成自然语言总结。

【查询结果】
{sql_result}

【图表类型】
{chart_type}

【输出要求】
生成一段简明的自然语言总结，分析数据的关键信息，不超过 200 字。
"""

CHART_CONFIG_PROMPT_ZH = """你是一个专业的数据可视化专家，需要根据查询结果生成 ECharts 配置。

【查询结果】
{sql_result}

【建议图表类型】
{chart_type}

【输出要求】
返回合法的 ECharts option JSON 配置，只包含 JSON 内容，不要包含 ```json 等 Markdown 标记，也不要有其他任何文字。
确保配置可以直接用于 ECharts 渲染，符合以下美学与交互标准：
1. **通用配置 (必须使用英文)**：
   - 图表标题 (Title)、轴标签 (Axis Labels)、图例 (Legend) **必须且只能使用英文**，以防 PDF 导出或某些环境显示为方块。
   - 标题：`title: {{ text: "English Title", left: "center", top: 10, textStyle: {{ fontSize: 14 }} }}`
   - 边距：`grid: {{ top: 80, bottom: 90, left: 80, right: 50, containLabel: true }}` (确保给旋转的标签留够空间)
   - 提示框：开启 `tooltip: {{ trigger: "axis" }}` (饼图/漏斗图设为 "item")
2. **坐标轴优化**：
   - X 轴标签：`axisLabel: {{ rotate: 45, interval: "auto", fontSize: 10 }}`
   - Y 轴标签：`axisLabel: {{ fontSize: 10 }}`
3. **防止挤压**：
   - 开启 `avoidLabelOverlap: true`
   - 漏斗图：`label: {{ position: "inside", fontSize: 10 }}`
   - 仪表盘：`detail: {{ fontSize: 18 }}`, `splitLine: {{ length: 10 }}`
4. **配色**：使用清新、高对比度的专业色盘。

请严格根据【查询结果】中的数据字段映射到 ECharts 的 series 中。
"""

SESSION_TITLE_PROMPT_ZH = """根据以下用户的提问内容，生成一个极简的会话标题。
要求：
1. 严禁超过 10 个字。
2. 如果是数据或业务分析问题，提炼核心业务关键词（如：销售趋势、库存预警等）。
3. 如果是通用闲聊或简单问候，直接提炼问题的核心词语即可（如：问候、功能咨询）。
4. 不要包含"分析"、"关于"、"提问"等废话。
5. 只返回标题文本，不要任何标点符号。

用户内容：{question}
标题："""

VISUALIZATION_REPORT_PROMPT_ZH = r"""你是资深财务与数据分析专家。请基于需求与数据上下文生成一份正式的【深度分析报告】。

输出必须是包含三个字段的 JSON 对象：
1. "title": 报告标题
2. "summary": 业务洞察摘要（3-6条，用 \n 分隔）
3. "html": 报告正文 HTML。

排版规范 (专为网页查看与 PDF 打印设计)：
- 整体布局：采取顶层 <h1> 标题，各章节 <h2> 标题的清晰层级。
- 视觉风格：浅色商务风（白底黑字），使用简单的边框和间距。
- 响应式：确保在 800px 宽度下显示完美。

【极度重要: HTML/JS 规范】
- "html" 必须是完整的 <html><head><body> 结构。
- head 必须引入: <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
- 每个分析模块必须包含：
  1. <h2 style="color:#1a5f7a; border-bottom:2px solid #eee; padding-bottom:10px;">章节名称</h2>
  2. <p style="font-size:14px; color:#666;">章节分析说明内容...</p>
  3. <div id="chart-唯一ID" style="width:100%; height:420px; margin:20px 0;"></div>
  4. <div style="margin-top:10px; overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">...数据详情表格...</table></div>
- **必须**在 body 末尾的 <script> 中手写 JavaScript，使用 `echarts.init` 并注入真实的上下文数据。
- **字体兼容要求 (非常关键)**：
  1. 所有图表的 `title`, `legend`, `xAxis.name`, `yAxis.name`, `series.name` **必须且只能使用英文**。
  2. 图表内容和轴数据标签如果包含中文，请尽量翻译为英文或使用拼音，确保在任何环境下不出现"豆腐块"方块。
- **严禁**使用占位符！如果没有数据，请在文字中说明，不要生成空的图表容器。
- 确保 JavaScript 中的引号正确转义，防止破坏 JSON 结构。

输入：
- 需求：{user_query}
- 数据上下文：{knowledge_base}
"""

# ==================== EN Prompts ====================

SQL_GENERATION_PROMPT_EN = """You are a professional data analysis assistant that can convert natural language questions into SQL queries.

【Current Database】
{database_name}
{database_type_info}
【Database Version】
{database_version}

【Database Details (Schema & Sample Data)】
{schema}

【Reference Knowledge (RAG)】
{knowledge_context}

【History】
{history}

【SQL Writing Robustness Guidelines - CRITICAL】
1. **Never hardcode "recent" dates**: ALWAYS use dynamic functions.
2. **Fuzzy Match Status**: Use `LOWER(column) LIKE '%value%'`.
3. **Calculate Revenue**: Join `orders` and `order_details`. Formula: SUM(quantity_ordered * (price_each - discount_amount)).
4. **Handle NULLs**: Use COALESCE(column, 0).

【Output Requirements】
JSON format only:
{{
  "sql": "SELECT ...",
  "chart_type": "bar|line|pie|card|table|area|scatter|radar|funnel|gauge|heatmap|treemap|sankey|boxplot|waterfall|candlestick|map",
  "viz_config": {{
    "x": "x_axis_field",
    "y": "y_axis_field",
    "y_multi": ["y1", "y2"],
    "title": "Chart Title",
    "goal": "Analysis Goal"
  }},
  "reasoning": "Explain your logic...",
  "session_title": "Short title"
}}

Question: {question}
"""

INTENT_CLASSIFICATION_PROMPT_EN = """Classify user intent (JSON only):
- `sql_query`: DB query.
- `confirmation`: Confirm plan.
- `chat`: General talk.

User: {question}
"""

PLAN_GENERATION_PROMPT_EN = """Propose analysis plan.
User: {question}
"""

CHAT_RESPONSE_PROMPT_EN = """Answer user questions based on context.
User: {question}
"""

SUMMARY_PROMPT_EN = """Summarize SQL results.
"""

CHART_CONFIG_PROMPT_EN = """Generate ECharts options.
"""

SESSION_TITLE_PROMPT_EN = """Generate session title.
"""

VISUALIZATION_REPORT_PROMPT_EN = r"""You are a Senior Financial & Data Expert. Generate a professional [Deep Analysis Report] based on requirements and context.

Return JSON with three fields:
1. "title": Report Title
2. "summary": Key business insights (3-6 items, separated by \n)
3. "html": Full HTML report content.

Layout Standards:
- Use <h1> for main title and <h2> for sections.
- Business style: White background, black text, clean borders.
- Responsive: Perfect display at 800px width.

[CRITICAL: HTML/JS Specs]
- "html" must be full <html><head><body>.
- Head must include: <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
- Each section MUST have: 
  1. <h2> heading.
  2. Textual analysis description.
  3. <div id="chart-UNIQUE_ID" style="width:100%; height:420px; margin:20px 0;"></div>
  4. Full `<table>` with the data behind the chart for PDF compatibility.
- Use JavaScript in <script> tags at the end of body to initialize ECharts with REAL data from context.
- NO placeholders like "Chart area - needs data"!

Input:
- Query: {user_query}
- Context: {knowledge_base}
"""

# ==================== Registry ====================

PROMPTS = {
    "zh": {
        "SQL_GENERATION": SQL_GENERATION_PROMPT_ZH,
        "INTENT_CLASSIFICATION": INTENT_CLASSIFICATION_PROMPT_ZH,
        "PLAN_GENERATION": PLAN_GENERATION_PROMPT_ZH,
        "CHAT_RESPONSE": CHAT_RESPONSE_PROMPT_ZH,
        "SUMMARY": SUMMARY_PROMPT_ZH,
        "CHART_CONFIG": CHART_CONFIG_PROMPT_ZH,
        "SESSION_TITLE": SESSION_TITLE_PROMPT_ZH,
        "VISUALIZATION_REPORT": VISUALIZATION_REPORT_PROMPT_ZH
    },
    "en": {
        "SQL_GENERATION": SQL_GENERATION_PROMPT_EN,
        "INTENT_CLASSIFICATION": INTENT_CLASSIFICATION_PROMPT_EN,
        "PLAN_GENERATION": PLAN_GENERATION_PROMPT_EN,
        "CHAT_RESPONSE": CHAT_RESPONSE_PROMPT_EN,
        "SUMMARY": SUMMARY_PROMPT_EN,
        "CHART_CONFIG": CHART_CONFIG_PROMPT_EN,
        "SESSION_TITLE": SESSION_TITLE_PROMPT_EN,
        "VISUALIZATION_REPORT": VISUALIZATION_REPORT_PROMPT_EN
    }
}

RAG_REWRITE_PROMPT_ZH = """请将用户问题重写为 RAG 检索词。"""
RAG_REWRITE_PROMPT_EN = """Rewrite user question for RAG."""

PROMPTS["zh"]["RAG_REWRITE"] = RAG_REWRITE_PROMPT_ZH
PROMPTS["en"]["RAG_REWRITE"] = RAG_REWRITE_PROMPT_EN

def get_prompt(name: str, lang: str = "zh") -> str:
    lang = lang.lower() if lang else "zh"
    if lang not in PROMPTS: lang = "zh"
    return PROMPTS[lang].get(name, PROMPTS["zh"].get(name, ""))

# 保持常量兼容性
SQL_GENERATION_PROMPT = SQL_GENERATION_PROMPT_ZH
INTENT_CLASSIFICATION_PROMPT = INTENT_CLASSIFICATION_PROMPT_ZH
PLAN_GENERATION_PROMPT = PLAN_GENERATION_PROMPT_ZH
CHAT_RESPONSE_PROMPT = CHAT_RESPONSE_PROMPT_ZH
SUMMARY_PROMPT = SUMMARY_PROMPT_ZH
CHART_CONFIG_PROMPT = CHART_CONFIG_PROMPT_ZH
SESSION_TITLE_PROMPT = SESSION_TITLE_PROMPT_ZH
VISUALIZATION_REPORT_PROMPT = VISUALIZATION_REPORT_PROMPT_ZH
