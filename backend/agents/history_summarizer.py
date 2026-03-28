"""
对话历史摘要压缩器 (History Summarizer)

当 MemoryManager 中某会话的消息数超过阈值时，
将最旧的 N 条消息交给轻量 LLM 生成摘要，
并将摘要持久化到 DB（role="summary"），原消息标记为 is_compressed=True。

触发方：memory_manager.MemoryManager._maybe_summarize()
"""

from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Dict, Optional

# ─── 配置 ──────────────────────────────────────────────────────────────────────
SUMMARIZE_THRESHOLD = 20   # 超过此消息数时触发摘要
COMPRESS_COUNT = 10        # 每次压缩最旧的 N 条消息

# 固定使用最便宜的模型做摘要，与用户当前选择的模型无关
_SUMMARIZE_PROVIDER = "deepseek"
_SUMMARIZE_MODEL = "deepseek-chat"

# ─── Prompt 模板 ───────────────────────────────────────────────────────────────
_SUMMARIZE_PROMPT_ZH = """你是一个对话历史压缩助手。以下是一段数据分析对话历史，请将其压缩为一段简洁摘要。

【对话历史】
{history}

【压缩要求】
- 摘要不超过 400 字
- 保留：用户的核心问题、重要数据结论、已执行的 SQL 操作、关键数字/表名/字段名
- 使用第三人称描述（"用户询问了…"、"助手查询了…"）
- 输出纯文本，不使用 Markdown 格式

摘要："""

_SUMMARIZE_PROMPT_EN = """You are a conversation history compression assistant. Compress the following data analysis conversation into a concise summary.

[Conversation History]
{history}

[Requirements]
- Summary must be under 300 words
- Preserve: user's core questions, key data findings, executed SQL operations, important numbers/table names/field names
- Use third-person narration ("The user asked...", "The assistant queried...")
- Plain text only, no Markdown

Summary:"""


def _build_history_text(messages: List[Dict[str, str]]) -> str:
    lines = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lines.append(f"用户: {content}")
        elif role == "assistant":
            lines.append(f"助手: {content}")
        elif role == "summary":
            lines.append(f"[已有摘要]: {content}")
    return "\n\n".join(lines)


class HistorySummarizer:
    """
    对话历史摘要器。

    设计原则：
    - 只负责摘要生成 + DB 持久化，不修改 memory 内的 messages 列表
    - 失败时静默返回 None，由调用方降级处理
    - 使用固定最便宜模型，降低成本
    """

    async def summarize(
        self,
        session_id: str,
        messages_to_compress: List[Dict[str, str]],
        session_db,
        language: str = "zh",
    ) -> Optional[str]:
        """
        对 messages_to_compress 生成 AI 摘要，并将结果持久化到 DB。

        Args:
            session_id: 所属会话 ID（用于 DB 写入）
            messages_to_compress: 要被压缩的消息列表（最旧的 N 条）
            session_db: SessionDatabase 实例
            language: 摘要语言 "zh" 或 "en"

        Returns:
            摘要文本；若失败返回 None
        """
        if not messages_to_compress:
            return None

        history_text = _build_history_text(messages_to_compress)
        prompt_tmpl = _SUMMARIZE_PROMPT_ZH if language == "zh" else _SUMMARIZE_PROMPT_EN
        prompt = prompt_tmpl.format(history=history_text)

        summary_text = await self._call_llm(prompt)
        if not summary_text:
            return None

        summary_text = summary_text.strip()

        # 持久化：批量标记原消息为 is_compressed=True
        msg_ids = [m["id"] for m in messages_to_compress if m.get("id")]
        if msg_ids:
            await session_db.mark_messages_compressed(msg_ids)

        # 持久化：写入摘要消息（role="summary"）
        await session_db.create_summary_message(session_id, summary_text)

        print(f"📝 [Summarizer] 会话 {session_id[:8]}… 压缩 {len(messages_to_compress)} 条 → 摘要 {len(summary_text)} 字")
        return summary_text

    async def _call_llm(self, prompt: str) -> Optional[str]:
        """调用轻量 LLM 生成摘要文本，失败时返回 None。"""
        try:
            from services.llm_factory import llm_factory
            from langchain_core.messages import HumanMessage

            llm = llm_factory.get_langchain_model(
                provider=_SUMMARIZE_PROVIDER,
                model_name=_SUMMARIZE_MODEL,
                temperature=0.3,
                streaming=False,
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            content = response.content
            if isinstance(content, list):
                content = "".join(
                    part.get("text", "") for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
            return content if content else None
        except Exception as e:
            print(f"⚠️ [Summarizer] LLM 摘要调用失败，降级为截断模式: {e}")
            return None


# 全局单例
_summarizer: Optional[HistorySummarizer] = None


def get_summarizer() -> HistorySummarizer:
    global _summarizer
    if _summarizer is None:
        _summarizer = HistorySummarizer()
    return _summarizer
