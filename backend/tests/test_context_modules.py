"""
四大上下文优化模块集成测试

无需启动后端服务，直接导入模块测试核心逻辑。

覆盖：
  模块一：ContextBudget  — 上下文预算管理器
  模块二：HistorySummarizer — 历史摘要压缩器（不调用 LLM，测同步逻辑）
  模块三：Reranker        — 多因子重排器
  模块四：ContextRouter   — 动态上下文路由器

运行方式：
  cd backend
  python -m pytest tests/test_context_modules.py -v
  # 或直接运行：
  python tests/test_context_modules.py
"""

import sys
import os
import time
import math
import asyncio

# ── 路径设置：让 backend/ 下的模块可直接 import ────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ══════════════════════════════════════════════════════════════════════════════
# 通用工具
# ══════════════════════════════════════════════════════════════════════════════

_PASS = "✅ PASS"
_FAIL = "❌ FAIL"
_results = []   # (test_name, passed, detail)


def check(name: str, condition: bool, detail: str = ""):
    icon = _PASS if condition else _FAIL
    _results.append((name, condition, detail))
    print(f"  {icon}  {name}" + (f"  [{detail}]" if detail else ""))
    return condition


# ══════════════════════════════════════════════════════════════════════════════
# 模块一：ContextBudget
# ══════════════════════════════════════════════════════════════════════════════

def test_context_budget():
    print("\n" + "═" * 60)
    print("模块一：ContextBudget — 统一上下文预算管理器")
    print("═" * 60)

    from agents.context_budget import ContextBudget, get_context_limit, estimate_tokens

    # ── 1.1 模型窗口识别 ──────────────────────────────────────────────────────
    print("\n[1.1] 模型窗口识别")
    cases = [
        ("deepseek", "deepseek-chat",    64_000),
        ("deepseek", "deepseek-reasoner",64_000),
        ("openai",   "gpt-4o",           128_000),
        ("openai",   "gpt-4.1-turbo",    1_000_000),
        ("gemini",   "gemini-2.5-pro",   1_000_000),
        ("claude",   "claude-sonnet-4-6",200_000),
        ("qwen",     "qwq-32b",          131_072),
        ("unknown",  "mystery-model",    16_000),   # fallback
    ]
    for provider, model, expected in cases:
        got = get_context_limit(provider, model)
        check(f"{provider}/{model} → {expected:,}", got == expected,
              f"got={got:,}")

    # ── 1.2 Token 估算 ────────────────────────────────────────────────────────
    print("\n[1.2] estimate_tokens")
    check("空字符串 → 0",   estimate_tokens("") == 0)
    check("纯英文 4 chars → 1", estimate_tokens("abcd") == 1)
    # 300 chars → 100 tokens
    check("300 chars → 100", estimate_tokens("a" * 300) == 100)

    # ── 1.3 fit_messages：无需裁剪时原样返回 ──────────────────────────────────
    print("\n[1.3] fit_messages — 正常范围内不裁剪")
    budget = ContextBudget(provider="deepseek", model_name="deepseek-chat")
    system = "你是一个数据分析助手。"
    history = [
        {"role": "user",      "content": "你好"},
        {"role": "assistant", "content": "您好，有什么可以帮您？"},
    ]
    rag = "- 2024年销售额为100万\n- 订单量为500单"
    question = "请汇总今年的销售情况"
    h, r = budget.fit_messages(system, history, rag, question)
    check("history 不应裁剪", len(h) == len(history),
          f"in={len(history)}, out={len(h)}")
    check("rag 不应裁剪", r == rag)

    # ── 1.4 fit_messages：超长 history 必须裁剪 ───────────────────────────────
    print("\n[1.4] fit_messages — 超长 history 触发裁剪")
    # 用极小 context_limit 强制裁剪
    tiny_budget = ContextBudget(provider="unknown", model_name="x",
                                response_reserve=100)
    # unknown provider → limit=16000, allocatable≈14400
    long_history = [
        {"role": "user" if i % 2 == 0 else "assistant",
         "content": "A" * 2000}   # 每条 ~667 token
        for i in range(30)
    ]
    h2, _ = tiny_budget.fit_messages("sys", long_history, "", "q")
    check("超长 history 应被截断", len(h2) < len(long_history),
          f"in={len(long_history)}, out={len(h2)}")

    # ── 1.5 fit_messages：超长 rag 必须裁剪 ──────────────────────────────────
    print("\n[1.5] fit_messages — 超长 RAG 触发裁剪")
    long_rag = "\n".join([f"- {'B' * 1000}" for _ in range(50)])
    _, r2 = tiny_budget.fit_messages("sys", [], long_rag, "q")
    check("超长 RAG 应被截断", len(r2) < len(long_rag),
          f"in={len(long_rag)}, out={len(r2)}")

    # ── 1.6 fit_rag_chunks ────────────────────────────────────────────────────
    print("\n[1.6] fit_rag_chunks")
    chunks = ["C" * 1000 for _ in range(10)]
    result_rag = budget.fit_rag_chunks(chunks, max_single_chunk_chars=600)
    lines = [l for l in result_rag.split("\n") if l.strip()]
    # 每条被截到 600 chars
    check("每条 chunk 不超过 600 字符",
          all(len(l) <= 600 + 2 for l in lines),    # "- " 前缀 +2
          f"max_line={max(len(l) for l in lines) if lines else 0}")

    # ── 1.7 fit_rewrite_history ───────────────────────────────────────────────
    print("\n[1.7] fit_rewrite_history")
    # budget 的 allocatable≈57600, 10%≈5760 tokens → max_chars≈17280
    long_hist_text = "对话内容" * 5000   # ~20000 chars，应被截断
    trimmed = budget.fit_rewrite_history(long_hist_text)
    check("fit_rewrite_history 应截断", len(trimmed) < len(long_hist_text),
          f"in={len(long_hist_text)}, out={len(trimmed)}")
    short_hist = "很短的历史"
    check("短历史不截断", budget.fit_rewrite_history(short_hist) == short_hist)


