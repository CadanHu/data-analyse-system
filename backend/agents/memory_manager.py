"""
会话记忆管理模块
管理每个会话的对话历史记忆
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from database.session_db import SessionDB


@dataclass
class ConversationMemory:
    """单个会话的记忆"""
    session_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    max_history: int = 10

    def add_message(self, role: str, content: str):
        """添加一条消息到记忆"""
        self.messages.append({"role": role, "content": content})
        # 保留最近 N 轮对话
        if len(self.messages) > self.max_history * 2:
            self.messages = self.messages[-self.max_history * 2:]

    def get_history_text(self) -> str:
        """获取历史对话的文本格式（用于 Prompt）"""
        lines = []
        for msg in self.messages:
            role_name = "用户" if msg["role"] == "user" else "助手"
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
            # 从数据库加载历史消息
            memory = ConversationMemory(session_id=session_id)
            await self._load_history_from_db(memory)
            self._memories[session_id] = memory
        return self._memories[session_id]

    async def _load_history_from_db(self, memory: ConversationMemory):
        """从数据库加载历史消息"""
        try:
            messages = await self._session_db.get_messages(memory.session_id)
            for msg in messages:
                memory.add_message(msg["role"], msg["content"])
            print(f"📝 已从数据库加载会话 {memory.session_id} 的 {len(memory.messages)} 条历史消息")
        except Exception as e:
            print(f"⚠️ 加载历史消息失败: {e}")

    def get_memory(self, session_id: str) -> Optional[ConversationMemory]:
        """获取会话记忆（如果存在）"""
        return self._memories.get(session_id)

    async def add_user_message(self, session_id: str, content: str):
        """添加用户消息"""
        memory = await self.get_or_create_memory(session_id)
        memory.add_message("user", content)

    async def add_assistant_message(self, session_id: str, content: str):
        """添加助手消息"""
        memory = await self.get_or_create_memory(session_id)
        memory.add_message("assistant", content)

    async def get_history_text(self, session_id: str) -> str:
        """获取历史对话文本"""
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
