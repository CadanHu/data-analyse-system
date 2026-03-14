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
    """获取当前登录用户的依赖项 / Get current logged-in user dependency"""
    print(f"\n🔍 [AUTH] 验证 Token... / Verifying Token...")
    print(f"   收到 Token: {token[:30]}...")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials (无效的认证凭证)",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_access_token(token)
        print(f"   Token 解码结果 / Token payload: {payload}")
    except Exception as e:
        print(f"   ❌ Token 解码失败 / Token decoding failed: {e}")
        raise credentials_exception
    
    if payload is None:
        print(f"   ❌ Token 解码返回 None / Token payload is None")
        raise credentials_exception
    
    email: str = payload.get("sub")
    print(f"   Token sub (email): {email}")
    
    if email is None:
        print(f"   ❌ Token 中不包含 email / No email in token")
        raise credentials_exception
    
    print(f"\n🔍 [AUTH] 查找用户... / Finding user...")
    user = await user_db.get_user_by_email(email)
    
    if user is None:
        print(f"   ❌ 用户不存在 / User not found: {email}")
        raise credentials_exception
    
    print(f"   ✅ 找到用户 / User found: {user['username']} ({user['email']})")
    print(f"{'='*60}\n")
    return user

# ==================== API 路由 ====================

@router.post("/send-code")
async def send_code(request_body: SendCodeRequest, background_tasks: BackgroundTasks):
    """发送邮箱验证码 / Send email verification code"""
    email = request_body.email
    print(f"\n{'='*60}")
    print(f"📧 [SEND-CODE] 请求发送验证码 / Request verification code")
    print(f"   邮箱 / Email：{email}")
    
    code = ''.join(random.choices(string.digits, k=6))
    expires_at = datetime.now() + timedelta(minutes=10)
    
    print(f"   生成验证码 / Generated code：{code}")
    print(f"   过期时间 / Expires at：{expires_at}")

    try:
        await user_db.save_verification_code(str(email), code, expires_at)
        print(f"   ✅ 验证码已保存 / Code saved to DB")
    except Exception as e:
        print(f"   ❌ 保存验证码失败 / Failed to save code：{e}")
        raise HTTPException(status_code=500, detail=f"Failed to save verification code (保存验证码失败)：{str(e)}")

    # 使用 BackgroundTasks 后台发送邮件，避免前端等待 SMTP 握手
    try:
        background_tasks.add_task(send_verification_email, str(email), code)
        print(f"   📬 邮件发送任务已加入队列 / Email task queued")
    except Exception as e:
        print(f"   ⚠️  邮件发送失败 / Email failed (SMTP not configured?): {e}")

    print(f"{'='*60}\n")
    return {"success": True, "message": "Verification code sent, please check your email (验证码已发送，请检查您的邮箱)"}

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    """用户注册 / User registration"""
    print(f"\n{'='*60}")
    print(f"📝 [REGISTER] 注册请求 / Registration request")
    print(f"   用户名 / Username：{user_in.username}")
    print(f"   邮箱 / Email：{user_in.email}")
    
    # 1. 检查验证码
    print(f"\n🔍 [REGISTER] Step 1: Check verification code")
    stored_code_data = await user_db.get_verification_code(user_in.email)
    
    if not stored_code_data:
        print(f"   ❌ 未找到验证码记录 / No verification code found")
        raise HTTPException(status_code=400, detail="Please request a verification code first (请先获取验证码)")
    
    print(f"   ✅ 找到验证码记录 / Code record found")

    # 检查过期
    expires_at = stored_code_data["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)

    if datetime.now() > expires_at:
        print(f"   ❌ 验证码已过期 / Verification code expired")
        raise HTTPException(status_code=400, detail="Verification code expired (验证码已过期)")

    if stored_code_data["code"] != user_in.verification_code:
        print(f"   ❌ 验证码不匹配 / Verification code mismatch")
        raise HTTPException(status_code=400, detail="Invalid verification code (验证码错误)")
    
    print(f"   ✅ 验证码验证通过 / Code verified")

    # 2. 检查用户名和邮箱是否已存在
    print(f"\n🔍 [REGISTER] Step 2: Check username and email")
    
    existing_user = await user_db.get_user_by_username(user_in.username)
    if existing_user:
        print(f"   ❌ 用户名已存在 / Username already exists：{user_in.username}")
        raise HTTPException(status_code=400, detail="Username already occupied (用户名已被占用)")

    existing_email = await user_db.get_user_by_email(user_in.email)
    if existing_email:
        print(f"   ❌ 邮箱已注册 / Email already registered：{user_in.email}")
        raise HTTPException(status_code=400, detail="Email already registered (邮箱已被注册)")

    # 3. 创建用户
    print(f"\n💾 [REGISTER] Step 3: Create user")
    user_data = {
        "username": user_in.username,
        "email": user_in.email,
        "password_hash": get_password_hash(user_in.password)
    }
    
    try:
        user_id = await user_db.create_user(user_data)
        print(f"   ✅ 用户创建成功 / User created, ID: {user_id}")
    except Exception as e:
        print(f"   ❌ 创建用户失败 / Failed to create user：{e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user (创建用户失败)：{str(e)}")

    new_user = await user_db.get_user_by_username(user_in.username)
    print(f"\n📊 [REGISTER] 注册完成 / Registration complete")
    print(f"   用户 ID: {new_user['id']}")
    print(f"{'='*60}\n")
    return new_user

@router.post("/login", response_model=Token)
async def login(login_data: UserLogin):
    """用户登录 / User Login"""
    print(f"\n{'='*60}")
    print(f"📥 [LOGIN] 登录请求 / Login request")
    print(f"   输入的邮箱 / Input email：{login_data.username}")
    
    print(f"\n🔍 [LOGIN] 查找用户 / Finding user...")
    user = await user_db.get_user_by_email(login_data.username)
    
    if not user:
        print(f"   ❌ 用户不存在 / User not found：{login_data.username}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not registered, please sign up (该邮箱未注册，请先注册)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"   ✅ 找到用户 / User found")
    
    # 验证密码
    print(f"\n🔐 [LOGIN] 验证密码 / Verifying password...")
    password_match = verify_password(login_data.password, user["password_hash"])
    
    if not password_match:
        print(f"   ❌ 密码错误 / Incorrect password")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password (邮箱或密码错误)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"   ✅ 密码验证通过 / Password verified")

    # 更新最后登录时间
    print(f"\n💾 [LOGIN] 更新最后登录时间 / Updating last login...")
    await user_db.update_last_login(user["id"])
    
    # 创建访问令牌
    print(f"\n🔑 [LOGIN] 创建令牌 / Creating access token...")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    
    print(f"   ✅ Token 生成成功 / Token generated")
    print(f"{'='*60}\n")
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息 / Get current user info"""
    print(f"\n{'='*60}")
    print(f"👤 [GET /me] 获取当前用户信息 / Fetching current user")
    print(f"   用户 ID: {current_user['id']}")
    print(f"   用户名 / Username：{current_user['username']}")
    print(f"{'='*60}\n")
    return current_user
