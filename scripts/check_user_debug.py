
import asyncio
import os
import sys

# 将 backend 目录添加到路径
sys.path.append(os.path.join(os.getcwd(), "backend"))

from database.user_db import user_db
from database.session_db import session_db

async def check_user():
    # 初始化数据库连接
    await user_db.init_db()
    
    email_to_check = "pelang666@outkook.com"
    print(f"🔍 正在检查邮箱: {email_to_check}")
    
    user = await user_db.get_user_by_email(email_to_check)
    if user:
        print(f"✅ 找到用户!")
        print(f"   ID: {user['id']}")
        print(f"   Username: {user['username']}")
        print(f"   Email: {user['email']}")
        print(f"   Password Hash: {user['password_hash'][:20]}...")
    else:
        print(f"❌ 未找到该邮箱的用户。")
        
        # 尝试模糊查询
        print("
🔍 尝试列出所有用户以进行对比:")
        # 假设 user_db 有一个获取所有用户的方法，如果没有，我们直接查库
        from databases.database_manager import db_manager
        async with db_manager.get_session("session_db") as session:
            from sqlalchemy import text
            result = await session.execute(text("SELECT id, username, email FROM users LIMIT 10"))
            users = result.fetchall()
            for u in users:
                print(f"   - {u.username} | {u.email}")

if __name__ == "__main__":
    asyncio.run(check_user())
