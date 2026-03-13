import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent / "backend"))

from database.user_db import user_db
from utils.security import get_password_hash

async def seed_user():
    username = "demo"
    password = "password123"
    email = "demo@example.com"
    
    # Check if user exists
    user = await user_db.get_user_by_username(username)
    if not user:
        print(f"👤 User '{username}' not found. Creating...")
        password_hash = get_password_hash(password)
        user_id = await user_db.create_user({
            "username": username,
            "email": email,
            "password_hash": password_hash
        })
        print(f"✅ User '{username}' created with ID: {user_id}")
    else:
        print(f"ℹ️ User '{username}' already exists.")

if __name__ == "__main__":
    asyncio.run(seed_user())
