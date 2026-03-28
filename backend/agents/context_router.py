"""
查询意图感知的动态上下文路由器 (Context Router)

在 schema 加载之前，用零延迟启发式规则预判问题意图，
决定哪些上下文组件需要注入 prompt，避免对明显闲聊问题做无效 DB 查询。

设计原则：
  - 纯字符串规则，无 LLM 调用，延迟为 0
  - 保守判定：不确定时默认 needs_schema=True，绝不误伤正常数据查询
  - 结果仅用于优化，不影响已有的 LLM 意图分类逻辑

调用方：sql_agent.SQLAgent.process_question_with_history()
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Set


# ─── 闲聊关键词（命中即倾向于 chitchat）───────────────────────────────────────

# 纯问候 / 道别
# ⚠️ 不能包含 "好的"/"ok"/"okay"/"明白"/"收到"/"继续" 等词——
#   这些词同时也是用户确认执行分析方案的信号词，跳过 schema 会导致 SQL 执行失败。
_GREETING_PATTERNS = {
    # 中文问候
    "你好", "您好", "你好呀", "您好呀", "你好啊", "您好啊",
    "哈喽", "嗨", "嗨呀", "哟", "嘿",
    "早上好", "早安", "早", "上午好", "中午好", "下午好", "晚上好", "晚安",
    "新年好", "节日快乐", "生日快乐",
    # 中文道别
    "再见", "拜拜", "拜", "回头见", "下次见", "下次聊", "以后再聊",
    "先这样", "先走了", "告辞", "溜了", "88", "886",
    # 中文感谢
    "谢谢", "谢谢你", "谢谢您", "谢了", "感谢", "感谢你", "感谢您",
    "多谢", "多谢了", "非常感谢", "太感谢了", "辛苦了", "麻烦你了",
    # 英文问候
    "hi", "hello", "hey", "howdy", "greetings",
    "good morning", "good afternoon", "good evening", "good night",
    # 英文道别
    "bye", "goodbye", "good bye", "see you", "see ya", "later",
    "take care", "have a good day", "have a nice day", "farewell",
    # 英文感谢
    "thanks", "thank you", "thx", "ty", "thank u",
    "many thanks", "thanks a lot", "thanks so much",
}

# 询问 AI 自身（子串匹配）
_SELF_INQUIRY_PATTERNS = {
    # 中文 — 身份
    "你是谁", "你叫什么", "你叫什么名字", "你的名字", "你叫啥",
    "你是什么", "你是ai", "你是人工智能", "你是机器人", "你是真人吗", "你是人吗",
    # 中文 — 能力
    "你能做什么", "你能帮我做什么", "你有什么功能", "你能做啥",
    "你擅长什么", "你会什么", "你能帮什么忙", "你的功能",
    "你能干嘛", "你能干什么", "你有哪些功能",
    # 中文 — 介绍
    "介绍一下你自己", "介绍你自己", "介绍下你", "说说你自己",
    "你好吗", "你还好吗", "你最近怎样",
    # 英文 — 身份
    "who are you", "what are you", "your name", "what is your name",
    "are you an ai", "are you a robot", "are you human", "are you real",
    "are you chatgpt", "are you claude", "are you gpt",
    # 英文 — 能力
    "what can you do", "what do you do", "how can you help",
    "what are your capabilities", "what are your features",
    "how does this work", "how do you work",
    # 英文 — 介绍
    "tell me about yourself", "introduce yourself",
    "how are you", "how are you doing",
}

# 纯概念解释触发词（问题以这些词开头）
_CONCEPT_PREFIXES = {
    # 中文
    "什么是", "解释一下", "帮我解释", "定义一下", "讲解一下",
    "讲一下", "讲讲", "说说", "介绍一下", "简单介绍",
    "怎么理解", "如何理解", "怎样理解",
    "帮我科普", "科普一下", "给我讲讲", "给我说说",
    "请问什么是", "请解释",
    # 英文
    "what is", "what are", "what's", "what're",
    "explain", "explain what", "explain how", "explain why",
    "define", "definition of", "describe", "description of",
    "tell me what", "tell me about",
    "meaning of", "what does", "what do",
    "how does", "how do", "why is", "why are",
    "can you explain", "could you explain", "please explain",
}

# ─── 宏观问题关键词（命中则触发社区摘要全局搜索）────────────────────────────
# 这类问题问的是整体概况，社区摘要比实体遍历更适合回答

_GLOBAL_GRAPH_KEYWORDS: Set[str] = {
    # 中文 — 整体概况
    "整体", "全局", "概述", "总结", "概括", "总体", "全文", "整篇",
    "主要内容", "主要讲", "主要说", "主要关系", "核心内容", "核心主题",
    "都有哪些", "有哪些实体", "涉及哪些", "涉及什么", "包含哪些",
    "整体上", "宏观", "全部关系", "所有关系",
    # 英文 — holistic questions
    "overview", "summarize", "overall", "holistic", "main topics",
    "key themes", "what is this about", "general picture",
    "all entities", "all relationships", "big picture",
}

# ─── 关系型关键词（命中则触发知识图谱检索）──────────────────────────────────
# 这类问题问的是实体间的关系，图谱比向量更精准

_GRAPH_KEYWORDS: Set[str] = {
    # 中文 — 关系询问
    "供应商", "合作方", "合作伙伴", "竞争对手", "关联方",
    "子公司", "母公司", "控股", "持股", "股东", "投资方", "被投",
    "上级", "下级", "隶属", "归属", "属于",
    "的关系", "之间的关系", "有什么关系", "什么关系", "关系是什么",
    "谁供应", "谁合作", "谁投资", "谁控股", "谁管理",
    "负责人是谁", "谁负责", "由谁", "谁主管",
    # 英文 — 关系询问
    "supplier", "partner", "competitor", "subsidiary", "parent company",
    "shareholder", "investor", "relationship between", "related to",
    "who supplies", "who owns", "who manages", "belongs to",
    "affiliated with", "connected to",
}

# ─── 数据关键词（命中则强制 needs_schema=True）────────────────────────────────

_DATA_KEYWORDS: Set[str] = {
    # 业务实体
    "销售", "订单", "客户", "用户", "库存", "金额", "收入", "利润", "成本",
    "产品", "商品", "员工", "部门", "渠道", "地区", "门店", "供应商",
    "交易", "合同", "发票", "账单", "报表", "报告", "统计", "汇总",
    # 时间维度（业务分析常见）
    "同比", "环比", "增长", "下降", "趋势", "月度", "季度", "年度",
    "上个月", "本月", "上季度", "本季度", "去年", "今年",
    # 数据操作词
    "数据", "查询", "查一下", "查看", "统计", "计算", "分析", "汇总", "对比",
    "排名", "排行", "top", "最多", "最少", "最高", "最低", "平均",
    # SQL / 技术词
    "select", "where", "group by", "order by", "join", "sql",
    "表", "字段", "列", "行", "数据库", "数据表",
    # 英文业务词
    "sales", "order", "revenue", "profit", "customer", "product",
    "inventory", "employee", "department", "transaction",
}

# ─── ContextProfile ─────────────────────────────────────────────────────────

@dataclass
class ContextProfile:
    """
    描述当前问题需要哪些上下文组件。

    字段：
        needs_schema    是否需要加载完整 DB schema（False 时跳过 DB 查询）
        schema_level    schema 详细程度（预留扩展："full" | "none"）
        needs_history   是否注入对话历史
        needs_graph     是否需要知识图谱检索（关系型问题触发）
        intent_hint     推断的意图标签（调试 / 日志用）
        prompt_template 应使用的 prompt 模板 key
    """
    needs_schema: bool = True
    schema_level: str = "full"          # "full" | "none"
    needs_history: bool = True
    needs_graph: bool = False           # 是否触发本地 GraphRAG 实体遍历
    needs_global_graph: bool = False    # 是否触发全局社区摘要搜索（宏观问题）
    intent_hint: str = "unknown"        # "chitchat" | "data" | "graph_relation" | "global_graph" | "unknown"
    prompt_template: str = "CHAT_RESPONSE"


# ─── 规则引擎 ────────────────────────────────────────────────────────────────

def get_context_profile(
    question: str,
    force_chat: bool = False,
) -> ContextProfile:
    """
    零延迟意图预判，返回 ContextProfile。

    判断逻辑（保守原则：不确定时默认 needs_schema=True）：
      1. 先检查是否含数据关键词 → 若命中，直接判定 data，立即返回
      2. 再检查是否为明确闲聊模式（问候 / 自我询问 / 概念解释）→ 判定 chitchat
      3. 其余情况 → unknown，保守按 data 处理

    Args:
        question:   用户输入的原始问题文本
        force_chat: 前端明确选择"不使用数据库"模式

    Returns:
        ContextProfile
    """
    q_lower = question.lower().strip()
    q_clean = re.sub(r"\s+", "", q_lower)  # 去除空格，方便中文匹配

    # ── 1a. 宏观问题关键词命中 → 触发全局社区摘要搜索 ──────────────────────
    for kw in _GLOBAL_GRAPH_KEYWORDS:
        if kw in q_clean or kw in q_lower:
            return ContextProfile(
                needs_schema=False,
                schema_level="none",
                needs_graph=False,
                needs_global_graph=True,
                intent_hint="global_graph",
                prompt_template="CHAT_RESPONSE",
            )

    # ── 1b. 关系型关键词命中 → 触发图谱检索（同时保留 schema 以备 SQL）──────
    for kw in _GRAPH_KEYWORDS:
        if kw in q_clean or kw in q_lower:
            return ContextProfile(
                needs_schema=True,
                needs_graph=True,
                intent_hint="graph_relation",
                prompt_template="CHAT_RESPONSE",
            )

    # ── 1b. 数据关键词命中 → 必须加载 schema ──────────────────────────────────
    for kw in _DATA_KEYWORDS:
        if kw in q_clean or kw in q_lower:
            return ContextProfile(
                needs_schema=True,
                intent_hint="data",
                prompt_template="CHAT_RESPONSE",
            )

    # ── 2. force_chat 且无数据词 → 可能是对已有结果的追问，保留 schema ──────
    # 注：force_chat 只控制跳过意图分类，不能跳过 schema（用户可能在追问 DB 结果）
    # 因此 force_chat 时仍保守返回 needs_schema=True
    if force_chat:
        return ContextProfile(
            needs_schema=True,
            intent_hint="unknown",
            prompt_template="CHAT_RESPONSE",
        )

    # ── 3. 纯问候 ─────────────────────────────────────────────────────────────
    if q_clean in {re.sub(r"\s+", "", p) for p in _GREETING_PATTERNS}:
        return ContextProfile(
            needs_schema=False,
            schema_level="none",
            intent_hint="chitchat",
            prompt_template="CHAT_SIMPLE_RESPONSE",
        )

    # ── 4. 询问 AI 自身 ───────────────────────────────────────────────────────
    # q_clean 去除了空格（适合中文），q_lower 保留空格（适合英文多词短语）
    for pattern in _SELF_INQUIRY_PATTERNS:
        if pattern in q_clean or pattern in q_lower:
            return ContextProfile(
                needs_schema=False,
                schema_level="none",
                intent_hint="chitchat",
                prompt_template="CHAT_SIMPLE_RESPONSE",
            )

    # ── 5. 纯概念解释（以概念前缀开头且较短） ──────────────────────────────
    #    限制问题长度 < 40 字，避免把"什么是销售增长的原因？"误判为闲聊
    if len(question) < 40:
        for prefix in _CONCEPT_PREFIXES:
            if q_clean.startswith(prefix) or q_lower.startswith(prefix):
                return ContextProfile(
                    needs_schema=False,
                    schema_level="none",
                    intent_hint="chitchat",
                    prompt_template="CHAT_SIMPLE_RESPONSE",
                )

    # ── 6. 默认：保守按 data 处理 ─────────────────────────────────────────────
    return ContextProfile(
        needs_schema=True,
        intent_hint="unknown",
        prompt_template="CHAT_RESPONSE",
    )