# ══════════════════════════════════════════════════════════════════════════════
# 模块二：HistorySummarizer（同步逻辑部分，不调用 LLM）
# ══════════════════════════════════════════════════════════════════════════════

def test_history_summarizer():
    print("\n" + "═" * 60)
    print("模块二：HistorySummarizer — 历史摘要压缩器（无 LLM 调用）")
    print("═" * 60)

    from agents.history_summarizer import (
        _build_history_text,
        SUMMARIZE_THRESHOLD,
        COMPRESS_COUNT,
        get_summarizer,
    )

    # ── 2.1 配置常量合理性 ────────────────────────────────────────────────────
    print("\n[2.1] 配置常量")
    check("SUMMARIZE_THRESHOLD >= 10", SUMMARIZE_THRESHOLD >= 10,
          f"value={SUMMARIZE_THRESHOLD}")
    check("COMPRESS_COUNT < SUMMARIZE_THRESHOLD",
          COMPRESS_COUNT < SUMMARIZE_THRESHOLD,
          f"compress={COMPRESS_COUNT}, threshold={SUMMARIZE_THRESHOLD}")

    # ── 2.2 _build_history_text ───────────────────────────────────────────────
    print("\n[2.2] _build_history_text 格式构建")
    msgs = [
        {"role": "user",      "content": "查询销售额"},
        {"role": "assistant", "content": "2024年销售额为100万"},
        {"role": "summary",   "content": "之前已分析过Q1数据"},
    ]
    text = _build_history_text(msgs)
    check("包含用户内容",    "查询销售额" in text)
    check("包含助手内容",    "2024年销售额" in text)
    check("包含摘要标记",    "[已有摘要]" in text)
    check("分段符存在",      "\n\n" in text)

    # ── 2.3 空列表处理 ────────────────────────────────────────────────────────
    print("\n[2.3] 空消息处理")
    check("空列表 → 空字符串", _build_history_text([]) == "")

    # ── 2.4 单例一致性 ────────────────────────────────────────────────────────
    print("\n[2.4] get_summarizer 单例")
    s1 = get_summarizer()
    s2 = get_summarizer()
    check("两次获取是同一对象", s1 is s2)

    # ── 2.5 summarize 空消息返回 None（不调用 LLM）────────────────────────────
    print("\n[2.5] summarize 空消息 → None（同步检查）")
    summarizer = get_summarizer()

    async def _run_empty():
        result = await summarizer.summarize(
            session_id="test-session",
            messages_to_compress=[],
            session_db=None,   # 空列表时不会访问 DB
        )
        return result

    result = asyncio.run(_run_empty())
    check("空消息列表返回 None", result is None)


