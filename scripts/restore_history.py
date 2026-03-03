import asyncio
import os
import sys

# 将 backend 目录添加到路径
sys.path.append(os.path.join(os.getcwd(), "backend"))

from database.session_db import session_db
from sqlalchemy import text

async def restore_active_chains():
    # 初始化数据库连接
    await session_db.init_db()
    
    async with session_db.async_session() as session:
        # 1. 获取所有会话
        result = await session.execute(text("SELECT id FROM sessions"))
        sessions = result.fetchall()
        
        print(f"🔍 正在恢复 {len(sessions)} 个会话的活跃对话链...")
        
        for s in sessions:
            session_id = s.id
            # 2. 找到该会话中最后创建的消息
            msg_result = await session.execute(
                text("SELECT id, parent_id FROM messages WHERE session_id = :sid ORDER BY created_at DESC LIMIT 1"),
                {"sid": session_id}
            )
            last_msg = msg_result.fetchone()
            
            if not last_msg:
                continue
                
            print(f"  📂 正在回溯会话 {session_id[:8]}... 的最后一条消息 {last_msg.id[:8]}...")
            
            # 3. 沿着 parent_id 链向上回溯，全部设为 1
            curr_id = last_msg.id
            count = 0
            while curr_id:
                await session.execute(
                    text("UPDATE messages SET is_current = 1 WHERE id = :id"),
                    {"id": curr_id}
                )
                count += 1
                
                # 获取父节点
                p_res = await session.execute(
                    text("SELECT parent_id FROM messages WHERE id = :id"),
                    {"id": curr_id}
                )
                p_row = p_res.fetchone()
                curr_id = p_row.parent_id if p_row and p_row[0] else None
            
            print(f"    ✅ 已激活该链条上的 {count} 条消息。")
        
        await session.commit()
        print("\n✅ 历史对话链已成功恢复！")

if __name__ == "__main__":
    asyncio.run(restore_active_chains())
