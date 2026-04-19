"""
核心链路回归测试：用户发消息 → chat/stream → SSE 流 → 消息存库

对应规格：specs/chat-modes.md § 验收标准

运行方式：
  cd backend
  venv312/bin/pytest tests/test_chat_regression.py -v
  # 或直接运行：
  venv312/bin/python tests/test_chat_regression.py
"""
import json
import sys
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def parse_sse(content: bytes) -> list[dict]:
    """把 b'data: {...}\\n\\n...' 解析为事件列表。"""
    events = []
    for line in content.decode().splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                events.append(json.loads(line[len("data:"):].strip()))
            except json.JSONDecodeError:
                pass
    return events


# ---------------------------------------------------------------------------
# Mock 工厂
# ---------------------------------------------------------------------------

FAKE_USER = {"id": 1, "username": "testuser"}
FAKE_SESSION = {
    "id": "sess-001",
    "user_id": 1,
    "title": "",
    "database_key": "business",
    "model_provider": None,
    "model_name": None,
    "enable_thinking": False,
    "enable_rag": False,
    "enable_data_science_agent": False,
}


def make_agent_mock():
    """返回一个模拟标准模式最小事件序列的 Agent。"""
    async def fake_process(*args, **kwargs):
        yield {"event": "summary", "data": {"content": "共有 42 位用户"}}
        yield {"event": "done",    "data": {"session_title": "用户数量查询"}}

    async def fake_title(*args, **kwargs):
        return "用户数量查询"

    agent = MagicMock()
    agent.process_question_with_history = fake_process
    agent.generate_ai_title = fake_title
    return agent


def mock_session_db(saved_messages: list):
    """返回记录 create_message 调用的 session_db mock。"""
    db = MagicMock()
    db.get_session = AsyncMock(return_value=FAKE_SESSION)
    db.get_all_api_keys = AsyncMock(return_value=[])
    db.get_api_key = AsyncMock(return_value=None)
    db.update_session_title = AsyncMock()

    async def capture(data):
        saved_messages.append(data)
        return data["id"]

    db.create_message = capture
    return db


def standard_patches(saved: list, agent=None):
    """所有测试共用的 patch 上下文（减少重复）。"""
    if agent is None:
        agent = make_agent_mock()
    return (
        patch("routers.chat_router.session_db", mock_session_db(saved)),
        patch("routers.chat_router.get_sql_agent", return_value=agent),
        patch("routers.chat_router.get_memory_manager"),
        patch("routers.chat_router._fetch_rag_context", new=AsyncMock(return_value="")),
        patch("routers.chat_router._handle_session_auto_title", new=AsyncMock()),
    )


async def call_chat_stream(question: str = "有多少用户？") -> tuple:
    """发送一次 /chat/stream 请求，返回 (response, saved_messages)。"""
    from httpx import AsyncClient, ASGITransport
    from main import app
    from routers.auth_router import get_current_user

    saved = []
    patches = standard_patches(saved)

    with patches[0], patches[1], patches[2] as mock_mm, patches[3], patches[4]:
        mock_mm.return_value.get_history_text = AsyncMock(return_value="")
        mock_mm.return_value.get_history = AsyncMock(return_value=[])

        app.dependency_overrides[get_current_user] = lambda: FAKE_USER
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/chat/stream",
                json={"session_id": "sess-001", "question": question},
            )
        app.dependency_overrides.clear()

    return response, saved


async def call_chat_stream_with_broken_agent() -> tuple:
    """用会抛异常的 Agent 发起请求，返回 (response, saved_messages)。"""
    from httpx import AsyncClient, ASGITransport
    from main import app
    from routers.auth_router import get_current_user

    async def broken_process(*args, **kwargs):
        raise RuntimeError("数据库连接失败")
        yield

    broken_agent = MagicMock()
    broken_agent.process_question_with_history = broken_process

    saved = []
    patches = standard_patches(saved, agent=broken_agent)

    with patches[0], patches[1], patches[2] as mock_mm, patches[3], patches[4]:
        mock_mm.return_value.get_history_text = AsyncMock(return_value="")
        mock_mm.return_value.get_history = AsyncMock(return_value=[])

        app.dependency_overrides[get_current_user] = lambda: FAKE_USER
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/chat/stream",
                json={"session_id": "sess-001", "question": "有多少用户？"},
            )
        app.dependency_overrides.clear()

    return response, saved