# ══════════════════════════════════════════════════════════════════════════════
# 模块三：Reranker
# ══════════════════════════════════════════════════════════════════════════════

def test_reranker():
    print("\n" + "═" * 60)
    print("模块三：Reranker — 多因子重排器")
    print("═" * 60)

    from services.reranker import Reranker, get_reranker, DEFAULT_WEIGHTS

    r = Reranker()
    now = time.time()

    # ── 3.1 空候选返回空列表 ──────────────────────────────────────────────────
    print("\n[3.1] 空候选")
    check("空候选 → []", r.rerank("query", []) == [])

    # ── 3.2 单条候选不崩溃 ───────────────────────────────────────────────────
    print("\n[3.2] 单条候选")
    single = [{"content": "销售额", "metadata": {}, "vec_score": 0.8}]
    result = r.rerank("销售额", single)
    check("单条返回 1 条", len(result) == 1)
    check("包含 final_score", "final_score" in result[0])
    check("包含 scores 详情", "scores" in result[0])

    # ── 3.3 recency 因子：新文档分高于旧文档 ─────────────────────────────────
    print("\n[3.3] recency 因子（新 vs 旧）")
    candidates = [
        {
            "content": "test content A",
            "metadata": {"uploaded_at": str(now - 1 * 24 * 3600)},   # 1 天前
            "vec_score": 0.7,
        },
        {
            "content": "test content B",
            "metadata": {"uploaded_at": str(now - 60 * 24 * 3600)},  # 60 天前
            "vec_score": 0.7,   # vec_score 相同，只靠 recency 区分
        },
    ]
    ranked = r.rerank("test", candidates,
                      weights={"vec": 0.0, "bm25": 0.0,
                               "recency": 1.0, "session": 0.0})
    new_first = ranked[0]["metadata"]["uploaded_at"] == str(now - 1 * 24 * 3600)
    check("新文档 recency 分高于旧文档", new_first,
          f"top={ranked[0]['metadata']['uploaded_at'][:10]}")

    # ── 3.4 session 因子：当前会话文档优先 ───────────────────────────────────
    print("\n[3.4] session 因子（当前会话 vs 其他会话）")
    SESSION_A = "session-abc"
    SESSION_B = "session-xyz"
    cands = [
        {"content": "doc from other session",
         "metadata": {"session_id": SESSION_B}, "vec_score": 0.8},
        {"content": "doc from current session",
         "metadata": {"session_id": SESSION_A}, "vec_score": 0.8},
    ]
    ranked2 = r.rerank("query", cands, current_session_id=SESSION_A,
                       weights={"vec": 0.0, "bm25": 0.0,
                                "recency": 0.0, "session": 1.0})
    check("当前会话文档排第一",
          ranked2[0]["metadata"]["session_id"] == SESSION_A,
          f"top_session={ranked2[0]['metadata']['session_id']}")

    # ── 3.5 bm25 因子：关键词匹配更好的排更高 ─────────────────────────────────
    print("\n[3.5] BM25 因子（关键词命中）")
    bm_cands = [
        {"content": "今天天气真好，阳光明媚",
         "metadata": {}, "vec_score": 0.5},
        {"content": "2024年第一季度销售额同比增长15%，环比增长8%",
         "metadata": {}, "vec_score": 0.5},
    ]
    ranked3 = r.rerank("2024年销售额同比增长", bm_cands,
                       weights={"vec": 0.0, "bm25": 1.0,
                                "recency": 0.0, "session": 0.0})
    check("BM25：销售内容排第一",
          "销售额" in ranked3[0]["content"],
          f"top={ranked3[0]['content'][:20]}")

    # ── 3.6 自定义权重求和不为 1 时不崩溃 ────────────────────────────────────
    print("\n[3.6] 自定义权重鲁棒性")
    try:
        r.rerank("q", single, weights={"vec": 0.9, "bm25": 0.9,
                                       "recency": 0.0, "session": 0.0})
        check("权重不标准时不抛异常", True)
    except Exception as e:
        check("权重不标准时不抛异常", False, str(e))

    # ── 3.7 无 uploaded_at 时 recency 得中性分 ───────────────────────────────
    print("\n[3.7] 无 uploaded_at 元数据时中性处理")
    no_meta = [
        {"content": "a", "metadata": {}, "vec_score": 0.5},
        {"content": "b", "metadata": {}, "vec_score": 0.5},
    ]
    ranked4 = r.rerank("q", no_meta)
    check("无 uploaded_at 不崩溃，返回 2 条", len(ranked4) == 2)

    # ── 3.8 单例一致 ──────────────────────────────────────────────────────────
    print("\n[3.8] get_reranker 单例")
    check("两次获取是同一对象", get_reranker() is get_reranker())

    # ── 3.9 默认权重之和为 1 ─────────────────────────────────────────────────
    print("\n[3.9] 默认权重之和")
    total = sum(DEFAULT_WEIGHTS.values())
    check("默认权重之和 == 1.0", abs(total - 1.0) < 1e-9, f"sum={total}")


