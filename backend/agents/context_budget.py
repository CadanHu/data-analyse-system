"""
统一上下文预算管理器 (Context Budget Manager)

解决问题：各 Agent 独立硬编码截断（history[-6:]、history[-500:]、MAX_TOTAL=3000），
导致上下文管理策略不一致、与模型实际窗口脱节。

核心思路：
  总窗口 = system + history + rag + question + response_reserve
  可分配区 = 总窗口 - system - question - response_reserve
  history 和 rag 在可分配区内按比例分配，超出时按优先级裁剪：
    先裁 RAG（逐条缩短 → 整条删除）
    再裁 history（从最旧的消息开始丢弃）
    保护 system / question 不裁
"""

from __future__ import annotations
from typing import List, Dict, Tuple


# ─── 各模型上下文窗口（单位：tokens）────────────────────────────────────────────
# 以输入上下文窗口为准，不含输出。数据来源：各厂商官方文档（2026-Q1）
# 匹配规则：model_name.lower() 包含 key 子串即命中，先匹配先生效
_MODEL_CONTEXT_LIMITS: Dict[str, List[Tuple[str, int]]] = {
    "deepseek": [
        ("reasoner",     64_000),   # DeepSeek-R1
        ("",             64_000),   # DeepSeek-V3 (chat)
    ],
    "qwen": [
        ("qwq",          131_072),  # QwQ-32B
        ("turbo",      1_000_000),  # Qwen-Turbo 长文本版
        ("plus",        131_072),   # Qwen-Plus
        ("max",          32_768),   # Qwen-Max
        ("",             32_768),   # 其他 Qwen
    ],
    "zhipu": [
        ("glm-5",       200_000),   # GLM-5 旗舰 / GLM-5-Turbo
        ("glm-4.6",     200_000),   # GLM-4.6（文本 200K）/ GLM-4.6V 视觉（128K，取大值）
        ("glm-4.5",     128_000),   # GLM-4.5 / GLM-4.5-Air / GLM-4.5V
        ("glm-4.7",     128_000),   # GLM-4.7 / GLM-4.7-Flash / GLM-4.7-FlashX
        ("glm-4-flash", 128_000),   # GLM-4-Flash / GLM-4-Flash-250414
        ("",            128_000),   # 其他 GLM
    ],
    "minimax": [
        ("text-01",   1_000_000),   # MiniMax-Text-01（百万上下文）
        ("abab6.5s",   245_760),    # ABAB 6.5S
        ("",           245_760),    # 其他 MiniMax
    ],
    "openai": [
        ("gpt-5.3",   1_000_000),   # 主力通用模型（最推荐）
        ("gpt-5.2",   1_000_000),   # fallback

        ("o4-mini",     200_000),   # 推理（性价比）
        ("o3",          200_000),   # 强推理（高难任务）

        ("gpt-4o",      128_000),   # 兼容 fallback（可选）
    ],
    "gemini": [
        ("3.1",      2_000_000),    # Gemini 3.1 系列（含 3.1-flash-lite）
        ("3-flash",  2_000_000),    # Gemini 3 Flash
        ("2.5",      1_000_000),    # Gemini 2.5 Pro/Flash
        ("2.0",      1_000_000),    # Gemini 2.0 Flash/Pro
        ("1.5-pro",  2_000_000),    # Gemini 1.5 Pro
        ("1.5-flash",1_000_000),    # Gemini 1.5 Flash
        ("",         1_000_000),    # 其他 Gemini
    ],
    "claude": [
        ("",           200_000),    # 全系列 Claude（3.7/4.5/4.6 均 200K）
    ],
}

# 未知 provider / 未匹配模型时的保守默认值
_FALLBACK_CONTEXT_LIMIT = 16_000

# Token 估算的安全系数（实际可用 = limit × safety），补偿中英混合计算误差
_SAFETY_FACTOR = 0.90


def get_context_limit(provider: str, model_name: str) -> int:
    """
    根据 provider + model_name 返回该模型的上下文窗口大小（tokens）。
    匹配方式：遍历 provider 对应列表，model_name.lower() 包含子串即命中。
    """
    provider = (provider or "").lower()
    model_name = (model_name or "").lower()

    candidates = _MODEL_CONTEXT_LIMITS.get(provider)
    if not candidates:
        return _FALLBACK_CONTEXT_LIMIT

    for substring, limit in candidates:
        if substring in model_name:
            return limit

    return _FALLBACK_CONTEXT_LIMIT


