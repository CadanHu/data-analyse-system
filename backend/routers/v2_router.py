"""v2 API 路由 — 阶段 1（workspace + user profile + notification_prefs）。

所有路由前缀 /api/v2，鉴权复用旧 get_current_user。
后续阶段（canvas_nodes / boards / alerts / ...）继续在此文件加，或拆子 router。
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from routers.auth_router import get_current_user
from database.v2 import services as v2_svc

router = APIRouter(prefix="/api/v2", tags=["v2 · workspace/user"])


# ============================================================
# Pydantic schemas
# ============================================================

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    plan_tier: str = Field(default='free')


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    owner_user_id: int
    plan_tier: str
    role: Optional[str] = None  # 当前请求用户在此 workspace 的角色


class MemberAdd(BaseModel):
    user_id: int
    role: str = Field(default='viewer')   # owner / admin / editor / viewer


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    team_id: Optional[str] = None
    avatar_url: Optional[str] = None
    lang: Optional[str] = None
    theme: Optional[str] = None
    density: Optional[str] = None
    shortcuts_json: Optional[Dict[str, Any]] = None


class NotificationPrefItem(BaseModel):
    channel: str        # email / im / push / inapp
    event_type: str     # mention / comment / alert / share / digest / system / ...
    enabled: bool = True
    dnd_start_min: Optional[int] = None
    dnd_end_min: Optional[int] = None


# ============================================================
# Workspace
# ============================================================

@router.get("/workspaces", response_model=List[WorkspaceOut])
async def list_my_workspaces(current_user: dict = Depends(get_current_user)):
    rows = await v2_svc.list_workspaces_for_user(current_user['id'])
    # role 来自 member 记录；这里偷懒：用 owner_user_id 判断
    return [
        {**r, 'role': 'owner' if r['owner_user_id'] == current_user['id'] else None}
        for r in rows
    ]


@router.get("/workspaces/current", response_model=WorkspaceOut)
async def get_or_create_default(current_user: dict = Depends(get_current_user)):
    """v2 前端进入时调一次：拿默认工作区，没有就建一个。"""
    ws = await v2_svc.get_or_create_default_workspace(current_user['id'])
    role = await v2_svc.get_member_role(ws['id'], current_user['id'])
    return {**ws, 'role': role}


@router.post("/workspaces", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(data: WorkspaceCreate, current_user: dict = Depends(get_current_user)):
    ws = await v2_svc.create_workspace(
        name=data.name,
        owner_user_id=current_user['id'],
        plan_tier=data.plan_tier,
    )
    return {**ws, 'role': 'owner'}


@router.get("/workspaces/{workspace_id}/members")
async def list_workspace_members(workspace_id: str, current_user: dict = Depends(get_current_user)):
    # 权限：必须是成员才能查看成员列表
    my_role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not my_role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_svc.list_members(workspace_id)


@router.post("/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
async def add_workspace_member(
    workspace_id: str,
    data: MemberAdd,
    current_user: dict = Depends(get_current_user),
):
    # 权限：owner 或 admin 才能加成员
    my_role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if my_role not in ('owner', 'admin'):
        raise HTTPException(status_code=403, detail="只有 owner / admin 能加成员")
    if data.role == 'owner':
        raise HTTPException(status_code=400, detail="不能直接给别人 owner 角色，请使用转让接口（待实现）")
    return await v2_svc.add_member(
        workspace_id=workspace_id,
        user_id=data.user_id,
        role=data.role,
        invited_by=current_user['id'],
    )


# ============================================================
# User profile (me)
# ============================================================

@router.get("/me/profile")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    p = await v2_svc.get_profile(current_user['id'])
    # 没扩展资料时返回空骨架，避免前端区分 null 与 default
    return p or {
        'user_id': current_user['id'],
        'display_name': None, 'role': None, 'team_id': None,
        'avatar_url': None, 'lang': 'zh-CN', 'theme': 'light',
        'density': 'cozy', 'shortcuts_json': None,
    }


@router.put("/me/profile")
async def update_my_profile(data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    return await v2_svc.upsert_profile(current_user['id'], updates)


# ============================================================
# Notification prefs
# ============================================================

@router.get("/me/notification-prefs", response_model=List[NotificationPrefItem])
async def get_my_notification_prefs(current_user: dict = Depends(get_current_user)):
    return await v2_svc.list_notification_prefs(current_user['id'])


@router.put("/me/notification-prefs")
async def update_my_notification_prefs(
    prefs: List[NotificationPrefItem],
    current_user: dict = Depends(get_current_user),
):
    written = await v2_svc.upsert_notification_prefs(
        current_user['id'],
        [p.model_dump() for p in prefs],
    )
    return {"written": written}