# ══════════════════════════════════════════════════════════════════════════════
# 模块四：ContextRouter
# ══════════════════════════════════════════════════════════════════════════════

def test_context_router():
    print("\n" + "═" * 60)
    print("模块四：ContextRouter — 动态上下文路由器")
    print("═" * 60)

    from agents.context_router import get_context_profile

    # ── 4.1 数据关键词 → needs_schema=True（最高优先级）─────────────────────
    print("\n[4.1] 数据关键词 → needs_schema=True")
    data_cases = [
        "查一下上个月的销售额",
        "统计各地区的订单量",
        "分析利润增长趋势",
        "SELECT * FROM orders WHERE month=12",
        "top 10 customers by revenue",
        "库存数据怎么样",
        "帮我看下产品销售情况",
        "员工绩效报表",
    ]
    for q in data_cases:
        p = get_context_profile(q)
        check(f"[data] needs_schema=True: {q[:20]}",
              p.needs_schema is True and p.intent_hint == "data",
              f"hint={p.intent_hint}")

    # ── 4.2 纯问候 → chitchat ─────────────────────────────────────────────────
    print("\n[4.2] 纯问候 → chitchat")
    greeting_cases = [
        ("你好",        False),
        ("hi",          False),
        ("hello",       False),
        ("谢谢",        False),
        ("thanks",      False),
        ("再见",        False),
        ("bye",         False),
        ("早上好",      False),
        ("good morning",False),
    ]
    for q, expected_schema in greeting_cases:
        p = get_context_profile(q)
        check(f"[greeting] needs_schema=False: {q}",
              p.needs_schema == expected_schema and p.intent_hint == "chitchat",
              f"hint={p.intent_hint}, schema={p.needs_schema}")

    # ── 4.3 询问 AI 自身 → chitchat ───────────────────────────────────────────
    print("\n[4.3] 询问 AI 自身 → chitchat")
    self_cases = [
        "你是谁",
        "你能做什么",
        "who are you",
        "what can you do",
        "你是人工智能吗",
        "介绍一下你自己",
    ]
    for q in self_cases:
        p = get_context_profile(q)
        check(f"[self] chitchat: {q}",
              p.needs_schema is False and p.intent_hint == "chitchat",
              f"hint={p.intent_hint}")

    # ── 4.4 纯概念解释（短句）→ chitchat ─────────────────────────────────────
    print("\n[4.4] 纯概念解释 → chitchat")
    concept_cases = [
        "什么是机器学习",
        "解释一下协方差",       # 注：不能用"解释一下 SQL"，sql 是数据关键词
        "what is mean",
        "define regression",
        "explain what is median",
    ]
    for q in concept_cases:
        p = get_context_profile(q)
        check(f"[concept] chitchat: {q}",
              p.needs_schema is False and p.intent_hint == "chitchat",
              f"hint={p.intent_hint}")

    # ── 4.5 保守原则：不确定时默认 needs_schema=True ─────────────────────────
    print("\n[4.5] 保守原则 — 不确定时 needs_schema=True")
    ambiguous_cases = [
        "帮我分析一下",       # 无数据词，但模糊
        "可以帮我查吗",
        "能看看吗",
        "how much is it",
        "继续",               # 确认词，不能误判为闲聊
        "好的，那就这样",
        "明白了",
    ]
    for q in ambiguous_cases:
        p = get_context_profile(q)
        check(f"[ambiguous] 保守 needs_schema=True: {q}",
              p.needs_schema is True,
              f"hint={p.intent_hint}, schema={p.needs_schema}")

    # ── 4.6 含数据词的概念解释 → 不应误判为 chitchat ─────────────────────────
    print("\n[4.6] 含数据词的概念解释 → 不误判（保守优先）")
    mixed_cases = [
        "什么是销售增长的原因",   # 含"销售"数据词，应 data
        "解释一下订单量下降",      # 含"订单""下降"
        "定义一下利润",            # 含"利润"
    ]
    for q in mixed_cases:
        p = get_context_profile(q)
        check(f"[mixed] 含数据词不误判: {q}",
              p.needs_schema is True,
              f"hint={p.intent_hint}")

    # ── 4.7 prompt_template 路由正确 ─────────────────────────────────────────
    print("\n[4.7] prompt_template 路由")
    p_chat = get_context_profile("你好")
    check("chitchat → CHAT_SIMPLE_RESPONSE",
          p_chat.prompt_template == "CHAT_SIMPLE_RESPONSE",
          f"tpl={p_chat.prompt_template}")

    p_data = get_context_profile("查看销售额")
    check("data → CHAT_RESPONSE",
          p_data.prompt_template == "CHAT_RESPONSE",
          f"tpl={p_data.prompt_template}")

    # ── 4.8 force_chat 模式 → 保守返回 needs_schema=True ─────────────────────
    print("\n[4.8] force_chat 模式")
    p_force = get_context_profile("好的那就继续", force_chat=True)
    check("force_chat 保守 needs_schema=True", p_force.needs_schema is True,
          f"hint={p_force.intent_hint}")

    # ── 4.9 边界：空字符串 ────────────────────────────────────────────────────
    print("\n[4.9] 边界：空字符串")
    p_empty = get_context_profile("")
    check("空字符串 → 不崩溃", True)
    check("空字符串 → 保守 needs_schema=True", p_empty.needs_schema is True,
          f"hint={p_empty.intent_hint}")

    # ── 4.10 英文大小写不敏感 ────────────────────────────────────────────────
    print("\n[4.10] 大小写不敏感")
    cases = [
        ("HELLO",        False, "chitchat"),
        ("Hello",        False, "chitchat"),
        ("SELECT * ...", True,  "data"),
    ]
    for q, exp_schema, exp_hint in cases:
        p = get_context_profile(q)
        check(f"大小写: {q!r}",
              p.needs_schema == exp_schema and p.intent_hint == exp_hint,
              f"hint={p.intent_hint}, schema={p.needs_schema}")


# ══════════════════════════════════════════════════════════════════════════════
# 汇总报告
# ══════════════════════════════════════════════════════════════════════════════

def print_summary():
    print("\n" + "═" * 60)
    print("测试汇总")
    print("═" * 60)

    passed = sum(1 for _, ok, _ in _results if ok)
    failed = sum(1 for _, ok, _ in _results if not ok)
    total  = len(_results)

    if failed:
        print("\n失败项：")
        for name, ok, detail in _results:
            if not ok:
                print(f"  ❌ {name}" + (f"  [{detail}]" if detail else ""))

    print(f"\n总计：{total} 项  |  ✅ {passed} 通过  |  ❌ {failed} 失败")

    if failed == 0:
        print("\n🎉 全部通过！四个模块工作正常。")
    else:
        print(f"\n⚠️  {failed} 项失败，请检查对应模块逻辑。")

    return failed == 0


# ══════════════════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("四大上下文优化模块集成测试")
    print("=" * 60)

    test_context_budget()
    test_history_summarizer()
    test_reranker()
    test_context_router()

    ok = print_summary()
    sys.exit(0 if ok else 1)
