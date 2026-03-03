import asyncio
import os
import sys
from datetime import datetime

# 将 backend 目录添加到路径
sys.path.append(os.path.join(os.getcwd(), "backend"))

from database.session_db import session_db
from sqlalchemy import text

async def fix_parent_ids():
    # 初始化数据库连接
    await session_db.init_db()
    
    async with session_db.async_session() as session:
        # 获取所有会话
        result = await session.execute(text("SELECT id FROM sessions"))
        sessions = result.fetchall()
        
        print(f"🔍 正在检查 {len(sessions)} 个会话的消息关联...")
        
        for s in sessions:
            session_id = s.id
            # 按时间顺序获取该会话的所有消息
            msg_result = await session.execute(
                text("SELECT id, role, parent_id FROM messages WHERE session_id = :sid ORDER BY created_at ASC"),
                {"sid": session_id}
            )
            messages = msg_result.fetchall()
            
            if not messages:
                continue
                
            print(f"  📂 会话 {session_id[:8]}... (消息数: {len(messages)})")
            
            last_id = None
            for i, msg in enumerate(messages):
                # 如果是第一条消息，且 parent_id 已经是 None，跳过
                if i == 0:
                    last_id = msg.id
                    continue
                
                # 如果当前消息没有 parent_id，或者 parent_id 错误地指向了 None
                if msg.parent_id is None:
                    print(f"    ✨ 修复消息 {msg.id[:8]}... 的父节点为 {last_id[:8]}...")
                    await session.execute(
                        text("UPDATE messages SET parent_id = :pid WHERE id = :mid"),
                        {"pid": last_id, "mid": msg.id}
                    )
                
                last_id = msg.id
        
        await session.commit()
        print("\n✅ 数据修复完成！所有线性对话的 parent_id 已重新挂载。")

if __name__ == "__main__":
    asyncio.run(fix_parent_ids())