# ---------------------------------------------------------------------------
# 测试 1：SSE 流包含 content 事件和 done 事件
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_returns_content_and_done():
    """规格：SSE 流中必须出现 content/summary 事件和 done 事件。"""
    response, _ = await call_chat_stream()

    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")

    event_types = [e.get("event") for e in parse_sse(response.content)]
    assert "summary" in event_types or "content" in event_types, \
        f"流中缺少 content/summary 事件，实际: {event_types}"
    assert "done" in event_types, \
        f"流中缺少 done 事件，实际: {event_types}"


# ---------------------------------------------------------------------------
# 测试 2：消息写入数据库（用户消息 + 助手消息）
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_messages_persisted_to_db():
    """规格：一次对话结束后，数据库中必须存在用户消息和助手消息。"""
    _, saved = await call_chat_stream()

    assert len(saved) == 2, \
        f"期望存入 2 条消息（user + assistant），实际: {len(saved)}"
    roles = [m["role"] for m in saved]
    assert "user" in roles,      "缺少 user 消息"
    assert "assistant" in roles, "缺少 assistant 消息"


# ---------------------------------------------------------------------------
# 测试 3：用户消息内容与请求问题一致
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_message_content_matches_question():
    """规格：存入 DB 的 user 消息内容必须与请求中的 question 一致。"""
    question = "有多少用户？"
    _, saved = await call_chat_stream(question)

    user_msg = next(m for m in saved if m["role"] == "user")
    assert user_msg["content"] == question


# ---------------------------------------------------------------------------
# 测试 4：done 事件携带 message_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_done_event_has_message_id():
    """规格：done 事件的 data 中必须包含 message_id 字段（供前端保存）。"""
    response, _ = await call_chat_stream()

    events = parse_sse(response.content)
    done = next((e for e in events if e.get("event") == "done"), None)

    assert done is not None, "缺少 done 事件"
    assert "message_id" in done.get("data", {}), \
        f"done 事件缺少 message_id，实际 data: {done.get('data')}"


# ---------------------------------------------------------------------------
# 测试 5：Agent 异常时返回 error 事件，不崩溃后端
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_agent_error_returns_error_event():
    """规格：Agent 抛出异常时，流中必须出现 error 事件，HTTP 状态码仍为 200。"""
    response, _ = await call_chat_stream_with_broken_agent()

    assert response.status_code == 200, \
        "SSE 流发生异常时 HTTP 状态码不应变为 5xx"
    event_types = [e.get("event") for e in parse_sse(response.content)]
    assert "error" in event_types, \
        f"Agent 异常后流中缺少 error 事件，实际: {event_types}"


# ---------------------------------------------------------------------------
# 直接运行入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    async def main():
        tests = [
            ("SSE 流包含 content 和 done 事件",  test_stream_returns_content_and_done),
            ("消息写入数据库",                    test_messages_persisted_to_db),
            ("用户消息内容与问题一致",             test_user_message_content_matches_question),
            ("done 事件携带 message_id",          test_done_event_has_message_id),
            ("Agent 异常返回 error 事件",          test_agent_error_returns_error_event),
        ]
        passed = 0
        for name, fn in tests:
            try:
                await fn()
                print(f"  ✅ {name}")
                passed += 1
            except Exception as e:
                print(f"  ❌ {name}: {e}")

        print(f"\n{'✅ 全部通过' if passed == len(tests) else '❌ 有失败'} ({passed}/{len(tests)})")

    asyncio.run(main())
