"""
会话记忆管理模块
管理每个会话的对话历史记忆，集成 AI 摘要压缩（HistorySummarizer）
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from database.session_db import SessionDB
from agents.history_summarizer import get_summarizer, SUMMARIZE_THRESHOLD, COMPRESS_COUNT


@dataclass
class ConversationMemory:
    """单个会话的记忆"""
    session_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)

    def add_message(self, role: str, content: str, msg_id: str = None):
        """添加一条消息到记忆（不再在此截断，由 MemoryManager._maybe_summarize 统一管理）"""
        entry = {"role": role, "content": content}
        if msg_id:
            entry["id"] = msg_id
        self.messages.append(entry)

    def get_history_text(self) -> str:
        """获取历史对话的文本格式（用于 Prompt）"""
        lines = []
        for msg in self.messages:
            role = msg.get("role", "")
            if role == "summary":
                role_name = "[历史摘要]"
            elif role == "user":
                role_name = "用户"
            else:
                role_name = "助手"
            lines.append(f"{role_name}: {msg['content']}")
        return "\n".join(lines)

    def clear(self):
        """清空记忆"""
        self.messages = []


class MemoryManager:
    """全局记忆管理器"""

    def __init__(self):
        self._memories: Dict[str, ConversationMemory] = {}
        self._session_db = SessionDB()

    async def get_or_create_memory(self, session_id: str) -> ConversationMemory:
        """获取或创建会话记忆"""
        if session_id not in self._memories:
            memory = ConversationMemory(session_id=session_id)
            await self._load_history_from_db(memory)
            self._memories[session_id] = memory
        return self._memories[session_id]

    async def _load_history_from_db(self, memory: ConversationMemory):
        """
        从数据库加载历史消息。
        get_messages 已过滤 is_compressed=True 的原始消息，
        结果中可能包含 role='summary' 的摘要消息，直接作为历史的一部分加载。
        """
        try:
            messages = await self._session_db.get_messages(memory.session_id)
            for msg in messages:
                memory.add_message(
                    role=msg["role"],
                    content=msg["content"],
                    msg_id=msg.get("id"),
                )
            print(f"📝 已从数据库加载会话 {memory.session_id} 的 {len(memory.messages)} 条历史消息")
        except Exception as e:
            print(f"⚠️ 加载历史消息失败: {e}")

    def get_memory(self, session_id: str) -> Optional[ConversationMemory]:
        """获取会话记忆（如果存在）"""
        return self._memories.get(session_id)

    async def add_user_message(self, session_id: str, content: str, msg_id: str = None):
        """添加用户消息"""
        memory = await self.get_or_create_memory(session_id)
        memory.add_message("user", content, msg_id=msg_id)

    async def add_assistant_message(self, session_id: str, content: str, msg_id: str = None):
        """
        添加助手消息。
        assistant 消息写入代表一轮对话完整，此时检查是否需要触发摘要压缩。
        """
        memory = await self.get_or_create_memory(session_id)
        memory.add_message("assistant", content, msg_id=msg_id)
        await self._maybe_summarize(session_id, memory)

    async def _maybe_summarize(self, session_id: str, memory: ConversationMemory):
        """
        检查是否需要触发历史摘要压缩。
        条件：messages 总数 > SUMMARIZE_THRESHOLD
        策略：压缩最旧的 COMPRESS_COUNT 条，替换为 1 条摘要消息。
        失败时静默降级为截断（保留最近 SUMMARIZE_THRESHOLD 条）。
        """
        if len(memory.messages) <= SUMMARIZE_THRESHOLD:
            return

        to_compress = memory.messages[:COMPRESS_COUNT]
        summarizer = get_summarizer()
        summary_text = await summarizer.summarize(
            session_id=session_id,
            messages_to_compress=to_compress,
            session_db=self._session_db,
        )

        if summary_text:
            # 替换内存中被压缩的消息为一条摘要
            memory.messages = (
                [{"role": "summary", "content": summary_text}]
                + memory.messages[COMPRESS_COUNT:]
            )
        else:
            # 降级：直接截断，保留最近 SUMMARIZE_THRESHOLD 条
            print(f"⚠️ [MemoryManager] 摘要失败，降级为截断（保留最近 {SUMMARIZE_THRESHOLD} 条）")
            memory.messages = memory.messages[-SUMMARIZE_THRESHOLD:]

    async def get_history_text(self, session_id: str) -> str:
        """获取历史对话文本（含摘要标记）"""
        memory = await self.get_or_create_memory(session_id)
        return memory.get_history_text()

    async def get_history(self, session_id: str) -> List[Dict[str, str]]:
        """获取结构化历史对话列表"""
        memory = await self.get_or_create_memory(session_id)
        return memory.messages

    async def clear_memory(self, session_id: str):
        """清空指定会话的记忆"""
        if session_id in self._memories:
            self._memories[session_id].clear()
            print(f"🧹 已清空会话 {session_id} 的记忆")

    def clear_all_memories(self):
        """清空所有记忆"""
        self._memories.clear()
        print("🧹 已清空所有会话记忆")


# 全局单例
_memory_manager: Optional[MemoryManager] = None


def get_memory_manager() -> MemoryManager:
    """获取全局记忆管理器单例"""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = MemoryManager()
    return _memory_manager
