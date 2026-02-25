
import asyncio
import os
import sys

# 添加 backend 到系统路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.session_db import session_db

async def verify_thinking():
    print("🔍 正在检查数据库中的思考过程数据...")
    
    # 查找最近的所有会话
    # 注意：这里需要一个 user_id，我们假设检查 user_id=1 的数据，或者直接从 messages 表查
    
    if hasattr(session_db, 'db_path'):
        # SQLite
        print(f"📁 数据库类型: SQLite ({session_db.db_path})")
        import aiosqlite
        async with aiosqlite.connect(session_db.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT id, role, content, thinking FROM messages WHERE role='assistant' AND thinking IS NOT NULL AND thinking != '' ORDER BY created_at DESC LIMIT 5") as cursor:
                rows = await cursor.fetchall()
                if not rows:
                    print("❌ 未在 SQLite 数据库中找到包含思考过程的消息。")
                else:
                    print(f"✅ 找到 {len(rows)} 条包含思考过程的消息：")
                    for row in rows:
                        print(f"
--- Message ID: {row['id']} ---")
                        print(f"内容摘要: {row['content'][:50]}...")
                        print(f"思考过程摘要: {row['thinking'][:100]}...")
    else:
        # MySQL
        print(f"🌐 数据库类型: MySQL")
        import aiomysql
        conn = await aiomysql.connect(**session_db.config)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, role, content, thinking FROM messages WHERE role='assistant' AND thinking IS NOT NULL AND thinking != '' ORDER BY created_at DESC LIMIT 5")
            rows = await cur.fetchall()
            if not rows:
                print("❌ 未在 MySQL 数据库中找到包含思考过程的消息。")
            else:
                print(f"✅ 找到 {len(rows)} 条包含思考过程的消息：")
                for row in rows:
                    print(f"
--- Message ID: {row['id']} ---")
                    print(f"内容摘要: {row['content'][:50]}...")
                    print(f"思考过程摘要: {row['thinking'][:100]}...")
        conn.close()

if __name__ == "__main__":
    asyncio.run(verify_thinking())
