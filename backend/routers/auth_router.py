from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from typing import Any
from datetime import timedelta
import random
import string
from datetime import datetime, timedelta

from models.user import UserCreate, UserResponse, Token, UserLogin, SendCodeRequest
from database.user_db import user_db
from utils.security import get_password_hash, verify_password, create_access_token, decode_access_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES
from utils.email import send_verification_email

router = APIRouter(prefix="/auth", tags=["认证管理"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# ==================== 依赖项：获取当前用户 ====================

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """获取当前登录用户的依赖项"""
    print(f"\n🔍 [AUTH] 验证 Token...")
    print(f"   收到 Token: {token[:30]}...")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_access_token(token)
        print(f"   Token 解码结果：{payload}")
    except Exception as e:
        print(f"   ❌ Token 解码失败：{e}")
        raise credentials_exception
    
    if payload is None:
        print(f"   ❌ Token 解码返回 None")
        raise credentials_exception
    
    email: str = payload.get("sub")
    print(f"   Token sub (email): {email}")
    
    if email is None:
        print(f"   ❌ Token 中不包含 email")
        raise credentials_exception
    
    print(f"\n🔍 [AUTH] 查找用户...")
    user = await user_db.get_user_by_email(email)
    
    if user is None:
        print(f"   ❌ 用户不存在：{email}")
        raise credentials_exception
    
    print(f"   ✅ 找到用户：{user['username']} ({user['email']})")
    print(f"{'='*60}\n")
    return user

# ==================== API 路由 ====================

@router.post("/send-code")
async def send_code(request_body: SendCodeRequest, background_tasks: BackgroundTasks):
    """发送邮箱验证码"""
    email = request_body.email
    print(f"\n{'='*60}")
    print(f"📧 [SEND-CODE] 请求发送验证码")
    print(f"   邮箱：{email}")
    
    code = ''.join(random.choices(string.digits, k=6))
    expires_at = datetime.now() + timedelta(minutes=10)
    
    print(f"   生成验证码：{code}")
    print(f"   过期时间：{expires_at}")

    try:
        await user_db.save_verification_code(str(email), code, expires_at)
        print(f"   ✅ 验证码已保存到数据库")
    except Exception as e:
        print(f"   ❌ 保存验证码失败：{e}")
        raise HTTPException(status_code=500, detail=f"保存验证码失败：{str(e)}")

    # 使用 BackgroundTasks 后台发送邮件，避免前端等待 SMTP 握手
    try:
        background_tasks.add_task(send_verification_email, str(email), code)
        print(f"   📬 邮件发送任务已加入后台队列")
    except Exception as e:
        print(f"   ⚠️  邮件发送失败（正常，如果 SMTP 未配置）: {e}")

    print(f"{'='*60}\n")
    return {"success": True, "message": "验证码已发送，请检查您的邮箱"}

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    """用户注册（带验证码校验）"""
    print(f"\n{'='*60}")
    print(f"📝 [REGISTER] 注册请求")
    print(f"   用户名：{user_in.username}")
    print(f"   邮箱：{user_in.email}")
    print(f"   验证码：{user_in.verification_code}")
    
    # 1. 检查验证码
    print(f"\n🔍 [REGISTER] 步骤 1: 检查验证码")
    stored_code_data = await user_db.get_verification_code(user_in.email)
    
    if not stored_code_data:
        print(f"   ❌ 未找到验证码记录，请先获取验证码")
        raise HTTPException(status_code=400, detail="请先获取验证码")
    
    print(f"   ✅ 找到验证码记录")
    print(f"   存储的验证码：{stored_code_data['code']}")
    print(f"   过期时间：{stored_code_data['expires_at']}")

    # 检查过期
    expires_at = stored_code_data["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)

    if datetime.now() > expires_at:
        print(f"   ❌ 验证码已过期")
        raise HTTPException(status_code=400, detail="验证码已过期")

    if stored_code_data["code"] != user_in.verification_code:
        print(f"   ❌ 验证码不匹配")
        print(f"   输入的验证码：{user_in.verification_code}")
        print(f"   存储的验证码：{stored_code_data['code']}")
        raise HTTPException(status_code=400, detail="验证码错误")
    
    print(f"   ✅ 验证码验证通过")

    # 2. 检查用户名和邮箱是否已存在
    print(f"\n🔍 [REGISTER] 步骤 2: 检查用户名和邮箱")
    
    existing_user = await user_db.get_user_by_username(user_in.username)
    if existing_user:
        print(f"   ❌ 用户名已存在：{user_in.username}")
        raise HTTPException(status_code=400, detail="用户名已被占用")
    print(f"   ✅ 用户名可用：{user_in.username}")

    existing_email = await user_db.get_user_by_email(user_in.email)
    if existing_email:
        print(f"   ❌ 邮箱已注册：{user_in.email}")
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    print(f"   ✅ 邮箱可用：{user_in.email}")

    # 3. 创建用户
    print(f"\n💾 [REGISTER] 步骤 3: 创建用户")
    user_data = {
        "username": user_in.username,
        "email": user_in.email,
        "password_hash": get_password_hash(user_in.password)
    }
    print(f"   用户名：{user_data['username']}")
    print(f"   邮箱：{user_data['email']}")
    print(f"   密码哈希：{user_data['password_hash'][:20]}...")
    
    try:
        user_id = await user_db.create_user(user_data)
        print(f"   ✅ 用户创建成功，ID: {user_id}")
    except Exception as e:
        print(f"   ❌ 创建用户失败：{e}")
        raise HTTPException(status_code=500, detail=f"创建用户失败：{str(e)}")

    # 获取新创建的用户信息
    new_user = await user_db.get_user_by_username(user_in.username)
    print(f"\n📊 [REGISTER] 注册完成")
    print(f"   用户 ID: {new_user['id']}")
    print(f"   用户名：{new_user['username']}")
    print(f"   邮箱：{new_user['email']}")
    print(f"{'='*60}\n")
    return new_user

@router.post("/login", response_model=Token)
async def login(login_data: UserLogin):
    """用户登录 (使用邮箱登录)"""
    print(f"\n{'='*60}")
    print(f"📥 [LOGIN] 登录请求")
    print(f"   输入的邮箱/用户名：{login_data.username}")
    print(f"   输入的密码：{login_data.password[:3]}*** (隐藏)")
    
    # 使用邮箱查找用户
    print(f"\n🔍 [LOGIN] 查找用户...")
    user = await user_db.get_user_by_email(login_data.username)
    
    if not user:
        print(f"   ❌ 用户不存在：{login_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"   ✅ 找到用户")
    print(f"   用户 ID: {user['id']}")
    print(f"   用户名：{user['username']}")
    print(f"   邮箱：{user['email']}")
    print(f"   存储的密码哈希：{user['password_hash'][:20]}...")
    
    # 验证密码
    print(f"\n🔐 [LOGIN] 验证密码...")
    password_match = verify_password(login_data.password, user["password_hash"])
    print(f"   密码匹配结果：{password_match}")
    
    if not password_match:
        print(f"   ❌ 密码错误")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"   ✅ 密码验证通过")

    # 更新最后登录时间
    print(f"\n💾 [LOGIN] 更新最后登录时间...")
    await user_db.update_last_login(user["id"])
    print(f"   ✅ 已更新")

    # 创建访问令牌
    print(f"\n🔑 [LOGIN] 创建访问令牌...")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    print(f"   过期时间：{ACCESS_TOKEN_EXPIRE_MINUTES} 分钟")
    print(f"   Token payload sub: {user['email']}")
    
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    
    print(f"   ✅ Token 生成成功")
    print(f"   Token: {access_token[:50]}...")
    print(f"{'='*60}\n")
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    print(f"\n{'='*60}")
    print(f"👤 [GET /me] 获取当前用户信息")
    print(f"   用户 ID: {current_user['id']}")
    print(f"   用户名：{current_user['username']}")
    print(f"   邮箱：{current_user['email']}")
    print(f"{'='*60}\n")
    return current_user