def estimate_tokens(text: str) -> int:
    """
    轻量 token 估算，不依赖 tiktoken 等外部库。
    中英文混合场景下 len(text) // 3 是经验近似值：
      - 纯英文：约 4 chars/token，len//3 偏保守（合理）
      - 纯中文：约 1.5 chars/token，len//3 偏激进（可接受）
      - 混合：len//3 居中
    """
    if not text:
        return 0
    return max(1, len(text) // 3)


class ContextBudget:
    """
    统一上下文预算管理器。

    用法：
        budget = ContextBudget(provider="deepseek", model_name="deepseek-chat")
        trimmed_history, trimmed_rag = budget.fit_messages(
            system=system_prompt,
            history=history_list,
            rag_context=rag_str,
            question=question,
        )
    """

    def __init__(
        self,
        provider: str,
        model_name: str,
        response_reserve: int = 4096,
        history_ratio: float = 0.50,
    ):
        """
        Args:
            provider: 模型供应商（"deepseek" / "openai" / "gemini" / "claude" 等）
            model_name: 具体模型名（"deepseek-chat" / "claude-sonnet-4-6" 等）
            response_reserve: 给模型输出预留的 token 数（默认 4096）
            history_ratio: 可分配预算中 history 占比，剩余给 rag（默认 50/50）
        """
        raw_limit = get_context_limit(provider, model_name)
        self.context_limit = int(raw_limit * _SAFETY_FACTOR)
        self.response_reserve = response_reserve
        self.history_ratio = history_ratio
        self._provider = provider
        self._model_name = model_name

    @property
    def allocatable_budget(self) -> int:
        """可分配预算 = 总窗口 - response_reserve（system/question 从中动态扣除）"""
        return max(0, self.context_limit - self.response_reserve)

    def fit_messages(
        self,
        system: str,
        history: List[Dict[str, str]],
        rag_context: str,
        question: str,
        max_single_rag_chunk_chars: int = 600,
    ) -> Tuple[List[Dict[str, str]], str]:
        """
        核心接口：将 history 和 rag_context 裁剪到预算内。

        裁剪优先级（从先裁到后裁）：
          1. RAG chunks（逐条缩短到 max_single_rag_chunk_chars → 整条删除）
          2. history 最旧的消息（每次删一条，直到满足预算）
          3. system / question 永不裁剪

        Args:
            system: system prompt 完整文本
            history: [{"role": "user/assistant", "content": "..."}]
            rag_context: RAG 检索拼接文本
            question: 当前用户问题
            max_single_rag_chunk_chars: 单条 RAG 片段最大字符数

        Returns:
            (裁剪后的 history list, 裁剪后的 rag_context str)
        """
        system_tokens = estimate_tokens(system)
        question_tokens = estimate_tokens(question)

        # 扣除固定开销后的可分配预算
        available = self.allocatable_budget - system_tokens - question_tokens
        if available <= 0:
            # 极端情况：system + question 已超窗口，只保留最后一条 history
            return history[-1:] if history else [], ""

        history_budget = int(available * self.history_ratio)
        rag_budget = available - history_budget

        trimmed_history = self._trim_history(history, history_budget)
        trimmed_rag = self._trim_rag(rag_context, rag_budget, max_single_rag_chunk_chars)

        # 去除 history 末尾连续的 user 消息（即未得到回复的旧问题）
        # 防止模型把历史中未回答的问题与当前问题一起回答
        while trimmed_history and trimmed_history[-1].get("role") == "user":
            trimmed_history = trimmed_history[:-1]

        return trimmed_history, trimmed_rag

    def fit_rag_chunks(
        self,
        chunks: List[str],
        max_single_chunk_chars: int = 600,
        rag_budget_tokens: int | None = None,
    ) -> str:
        """
        专用于 RAG chunk 列表组装（替换 chat_router.py 中的 MAX_CHUNK/MAX_TOTAL 逻辑）。

        Args:
            chunks: 原始检索结果文本列表
            max_single_chunk_chars: 单条最大字符数
            rag_budget_tokens: 允许使用的 token 上限；None 时取总窗口的 30%

        Returns:
            拼接好的 rag_context 字符串
        """
        if rag_budget_tokens is None:
            rag_budget_tokens = int(self.allocatable_budget * 0.30)

        parts: List[str] = []
        used = 0
        for chunk in chunks:
            # 先截单条字符
            clipped = chunk[:max_single_chunk_chars]
            chunk_tokens = estimate_tokens(clipped)
            if used + chunk_tokens > rag_budget_tokens:
                break
            parts.append(f"- {clipped}")
            used += chunk_tokens

        return "\n".join(parts)

    def fit_rewrite_history(self, history_text: str) -> str:
        """
        专用于 sql_agent.rewrite_query_for_rag 中的历史文本裁剪
        （替换原来的 history[-500:] 字符截断）。

        budget：总窗口 10%，不超过 1500 tokens（对应约 4500 字符）
        """
        rewrite_budget = min(
            int(self.allocatable_budget * 0.10),
            1500,
        )
        max_chars = rewrite_budget * 3  # 反算字符上限
        if len(history_text) <= max_chars:
            return history_text
        # 保留最后 max_chars 个字符（最近对话）
        return history_text[-max_chars:]

    # ─── 内部方法 ────────────────────────────────────────────────────────────

    def _trim_history(
        self,
        history: List[Dict[str, str]],
        budget_tokens: int,
    ) -> List[Dict[str, str]]:
        """
        从最旧的消息开始丢弃，直到 history 总 token 数 ≤ budget_tokens。
        保证 user/assistant 成对（从头部成对丢弃，避免首条是 assistant）。
        """
        if not history:
            return []

        # 从完整 history 开始，逐步从头丢弃，直到满足预算
        result = list(history)
        while result:
            total = sum(estimate_tokens(m.get("content", "")) for m in result)
            if total <= budget_tokens:
                break
            # 丢弃最旧的一条
            result.pop(0)

        return result

    def _trim_rag(
        self,
        rag_context: str,
        budget_tokens: int,
        max_single_chunk_chars: int,
    ) -> str:
        """
        先尝试整体截断，如已超出则逐行处理。
        每行格式为 "- <内容>"（由 fit_rag_chunks 产生），对单行超长的先缩短再删。
        """
        if not rag_context:
            return ""

        if estimate_tokens(rag_context) <= budget_tokens:
            return rag_context

        lines = [l for l in rag_context.split("\n") if l.strip()]
        result: List[str] = []
        used = 0

        for line in lines:
            # 去掉 "- " 前缀后限制单条字符
            content = line[2:] if line.startswith("- ") else line
            clipped = content[:max_single_chunk_chars]
            entry = f"- {clipped}"
            t = estimate_tokens(clipped)
            if used + t > budget_tokens:
                break
            result.append(entry)
            used += t

        return "\n".join(result)

    def __repr__(self) -> str:
        return (
            f"ContextBudget(provider={self._provider!r}, model={self._model_name!r}, "
            f"limit={self.context_limit}, allocatable={self.allocatable_budget})"
        )
