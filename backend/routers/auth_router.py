from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Any
from datetime import timedelta

from models.user import UserCreate, UserResponse, Token, UserLogin
from database.user_db import user_db
from utils.security import get_password_hash, verify_password, create_access_token, decode_access_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/auth", tags=["认证管理"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """获取当前登录用户的依赖项"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    print(f"🔍 [AUTH DEBUG] 收到 Token: {token[:20]}...")
    payload = decode_access_token(token)
    if payload is None:
        print("❌ [AUTH DEBUG] Token 解码失败")
        raise credentials_exception
    username: str = payload.get("sub")
    if username is None:
        print("❌ [AUTH DEBUG] Token 中不包含 username")
        raise credentials_exception
    user = await user_db.get_user_by_username(username)
    if user is None:
        print(f"❌ [AUTH DEBUG] 用户不存在: {username}")
        raise credentials_exception
    return user

import random
import string
from datetime import datetime, timedelta
from pydantic import EmailStr

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from utils.email import send_verification_email

@router.post("/send-code")
async def send_code(email: EmailStr, background_tasks: BackgroundTasks):
    """发送邮箱验证码"""
    code = ''.join(random.choices(string.digits, k=6))
    expires_at = datetime.now() + timedelta(minutes=10)
    
    await user_db.save_verification_code(str(email), code, expires_at)
    
    # 使用 BackgroundTasks 后台发送邮件，避免前端等待 SMTP 握手
    background_tasks.add_task(send_verification_email, str(email), code)
    
    return {"success": True, "message": "验证码已发送，请检查您的邮箱"}

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    """用户注册（带验证码校验）"""
    # 1. 检查验证码
    stored_code_data = await user_db.get_verification_code(user_in.email)
    if not stored_code_data:
        raise HTTPException(status_code=400, detail="请先获取验证码")
    
    # 检查过期
    expires_at = stored_code_data["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    
    if datetime.now() > expires_at:
        raise HTTPException(status_code=400, detail="验证码已过期")
    
    if stored_code_data["code"] != user_in.verification_code:
        raise HTTPException(status_code=400, detail="验证码错误")

    # 2. 检查用户名和邮箱是否已存在
    existing_user = await user_db.get_user_by_username(user_in.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="用户名已被占用")
    
    existing_email = await user_db.get_user_by_email(user_in.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    
    # 3. 创建用户
    user_data = {
        "username": user_in.username,
        "email": user_in.email,
        "password_hash": get_password_hash(user_in.password)
    }
    user_id = await user_db.create_user(user_data)
    
    # 获取新创建的用户信息
    new_user = await user_db.get_user_by_username(user_in.username)
    return new_user

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """用户登录（强制使用邮箱登录）"""
    # OAuth2PasswordRequestForm 的 username 字段在这里将被视为 email
    email = form_data.username
    
    # 验证用户
    user = await user_db.get_user_by_email(email)
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 更新最后登录时间
    await user_db.update_last_login(user["id"])
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user
