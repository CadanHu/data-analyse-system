"""
测试会话管理 API
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from database.session_db import session_db


async def test_session_api():
    """测试会话管理 API"""
    print("🧪 开始测试会话管理 API...\n")
    
    # 初始化数据库
    await session_db.init_db()
    print("✅ 数据库初始化完成\n")
    
    # 测试 1: 创建会话
    print("📝 测试 1: 创建会话")
    session_id = await session_db.create_session("测试会话 1")
    print(f"   创建会话 ID: {session_id}")
    
    # 测试 2: 获取会话
    print("\n📝 测试 2: 获取会话详情")
    session = await session_db.get_session(session_id)
    print(f"   会话标题：{session['title']}")
    print(f"   创建时间：{session['created_at']}")
    
    # 测试 3: 更新会话
    print("\n📝 测试 3: 更新会话标题")
    await session_db.update_session(session_id, "更新后的测试会话")
    session = await session_db.get_session(session_id)
    print(f"   新标题：{session['title']}")
    
    # 测试 4: 添加消息
    print("\n📝 测试 4: 添加消息")
    message_id = await session_db.add_message(
        session_id=session_id,
        role="user",
        content="你好，请查询上个月的销售额",
        sql="SELECT SUM(amount) FROM orders WHERE order_date >= '2024-01-01'"
    )
    print(f"   消息 ID: {message_id}")
    
    # 测试 5: 获取消息列表
    print("\n📝 测试 5: 获取消息列表")
    messages = await session_db.get_messages(session_id)
    print(f"   消息数量：{len(messages)}")
    for msg in messages:
        print(f"   - [{msg['role']}] {msg['content'][:30]}...")
    
    # 测试 6: 获取所有会话
    print("\n📝 测试 6: 获取所有会话列表")
    sessions = await session_db.get_all_sessions()
    print(f"   总会话数：{len(sessions)}")
    
    # 测试 7: 删除会话
    print("\n📝 测试 7: 删除会话")
    success = await session_db.delete_session(session_id)
    print(f"   删除结果：{'成功' if success else '失败'}")
    
    # 验证删除
    sessions = await session_db.get_all_sessions()
    print(f"   剩余会话数：{len(sessions)}")
    
    print("\n✅ 所有测试完成！")


if __name__ == "__main__":
    asyncio.run(test_session_api())
