import asyncio
import sys
import os
from pathlib import Path

# 🌟 路径兼容性修复：检测是否在 Docker 环境中运行
current_file = Path(__file__).resolve()
# 尝试添加当前目录的上级（脚本目录的上级），即项目根目录或容器的 /app
root_dir = current_file.parent.parent
sys.path.append(str(root_dir))

# 如果是在本地运行，还需要尝试添加 backend 目录
backend_dir = root_dir / "backend"
if backend_dir.exists():
    sys.path.append(str(backend_dir))

# 现在可以安全导入了
from database.user_db import user_db
from database.session_db import session_db
from utils.security import get_password_hash

async def seed_user():
    username = "demo"
    password = "password123"
    email = "demo@example.com"
    
    # 🌟 关键修复：显式初始化数据库连接，确保读取到 Docker 环境变量
    from database.session_db import session_db
    await session_db.init_db()
    
    # 强制重新获取 session，因为 user_db 可能是在 init_db 之前实例化的
    user_db.async_session = session_db.async_session
    
    print(f"DEBUG: Connecting to MySQL Host: {os.getenv('MYSQL_HOST', 'localhost')}")
    
    try:
        # Check if user exists
        user = await user_db.get_user_by_email(email)
        if not user:
            print(f"👤 User '{email}' not found. Creating...")
            password_hash = get_password_hash(password)
            user_id = await user_db.create_user({
                "username": username,
                "email": email,
                "password_hash": password_hash
            })
            print(f"✅ User '{email}' created with ID: {user_id}")
        else:
            print(f"ℹ️ User '{email}' already exists.")
    except Exception as e:
        print(f"❌ Error seeding user: {e}")

if __name__ == "__main__":
    asyncio.run(seed_user())
