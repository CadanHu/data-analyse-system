"""v2 API 路由 — 阶段 1 (workspace + profile + prefs) + 阶段 2 (v2 sessions + canvas + SSE ask)。

所有路由前缀 /api/v2，鉴权复用旧 get_current_user。
"""
import traceback
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from routers.auth_router import get_current_user
from database.v2 import services as v2_svc
from database.v2 import canvas_services as v2_canvas
from services.stream_service import StreamableHTTPService

router = APIRouter(prefix="/api/v2", tags=["v2"])


# ============================================================
# 角色权限依赖 — C 档基础设施
# 用法: current_user = Depends(require_role('admin'))
# 也支持多个角色: Depends(require_role('admin', 'analyst'))
# ============================================================

def require_role(*allowed_roles: str):
    """依赖项工厂：要求 user_profiles.role 在 allowed_roles 内。"""
    async def _dep(current_user: dict = Depends(get_current_user)) -> dict:
        profile = await v2_svc.get_profile(current_user['id'])
        role = (profile or {}).get('role')
        if role in allowed_roles:
            return current_user
        raise HTTPException(
            status_code=403,
            detail=f"需要角色 {' / '.join(allowed_roles)}（你当前: {role or '未设置'}）",
        )
    return _dep


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


# ============================================================
# 阶段 2 · v2 sessions / canvas-nodes / ask(SSE)
# ============================================================

class V2SessionCreate(BaseModel):
    workspace_id: str
    title: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None


class V2AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    parent_node_id: Optional[str] = None     # 用于分支：从某个节点叉出去
    enable_thinking: bool = False
    no_database: bool = False
    rag_scope: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    language: str = 'zh-CN'


async def _require_session_owner(session_id: str, user_id: int) -> Dict[str, Any]:
    """权限：必须是 session.owner_user_id == user_id 才能访问。"""
    ses = await v2_canvas.get_session(session_id)
    if not ses:
        raise HTTPException(status_code=404, detail="session 不存在")
    if ses['owner_user_id'] != user_id:
        raise HTTPException(status_code=403, detail="不是该会话的拥有者")
    return ses


@router.get("/sessions")
async def list_v2_sessions(workspace_id: str, current_user: dict = Depends(get_current_user)):
    # 必须是 workspace 成员才能列会话
    role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_canvas.list_sessions(workspace_id, current_user['id'])


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_v2_session(data: V2SessionCreate, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(data.workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_canvas.create_session(
        workspace_id=data.workspace_id,
        owner_user_id=current_user['id'],
        title=data.title,
        model_provider=data.model_provider,
        model_name=data.model_name,
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_v2_session(session_id: str, current_user: dict = Depends(get_current_user)):
    await _require_session_owner(session_id, current_user['id'])
    await v2_canvas.delete_session(session_id)
    return None


@router.get("/sessions/{session_id}/canvas-nodes")
async def list_canvas_nodes(session_id: str, current_user: dict = Depends(get_current_user)):
    await _require_session_owner(session_id, current_user['id'])
    return await v2_canvas.list_canvas_nodes(session_id)


@router.post("/sessions/{session_id}/ask")
async def ask_v2(session_id: str, request: V2AskRequest, current_user: dict = Depends(get_current_user)):
    """提问 → SSE 流式 → 写 v2_messages + canvas_nodes。

    LLM 调用复用旧 chat_router 的 agent_instance.process_question_with_history。
    与旧 standard_mode 的区别只在于 storage 走 v2 表。
    """
    await _require_session_owner(session_id, current_user['id'])
    user_id = current_user['id']

    # 复用旧 LLM agent
    from routers.chat_router import get_sql_agent
    from utils.json_utils import json_dumps  # 旧代码用过的
    agent_instance = get_sql_agent()

    async def event_generator():
        yield {"event": "thinking", "data": {"content": "Starting (正在启动)..."}}

        import time
        start_ts = time.time()

        # 1. 立刻把 user message + canvas_node 落表，前端订阅 canvas_nodes 会立即看到
        user_pair = await v2_canvas.add_message_with_node(
            session_id=session_id,
            role='user',
            content=request.question,
            parent_node_id=request.parent_node_id,
        )
        user_msg = user_pair['message']
        user_node = user_pair['node']
        yield {"event": "user_message_saved", "data": {
            "message_id": user_msg['id'], "node_id": user_node['id'],
        }}

        # 2. 构造历史 (从 v2_messages 取这个 session 之前的消息)
        prior_nodes = await v2_canvas.list_canvas_nodes(session_id)
        # 排除刚刚加的 user message
        history_lines = []
        for n in prior_nodes:
            if n['message_id'] == user_msg['id']:
                continue
            role = n['role']
            content = n['content'] or ''
            if n.get('sql'):
                content += f"\n[SQL] {n['sql']}"
            history_lines.append(f"{role}: {content}")
        history_str = "\n".join(history_lines[-20:])  # 最近 20 条

        # 3. 流式调 LLM，累积 assistant 字段
        assistant_content = ""
        assistant_sql = ""
        assistant_chart_cfg = None
        assistant_thinking = ""
        assistant_data: Any = None
        assistant_msg_id = None
        assistant_node_id = None

        try:
            async for event in agent_instance.process_question_with_history(
                request.question, history_str,
                knowledge_context="",                  # v2 RAG 暂未接，先空
                enable_thinking=request.enable_thinking,
                provider=request.model_provider,
                model_name=request.model_name,
                language=request.language,
                force_chat=request.no_database,
            ):
                event_type = event["event"]
                event_data = event.get("data", {})

                if event_type == "model_thinking":
                    assistant_thinking += event_data.get("content", "")
                elif event_type == "summary":
                    assistant_content += event_data.get("content", "")
                elif event_type == "sql_generated":
                    assistant_sql = event_data.get("sql", "")
                elif event_type == "sql_result":
                    assistant_data = event_data
                elif event_type == "chart_ready":
                    assistant_chart_cfg = event_data.get("option", {})

                if event_type != "done":
                    yield event
                else:
                    # 4. 流结束，落 assistant message + canvas_node
                    thinking_steps = [
                        s.strip() for s in (assistant_thinking or "").splitlines() if s.strip()
                    ]
                    elapsed_ms = int((time.time() - start_ts) * 1000)
                    assistant_pair = await v2_canvas.add_message_with_node(
                        session_id=session_id,
                        role='assistant',
                        content=assistant_content,
                        parent_msg_id=user_msg['id'],
                        parent_node_id=user_node['id'],
                        sql=assistant_sql or None,
                        chart_cfg=assistant_chart_cfg,
                        data=assistant_data,
                        thinking_steps=thinking_steps or None,
                        elapsed_ms=elapsed_ms,
                        model_provider=request.model_provider,
                        model_name=request.model_name,
                    )
                    assistant_msg_id = assistant_pair['message']['id']
                    assistant_node_id = assistant_pair['node']['id']

                    # 5. 异步更新 session 标题（第一条提问时）
                    async def _maybe_update_title():
                        ses = await v2_canvas.get_session(session_id)
                        if ses and (not ses.get('title') or ses['title'] == '新会话'):
                            await v2_canvas.update_session_title(session_id, request.question[:50])
                    asyncio.create_task(_maybe_update_title())

                    yield {"event": "done", "data": {
                        "message_id": assistant_msg_id,
                        "node_id": assistant_node_id,
                        "user_message_id": user_msg['id'],
                        "user_node_id": user_node['id'],
                    }}
        except Exception as e:
            traceback.print_exc()
            yield {"event": "error", "data": {"message": f"v2 ask error: {str(e)}"}}

    return StreamingResponse(
        StreamableHTTPService.generate_stream(event_generator()),
        media_type="text/event-stream",
    )


# ============================================================
# 阶段 3 · boards / widgets / templates
# ============================================================

from database.v2 import board_services as v2_board


class BoardCreate(BaseModel):
    workspace_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    grid_cols: int = 12
    from_template_id: Optional[str] = None


class BoardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    grid_cols: Optional[int] = None
    schedule_cron: Optional[str] = None


class WidgetPin(BaseModel):
    source_node_id: str
    grid_x: int = 0
    grid_y: int = 0
    w: int = 4
    h: int = 3
    override_cfg: Optional[Dict[str, Any]] = None


class WidgetUpdate(BaseModel):
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    override_cfg_json: Optional[Dict[str, Any]] = None
    order_index: Optional[int] = None


async def _require_board_writable(board_id: str, user_id: int) -> Dict[str, Any]:
    """看板可写权限：board owner 或 workspace owner/admin。"""
    board = await v2_board.get_board(board_id)
    if not board:
        raise HTTPException(status_code=404, detail="board 不存在")
    if board['owner_user_id'] == user_id:
        return board
    role = await v2_svc.get_member_role(board['workspace_id'], user_id)
    if role in ('owner', 'admin'):
        return board
    raise HTTPException(status_code=403, detail="无权修改此看板")


async def _require_board_readable(board_id: str, user_id: int) -> Dict[str, Any]:
    """看板可读权限：workspace 任意成员。"""
    board = await v2_board.get_board(board_id)
    if not board:
        raise HTTPException(status_code=404, detail="board 不存在")
    role = await v2_svc.get_member_role(board['workspace_id'], user_id)
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return board


@router.get("/boards")
async def list_v2_boards(workspace_id: str, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_board.list_boards(workspace_id)


@router.post("/boards", status_code=status.HTTP_201_CREATED)
async def create_v2_board(data: BoardCreate, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(data.workspace_id, current_user['id'])
    if role not in ('owner', 'admin', 'editor'):
        raise HTTPException(status_code=403, detail="只有 owner/admin/editor 能创建看板")
    return await v2_board.create_board(
        workspace_id=data.workspace_id,
        owner_user_id=current_user['id'],
        title=data.title,
        description=data.description,
        grid_cols=data.grid_cols,
        from_template_id=data.from_template_id,
    )


@router.get("/boards/{board_id}")
async def get_v2_board(board_id: str, current_user: dict = Depends(get_current_user)):
    board = await _require_board_readable(board_id, current_user['id'])
    widgets = await v2_board.list_widgets(board_id)
    return {**board, 'widgets': widgets}


@router.patch("/boards/{board_id}")
async def update_v2_board(board_id: str, data: BoardUpdate, current_user: dict = Depends(get_current_user)):
    await _require_board_writable(board_id, current_user['id'])
    return await v2_board.update_board(board_id, data.model_dump(exclude_unset=True))


@router.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_v2_board(board_id: str, current_user: dict = Depends(get_current_user)):
    await _require_board_writable(board_id, current_user['id'])
    await v2_board.delete_board(board_id)
    return None


@router.post("/boards/{board_id}/widgets", status_code=status.HTTP_201_CREATED)
async def pin_widget(board_id: str, data: WidgetPin, current_user: dict = Depends(get_current_user)):
    """把 canvas_node 钉到看板。"""
    await _require_board_writable(board_id, current_user['id'])
    return await v2_board.pin_node_to_board(
        board_id=board_id,
        source_node_id=data.source_node_id,
        grid_x=data.grid_x, grid_y=data.grid_y,
        w=data.w, h=data.h,
        override_cfg=data.override_cfg,
    )


@router.patch("/boards/{board_id}/widgets/{widget_id}")
async def update_widget(board_id: str, widget_id: str, data: WidgetUpdate, current_user: dict = Depends(get_current_user)):
    await _require_board_writable(board_id, current_user['id'])
    return await v2_board.update_widget(widget_id, data.model_dump(exclude_unset=True))


@router.delete("/boards/{board_id}/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget(board_id: str, widget_id: str, current_user: dict = Depends(get_current_user)):
    await _require_board_writable(board_id, current_user['id'])
    await v2_board.delete_widget(widget_id)
    return None


@router.get("/board-templates")
async def list_board_templates(category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await v2_board.list_templates(category=category)


# ============================================================
# C 档示例 · admin-only 路由 (后续 P2-A 管理后台真实接口会复用 require_role)
# ============================================================

@router.get("/admin/_check")
async def admin_check(current_user: dict = Depends(require_role('admin'))):
    """探针：当前用户是否拥有 admin 角色。403 表示无权。"""
    return {
        "user_id": current_user['id'],
        "ok": True,
        "message": "你拥有 admin 角色，可访问管理后台所有功能",
    }


# ============================================================
# 阶段 4 · share_links / share_grants / notifications
# ============================================================

from database.v2 import share_services as v2_share
from database.v2 import notification_services as v2_notif


class ShareLinkCreate(BaseModel):
    target_type: str         # session / board / node
    target_id: str
    permission: str = 'view' # view / comment / edit
    expires_days: Optional[int] = None   # 多少天后过期，None = 永不


class ShareGrantUpsert(BaseModel):
    target_type: str
    target_id: str
    user_id: int
    permission: str = 'view'


# --- 权限工具：判断当前 user 是否能分享某 target ---
async def _can_share(target_type: str, target_id: str, user_id: int) -> bool:
    """会话/看板的 owner 才能分享。node 暂时随其所在 session 的 owner 判断。"""
    if target_type == 'session':
        ses = await v2_canvas.get_session(target_id)
        return bool(ses and ses['owner_user_id'] == user_id)
    if target_type == 'board':
        from database.v2 import board_services as _bs
        b = await _bs.get_board(target_id)
        if not b:
            return False
        if b['owner_user_id'] == user_id:
            return True
        role = await v2_svc.get_member_role(b['workspace_id'], user_id)
        return role in ('owner', 'admin')
    if target_type == 'node':
        # node 跟着所在 session 判断
        from database.v2.base import v2_db
        from database.v2.models import CanvasNodeModel, V2SessionModel
        from sqlalchemy.future import select as _select
        async with v2_db.async_session() as s:
            res = await s.execute(_select(CanvasNodeModel.session_id).where(CanvasNodeModel.id == target_id))
            sid = res.scalar_one_or_none()
            if not sid:
                return False
            res2 = await s.execute(_select(V2SessionModel.owner_user_id).where(V2SessionModel.id == sid))
            owner = res2.scalar_one_or_none()
            return owner == user_id
    return False


# ---------- Share links ----------

@router.post("/share-links", status_code=status.HTTP_201_CREATED)
async def create_share_link(data: ShareLinkCreate, current_user: dict = Depends(get_current_user)):
    if not await _can_share(data.target_type, data.target_id, current_user['id']):
        raise HTTPException(status_code=403, detail="无权分享此资源")
    from datetime import timedelta, datetime as _dt
    expires_at = (_dt.utcnow() + timedelta(days=data.expires_days)) if data.expires_days else None
    return await v2_share.create_share_link(
        target_type=data.target_type, target_id=data.target_id,
        created_by=current_user['id'],
        permission=data.permission, expires_at=expires_at,
    )


@router.get("/share-links")
async def list_my_share_links(
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await v2_share.list_share_links(
        target_type=target_type, target_id=target_id,
        created_by=current_user['id'],
    )


@router.post("/share-links/{link_id}/revoke")
async def revoke_link(link_id: str, current_user: dict = Depends(get_current_user)):
    links = await v2_share.list_share_links(created_by=current_user['id'])
    if not any(l['id'] == link_id for l in links):
        raise HTTPException(status_code=403, detail="只能撤销自己创建的链接")
    await v2_share.revoke_share_link(link_id)
    return {"ok": True}


@router.delete("/share-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(link_id: str, current_user: dict = Depends(get_current_user)):
    links = await v2_share.list_share_links(created_by=current_user['id'])
    if not any(l['id'] == link_id for l in links):
        raise HTTPException(status_code=403, detail="只能删除自己创建的链接")
    await v2_share.delete_share_link(link_id)
    return None


@router.get("/share-links/_lookup/{token}")
async def lookup_share_link(token: str):
    """公开端点：通过 token 拿分享信息（不需要登录）。"""
    link = await v2_share.get_share_by_token(token)
    if not link:
        raise HTTPException(status_code=404, detail="链接无效或已过期")
    # 不暴露 created_by / created_at 等敏感字段
    return {
        "target_type": link['target_type'],
        "target_id": link['target_id'],
        "permission": link['permission'],
    }


# ---------- Share grants ----------

@router.post("/share-grants", status_code=status.HTTP_201_CREATED)
async def upsert_share_grant(data: ShareGrantUpsert, current_user: dict = Depends(get_current_user)):
    if not await _can_share(data.target_type, data.target_id, current_user['id']):
        raise HTTPException(status_code=403, detail="无权分享此资源")
    return await v2_share.upsert_grant(
        target_type=data.target_type, target_id=data.target_id,
        user_id=data.user_id, permission=data.permission,
        granted_by=current_user['id'],
    )


@router.get("/share-grants")
async def list_grants_for_target(
    target_type: str, target_id: str,
    current_user: dict = Depends(get_current_user),
):
    # 只有 target owner 能看 grants
    if not await _can_share(target_type, target_id, current_user['id']):
        raise HTTPException(status_code=403, detail="无权查看此资源的分享列表")
    return await v2_share.list_grants(target_type, target_id)


@router.delete("/share-grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grant(grant_id: str, current_user: dict = Depends(get_current_user)):
    # 简化：只允许被授权者本人或者 grant 的 granted_by 撤销 —
    # 这里偷懒只允许 granted_by。生产环境应该更严格。
    from database.v2.base import v2_db as _db
    from database.v2.models import ShareGrantModel as _SG
    from sqlalchemy.future import select as _select
    async with _db.async_session() as s:
        res = await s.execute(_select(_SG).where(_SG.id == grant_id))
        g = res.scalar_one_or_none()
        if not g:
            raise HTTPException(status_code=404, detail="grant 不存在")
        if g.granted_by != current_user['id'] and g.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权撤销此授权")
    await v2_share.remove_grant(grant_id)
    return None


# ---------- Notifications ----------

@router.get("/notifications")
async def list_my_notifications(
    only_unread: bool = False,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    return await v2_notif.list_for_user(
        current_user['id'], only_unread=only_unread,
        limit=limit, offset=offset,
    )


@router.get("/notifications/_count")
async def notifications_unread_count(current_user: dict = Depends(get_current_user)):
    return {"unread": await v2_notif.count_unread(current_user['id'])}


@router.patch("/notifications/{notif_id}/read")
async def mark_notif_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    ok = await v2_notif.mark_read(notif_id, current_user['id'])
    if not ok:
        raise HTTPException(status_code=404, detail="通知不存在或非你所有")
    return {"ok": True}


@router.post("/notifications/_read_all")
async def mark_all_notifs_read(current_user: dict = Depends(get_current_user)):
    n = await v2_notif.mark_all_read(current_user['id'])
    return {"marked": n}


@router.delete("/notifications/{notif_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notif(notif_id: str, current_user: dict = Depends(get_current_user)):
    ok = await v2_notif.delete(notif_id, current_user['id'])
    if not ok:
        raise HTTPException(status_code=404, detail="通知不存在或非你所有")
    return None


# ---------- 测试辅助：手动创建一条通知（不限制，供 smoke test 用） ----------

class _NotifSeed(BaseModel):
    recipient_user_id: int
    type: str = 'system'
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


@router.post("/notifications/_seed", status_code=status.HTTP_201_CREATED)
async def seed_notif(data: _NotifSeed, current_user: dict = Depends(get_current_user)):
    """给指定 user 发一条通知。生产环境应该删掉/锁 admin，这里供联调用。"""
    return await v2_notif.create(
        recipient_user_id=data.recipient_user_id,
        type=data.type,
        source_type=data.source_type,
        source_id=data.source_id,
        payload=data.payload,
    )


# ============================================================
# 阶段 5 · 告警 (alert_rules / alert_events / alert_subscriptions)
# ============================================================

from database.v2 import alert_services as v2_alert


class AlertRuleCreate(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    metric_id: Optional[str] = None
    widget_id: Optional[str] = None
    threshold: Dict[str, Any]                 # {op,value,window,...}
    schedule_cron: Optional[str] = None
    channels: Optional[List[Dict[str, Any]]] = None
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    threshold_json: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None
    channels_json: Optional[List[Dict[str, Any]]] = None
    enabled: Optional[bool] = None


class AlertTrigger(BaseModel):
    current_value: str
    threshold_value: Optional[str] = None
    severity: str = 'warn'           # info / warn / critical
    attribution: Optional[Dict[str, Any]] = None


class AlertSubscribe(BaseModel):
    channel_overrides: Optional[Dict[str, Any]] = None


async def _require_rule_writable(rule_id: str, user_id: int) -> Dict[str, Any]:
    rule = await v2_alert.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    if rule['owner_user_id'] == user_id:
        return rule
    role = await v2_svc.get_member_role(rule['workspace_id'], user_id)
    if role in ('owner', 'admin'):
        return rule
    raise HTTPException(status_code=403, detail="无权修改此规则")


async def _require_rule_readable(rule_id: str, user_id: int) -> Dict[str, Any]:
    rule = await v2_alert.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    role = await v2_svc.get_member_role(rule['workspace_id'], user_id)
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return rule


@router.get("/alert-rules")
async def list_alert_rules(workspace_id: str, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_alert.list_rules(workspace_id)


@router.post("/alert-rules", status_code=status.HTTP_201_CREATED)
async def create_alert_rule(data: AlertRuleCreate, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(data.workspace_id, current_user['id'])
    if role not in ('owner', 'admin', 'editor'):
        raise HTTPException(status_code=403, detail="只有 owner/admin/editor 能创建告警规则")
    rule = await v2_alert.create_rule(
        workspace_id=data.workspace_id,
        owner_user_id=current_user['id'],
        name=data.name, description=data.description,
        metric_id=data.metric_id, widget_id=data.widget_id,
        threshold=data.threshold,
        schedule_cron=data.schedule_cron,
        channels=data.channels, enabled=data.enabled,
    )
    # 同步告警 worker scheduler
    try:
        from services.alert_worker import sync_job
        sync_job(rule)
    except Exception as e:
        print(f'[alert] sync_job 失败: {e}')
    return rule


@router.get("/alert-rules/{rule_id}")
async def get_alert_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    return await _require_rule_readable(rule_id, current_user['id'])


@router.patch("/alert-rules/{rule_id}")
async def update_alert_rule(rule_id: str, data: AlertRuleUpdate, current_user: dict = Depends(get_current_user)):
    await _require_rule_writable(rule_id, current_user['id'])
    rule = await v2_alert.update_rule(rule_id, data.model_dump(exclude_unset=True))
    try:
        from services.alert_worker import sync_job
        if rule:
            sync_job(rule)
    except Exception as e:
        print(f'[alert] sync_job 失败: {e}')
    return rule


@router.delete("/alert-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    await _require_rule_writable(rule_id, current_user['id'])
    await v2_alert.delete_rule(rule_id)
    try:
        from services.alert_worker import remove_job
        remove_job(rule_id)
    except Exception as e:
        print(f'[alert] remove_job 失败: {e}')
    return None


@router.post("/alert-rules/{rule_id}/_eval_now")
async def eval_alert_now(rule_id: str, current_user: dict = Depends(get_current_user)):
    """立刻评估一次规则，绕过 cron。命中阈值会真触发 trigger_event + 通知。"""
    await _require_rule_writable(rule_id, current_user['id'])
    from services.alert_worker import evaluate_rule
    return await evaluate_rule(rule_id)


# --- events ---

@router.get("/alert-events")
async def list_alert_events(
    rule_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    status: Optional[str] = None,   # noqa: A002 — 这里只是查询参数
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    if rule_id:
        await _require_rule_readable(rule_id, current_user['id'])
    elif workspace_id:
        role = await v2_svc.get_member_role(workspace_id, current_user['id'])
        if not role:
            raise HTTPException(status_code=403, detail="不是该工作区成员")
    else:
        raise HTTPException(status_code=400, detail="需要 rule_id 或 workspace_id")
    return await v2_alert.list_events(rule_id=rule_id, workspace_id=workspace_id, status=status, limit=limit)


@router.post("/alert-rules/{rule_id}/_trigger", status_code=status.HTTP_201_CREATED)
async def trigger_alert(rule_id: str, data: AlertTrigger, current_user: dict = Depends(get_current_user)):
    """手动触发一条告警事件 (联调 / 管理员强制触发用)。
    真正的 cron worker 评估留作下次。"""
    await _require_rule_writable(rule_id, current_user['id'])
    return await v2_alert.trigger_event(
        rule_id=rule_id,
        current_value=data.current_value,
        threshold_value=data.threshold_value,
        severity=data.severity,
        attribution=data.attribution,
    )


@router.patch("/alert-events/{event_id}/ack")
async def ack_alert_event(event_id: str, current_user: dict = Depends(get_current_user)):
    ev = await v2_alert.ack_event(event_id, current_user['id'])
    if not ev:
        raise HTTPException(status_code=404, detail="事件不存在")
    return ev


@router.patch("/alert-events/{event_id}/resolve")
async def resolve_alert_event(event_id: str, current_user: dict = Depends(get_current_user)):
    ev = await v2_alert.resolve_event(event_id, current_user['id'])
    if not ev:
        raise HTTPException(status_code=404, detail="事件不存在")
    return ev


# --- subscriptions ---

@router.post("/alert-rules/{rule_id}/subscribe")
async def subscribe_to_alert(rule_id: str, data: AlertSubscribe, current_user: dict = Depends(get_current_user)):
    await _require_rule_readable(rule_id, current_user['id'])
    return await v2_alert.subscribe(rule_id, current_user['id'], data.channel_overrides)


@router.delete("/alert-rules/{rule_id}/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_alert(rule_id: str, current_user: dict = Depends(get_current_user)):
    await _require_rule_readable(rule_id, current_user['id'])
    await v2_alert.unsubscribe(rule_id, current_user['id'])
    return None


@router.get("/alert-rules/{rule_id}/subscribers")
async def list_alert_subscribers(rule_id: str, current_user: dict = Depends(get_current_user)):
    await _require_rule_readable(rule_id, current_user['id'])
    return await v2_alert.list_subscribers(rule_id)


@router.get("/me/alert-subscriptions")
async def list_my_alert_subscriptions(current_user: dict = Depends(get_current_user)):
    return await v2_alert.list_user_subscriptions(current_user['id'])


# ============================================================
# 阶段 6 · 管理后台 (audit / billing / model routes)
# ============================================================

from database.v2 import audit_services as v2_audit
from database.v2 import billing_services as v2_bill
from database.v2 import model_route_services as v2_mr


# ---------- audit ----------

@router.get("/admin/audit")
async def list_audit_logs(
    workspace_id: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    since_days: Optional[int] = 30,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(require_role('admin')),
):
    return await v2_audit.list_logs(
        workspace_id=workspace_id, actor_user_id=actor_user_id,
        target_type=target_type, target_id=target_id,
        since_days=since_days, limit=limit, offset=offset,
    )


@router.get("/admin/audit/_stats")
async def audit_stats(
    workspace_id: str,
    since_days: int = 30,
    current_user: dict = Depends(require_role('admin')),
):
    return await v2_audit.stats_by_action(workspace_id, since_days)


class _AuditSeed(BaseModel):
    action: str
    workspace_id: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    diff: Optional[Dict[str, Any]] = None


@router.post("/admin/audit/_seed")
async def seed_audit(data: _AuditSeed, current_user: dict = Depends(require_role('admin'))):
    """联调用：手动写一条审计。生产环境请改为自动 middleware。"""
    lid = await v2_audit.write(
        actor_user_id=current_user['id'], action=data.action,
        workspace_id=data.workspace_id, target_type=data.target_type,
        target_id=data.target_id, diff=data.diff,
    )
    return {"id": lid}


# ---------- billing ----------

@router.get("/admin/billing/subscription")
async def get_subscription(workspace_id: str, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.get_current_subscription(workspace_id) or {
        'workspace_id': workspace_id, 'plan': 'free', 'billing_cycle': 'monthly',
    }


class _PlanUpgrade(BaseModel):
    workspace_id: str
    plan: str
    billing_cycle: str = 'monthly'
    auto_renew: bool = True


@router.post("/admin/billing/subscription", status_code=status.HTTP_201_CREATED)
async def upgrade_subscription(data: _PlanUpgrade, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.upgrade_plan(data.workspace_id, data.plan, data.billing_cycle, data.auto_renew)


@router.get("/admin/billing/subscription/history")
async def subscription_history(workspace_id: str, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.list_subscription_history(workspace_id)


@router.get("/admin/billing/seats")
async def get_org_seats(workspace_id: str, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.get_seats(workspace_id)


class _SeatsUpdate(BaseModel):
    workspace_id: str
    used_count: Optional[int] = None
    limit_count: Optional[int] = None


@router.patch("/admin/billing/seats")
async def update_org_seats(data: _SeatsUpdate, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.update_seats(data.workspace_id, data.used_count, data.limit_count)


@router.get("/admin/billing/usage")
async def get_usage(workspace_id: str, period: Optional[str] = None, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.get_usage(workspace_id, period)


@router.get("/admin/billing/usage/history")
async def usage_history(workspace_id: str, limit: int = 12, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.list_usage_history(workspace_id, limit)


@router.get("/admin/billing/invoices")
async def list_invoices(workspace_id: str, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.list_invoices(workspace_id)


class _InvoiceCreate(BaseModel):
    workspace_id: str
    period_yyyymm: str
    amount_cents: int
    currency: str = 'CNY'


@router.post("/admin/billing/invoices", status_code=status.HTTP_201_CREATED)
async def create_invoice(data: _InvoiceCreate, current_user: dict = Depends(require_role('admin'))):
    return await v2_bill.create_invoice(
        workspace_id=data.workspace_id, period_yyyymm=data.period_yyyymm,
        amount_cents=data.amount_cents, currency=data.currency,
    )


class _InvoiceStatus(BaseModel):
    status: str  # draft / issued / paid / void


@router.patch("/admin/billing/invoices/{invoice_id}")
async def patch_invoice_status(invoice_id: str, data: _InvoiceStatus, current_user: dict = Depends(require_role('admin'))):
    inv = await v2_bill.update_invoice_status(invoice_id, data.status)
    if not inv:
        raise HTTPException(status_code=404, detail="invoice 不存在或 status 非法")
    return inv


# ---------- model routes ----------

class _ModelRouteCreate(BaseModel):
    workspace_id: str
    intent_pattern: str
    target_model: str
    priority: int = 100
    enabled: bool = True


class _ModelRouteUpdate(BaseModel):
    intent_pattern: Optional[str] = None
    target_model: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None


@router.get("/admin/model-routes")
async def list_model_routes(workspace_id: str, current_user: dict = Depends(require_role('admin'))):
    return await v2_mr.list_routes(workspace_id)


@router.post("/admin/model-routes", status_code=status.HTTP_201_CREATED)
async def create_model_route(data: _ModelRouteCreate, current_user: dict = Depends(require_role('admin'))):
    return await v2_mr.create_route(
        workspace_id=data.workspace_id, intent_pattern=data.intent_pattern,
        target_model=data.target_model, priority=data.priority, enabled=data.enabled,
    )


@router.patch("/admin/model-routes/{route_id}")
async def update_model_route(route_id: str, data: _ModelRouteUpdate, current_user: dict = Depends(require_role('admin'))):
    res = await v2_mr.update_route(route_id, data.model_dump(exclude_unset=True))
    if not res:
        raise HTTPException(status_code=404, detail="route 不存在")
    return res


@router.delete("/admin/model-routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_route(route_id: str, current_user: dict = Depends(require_role('admin'))):
    await v2_mr.delete_route(route_id)
    return None


class _ModelRouteEvaluate(BaseModel):
    workspace_id: str
    intent: str


@router.post("/admin/model-routes/_evaluate")
async def evaluate_model_route(data: _ModelRouteEvaluate, current_user: dict = Depends(require_role('admin'))):
    target = await v2_mr.evaluate(data.workspace_id, data.intent)
    return {"matched_model": target}


# ---------- model budgets ----------

@router.get("/admin/model-budgets")
async def list_budgets(workspace_id: str, period: Optional[str] = None, current_user: dict = Depends(require_role('admin'))):
    return await v2_mr.list_budgets(workspace_id, period)


class _BudgetSet(BaseModel):
    workspace_id: str
    model_name: str
    monthly_cap_usd_cents: int
    alert_threshold_pct: int = 80
    period: Optional[str] = None


@router.post("/admin/model-budgets")
async def set_budget(data: _BudgetSet, current_user: dict = Depends(require_role('admin'))):
    return await v2_mr.set_budget(
        data.workspace_id, data.model_name,
        data.monthly_cap_usd_cents, data.alert_threshold_pct, data.period,
    )


# ---------- api keys v2 ----------

class _ApiKeyCreate(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=128)
    scopes: Optional[List[str]] = None


@router.get("/admin/api-keys")
async def list_api_keys(workspace_id: str, include_revoked: bool = False, current_user: dict = Depends(require_role('admin'))):
    return await v2_mr.list_keys(workspace_id, include_revoked)


@router.post("/admin/api-keys", status_code=status.HTTP_201_CREATED)
async def create_api_key(data: _ApiKeyCreate, current_user: dict = Depends(require_role('admin'))):
    """创建新 Key。raw_key 只在响应里返回一次，之后只能看 prefix。"""
    return await v2_mr.create_key(
        workspace_id=data.workspace_id, created_by_user_id=current_user['id'],
        name=data.name, scopes=data.scopes,
    )


@router.post("/admin/api-keys/{key_id}/rotate", status_code=status.HTTP_201_CREATED)
async def rotate_api_key(key_id: str, current_user: dict = Depends(require_role('admin'))):
    res = await v2_mr.rotate_key(key_id, current_user['id'])
    if not res:
        raise HTTPException(status_code=404, detail="key 不存在")
    return res


@router.post("/admin/api-keys/{key_id}/revoke")
async def revoke_api_key(key_id: str, current_user: dict = Depends(require_role('admin'))):
    await v2_mr.revoke_key(key_id)
    return {"ok": True}


# ============================================================
# 阶段 7 · 设置中心 · 安全 (user_2fa / login_sessions / oauth_apps)
# 全部针对当前用户 (current_user['id'])，不需要 admin 角色
# ============================================================

from database.v2 import security_services as v2_sec


class _2FAVerify(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


# ---------- 2FA ----------

@router.get("/me/security/2fa")
async def get_2fa_status(current_user: dict = Depends(get_current_user)):
    return await v2_sec.get_2fa_status(current_user['id'])


@router.post("/me/security/2fa/setup")
async def setup_my_2fa(current_user: dict = Depends(get_current_user)):
    """开始设置 2FA。返回 secret + otpauth_url + 备份码 (明文，只此一次)。"""
    return await v2_sec.setup_2fa(current_user['id'])


@router.post("/me/security/2fa/verify")
async def verify_my_2fa(data: _2FAVerify, current_user: dict = Depends(get_current_user)):
    """验证一次性 TOTP 码并启用 2FA。"""
    ok = await v2_sec.verify_and_enable_2fa(current_user['id'], data.code)
    if not ok:
        raise HTTPException(status_code=400, detail="验证码错误 (本阶段 mock：必须是 6 位数字)")
    return {"enabled": True}


@router.delete("/me/security/2fa", status_code=status.HTTP_204_NO_CONTENT)
async def disable_my_2fa(current_user: dict = Depends(get_current_user)):
    await v2_sec.disable_2fa(current_user['id'])
    return None


@router.post("/me/security/2fa/regenerate-backup-codes")
async def regenerate_backup_codes(current_user: dict = Depends(get_current_user)):
    codes = await v2_sec.regenerate_backup_codes(current_user['id'])
    if not codes:
        raise HTTPException(status_code=404, detail="尚未启用 2FA")
    return {"backup_codes": codes}


# ---------- login sessions ----------

@router.get("/me/security/sessions")
async def list_my_login_sessions(only_active: bool = True, current_user: dict = Depends(get_current_user)):
    return await v2_sec.list_login_sessions(current_user['id'], only_active)


class _SessionSeed(BaseModel):
    ip: Optional[str] = None
    ua: Optional[str] = None
    device_label: Optional[str] = None


@router.post("/me/security/sessions/_seed", status_code=status.HTTP_201_CREATED)
async def seed_login_session(data: _SessionSeed, current_user: dict = Depends(get_current_user)):
    """联调用：手动写一条登录会话。真实登录链路应该自动调。"""
    return await v2_sec.create_login_session(current_user['id'], data.ip, data.ua, data.device_label)


@router.delete("/me/security/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_login_session(session_id: str, current_user: dict = Depends(get_current_user)):
    ok = await v2_sec.revoke_login_session(session_id, current_user['id'])
    if not ok:
        raise HTTPException(status_code=404, detail="会话不存在或非你所有")
    return None


@router.post("/me/security/sessions/_revoke_others")
async def revoke_other_sessions(current_user: dict = Depends(get_current_user)):
    n = await v2_sec.revoke_all_other_sessions(current_user['id'])
    return {"revoked": n}


# ---------- oauth authorized apps ----------

@router.get("/me/security/oauth-apps")
async def list_my_oauth_apps(only_active: bool = True, current_user: dict = Depends(get_current_user)):
    return await v2_sec.list_authorized_apps(current_user['id'], only_active)


class _AppSeed(BaseModel):
    client_id: str
    client_name: str
    scope: Optional[List[str]] = None


@router.post("/me/security/oauth-apps/_seed", status_code=status.HTTP_201_CREATED)
async def seed_oauth_app(data: _AppSeed, current_user: dict = Depends(get_current_user)):
    """联调用：手动 grant 一条授权。真实 OAuth 流程应自动调。"""
    return await v2_sec.grant_app_authorization(
        current_user['id'], data.client_id, data.client_name, data.scope,
    )


@router.delete("/me/security/oauth-apps/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_oauth_app(app_id: str, current_user: dict = Depends(get_current_user)):
    ok = await v2_sec.revoke_authorized_app(app_id, current_user['id'])
    if not ok:
        raise HTTPException(status_code=404, detail="授权不存在或非你所有")
    return None


# ============================================================
# 节点详情 · /nodes/{id}/* (依赖阶段 2 已建的 node_comments / node_mentions 表)
# ============================================================

from database.v2 import node_services as v2_node


async def _require_node_readable(node_id: str, user_id: int) -> Dict[str, Any]:
    """node 可读 = 所在 session 的 owner 或 workspace 成员。"""
    detail = await v2_node.get_node_detail(node_id)
    if not detail:
        raise HTTPException(status_code=404, detail="节点不存在")
    sid = detail['session_id']
    ses = await v2_canvas.get_session(sid)
    if not ses:
        raise HTTPException(status_code=404, detail="所属会话不存在")
    if ses['owner_user_id'] == user_id:
        return detail
    role = await v2_svc.get_member_role(ses['workspace_id'], user_id)
    if not role:
        raise HTTPException(status_code=403, detail="无权访问此节点")
    return detail


class _CommentAdd(BaseModel):
    body: str = Field(..., min_length=1)
    parent_comment_id: Optional[str] = None
    mentions: Optional[List[int]] = None


class _NodeStatusUpdate(BaseModel):
    clarify_status: Optional[str] = None
    hitl_status: Optional[str] = None


@router.get("/nodes/{node_id}")
async def get_node(node_id: str, current_user: dict = Depends(get_current_user)):
    return await _require_node_readable(node_id, current_user['id'])


@router.get("/nodes/{node_id}/comments")
async def list_node_comments(node_id: str, current_user: dict = Depends(get_current_user)):
    await _require_node_readable(node_id, current_user['id'])
    return await v2_node.list_comments(node_id)


@router.post("/nodes/{node_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_node_comment(node_id: str, data: _CommentAdd, current_user: dict = Depends(get_current_user)):
    await _require_node_readable(node_id, current_user['id'])
    return await v2_node.add_comment(
        node_id, current_user['id'], data.body,
        parent_comment_id=data.parent_comment_id, mentions=data.mentions,
    )


@router.post("/nodes/{node_id}/comments/{comment_id}/resolve")
async def resolve_node_comment(node_id: str, comment_id: str, current_user: dict = Depends(get_current_user)):
    await _require_node_readable(node_id, current_user['id'])
    c = await v2_node.resolve_comment(comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="评论不存在")
    return c


@router.delete("/nodes/{node_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node_comment(node_id: str, comment_id: str, current_user: dict = Depends(get_current_user)):
    ok = await v2_node.delete_comment(comment_id, current_user['id'])
    if not ok:
        raise HTTPException(status_code=403, detail="无权删除此评论或评论不存在")
    return None


@router.get("/nodes/{node_id}/versions")
async def list_node_versions(node_id: str, current_user: dict = Depends(get_current_user)):
    detail = await _require_node_readable(node_id, current_user['id'])
    return await v2_node.list_message_versions(detail['message_id'])


@router.patch("/nodes/{node_id}/status")
async def update_node_status(node_id: str, data: _NodeStatusUpdate, current_user: dict = Depends(get_current_user)):
    await _require_node_readable(node_id, current_user['id'])
    out = None
    if data.clarify_status is not None:
        out = await v2_node.set_clarify_status(node_id, data.clarify_status)
        if out is None:
            raise HTTPException(status_code=400, detail="非法 clarify_status")
    if data.hitl_status is not None:
        out = await v2_node.set_hitl_status(node_id, data.hitl_status)
        if out is None:
            raise HTTPException(status_code=400, detail="非法 hitl_status")
    return out or {"ok": True}


@router.get("/nodes/{node_id}/_delete_impact")
async def get_node_delete_impact(node_id: str, current_user: dict = Depends(get_current_user)):
    await _require_node_readable(node_id, current_user['id'])
    return await v2_node.get_delete_impact(node_id)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node_endpoint(
    node_id: str, cascade: bool = False,
    current_user: dict = Depends(get_current_user),
):
    detail = await _require_node_readable(node_id, current_user['id'])
    # 写权限：session owner 才能删
    ses = await v2_canvas.get_session(detail['session_id'])
    if ses and ses['owner_user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="只有会话拥有者能删节点")
    ok = await v2_node.delete_node(node_id, cascade=cascade)
    if not ok:
        raise HTTPException(status_code=404, detail="节点不存在")
    return None


# ============================================================
# 阶段 8 MVP · 语义层/指标中心 (datasource_tables / column_meta / column_semantic_tags / metrics / synonyms / lineage)
# 注：DSL 解析、AI 同义词、向量匹配留待后续
# ============================================================

from database.v2 import semantic_services as v2_sem


class _TableUpsert(BaseModel):
    ds_id: str
    schema_name: str
    table_name: str
    row_count_estimate: int = 0
    comment: Optional[str] = None


class _ColumnUpsert(BaseModel):
    ds_id: str
    schema_name: str
    table_name: str
    column_name: str
    dtype: Optional[str] = None
    null_ratio: int = 0
    distinct_count: int = 0
    sample_values: Optional[List[Any]] = None
    comment: Optional[str] = None


class _TagUpsert(BaseModel):
    tag_name: str
    confidence: int = 100
    source: str = 'manual'


class _MetricCreate(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1)
    expression: str = Field(..., min_length=1)
    biz_definition: Optional[str] = None
    unit: Optional[str] = None


class _MetricUpdate(BaseModel):
    name: Optional[str] = None
    expression: Optional[str] = None
    biz_definition: Optional[str] = None
    unit: Optional[str] = None


class _SynonymAdd(BaseModel):
    synonym_text: str
    weight: int = 100
    source: str = 'user'


class _LineageAdd(BaseModel):
    to_type: str   # metric / table_column
    to_id: str
    relation: str = 'uses'


# ---------- datasource tables ----------

@router.get("/semantic/tables")
async def list_ds_tables(
    ds_id: str, schema_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await v2_sem.list_tables(ds_id, schema_name)


@router.post("/semantic/tables", status_code=status.HTTP_201_CREATED)
async def upsert_ds_table(data: _TableUpsert, current_user: dict = Depends(get_current_user)):
    return await v2_sem.upsert_table_meta(
        data.ds_id, data.schema_name, data.table_name,
        row_count_estimate=data.row_count_estimate, comment=data.comment,
    )


# ---------- columns ----------

@router.get("/semantic/columns")
async def list_ds_columns(
    ds_id: str, schema_name: str, table_name: str,
    current_user: dict = Depends(get_current_user),
):
    return await v2_sem.list_columns(ds_id, schema_name, table_name)


@router.post("/semantic/columns", status_code=status.HTTP_201_CREATED)
async def upsert_ds_column(data: _ColumnUpsert, current_user: dict = Depends(get_current_user)):
    return await v2_sem.upsert_column(
        data.ds_id, data.schema_name, data.table_name, data.column_name,
        dtype=data.dtype, null_ratio=data.null_ratio,
        distinct_count=data.distinct_count,
        sample_values=data.sample_values, comment=data.comment,
    )


# ---------- column tags ----------

@router.get("/semantic/columns/{column_id}/tags")
async def list_column_tags(column_id: str, current_user: dict = Depends(get_current_user)):
    return await v2_sem.list_tags(column_id)


@router.post("/semantic/columns/{column_id}/tags", status_code=status.HTTP_201_CREATED)
async def add_column_tag(column_id: str, data: _TagUpsert, current_user: dict = Depends(get_current_user)):
    return await v2_sem.upsert_tag(
        column_id, data.tag_name,
        confidence=data.confidence, source=data.source, tagged_by=current_user['id'],
    )


@router.delete("/semantic/columns/{column_id}/tags/{tag_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column_tag(column_id: str, tag_name: str, current_user: dict = Depends(get_current_user)):
    await v2_sem.remove_tag(column_id, tag_name)
    return None


# ---------- metrics ----------

@router.get("/semantic/metrics")
async def list_metrics(workspace_id: str, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_sem.list_metrics(workspace_id)


@router.post("/semantic/metrics", status_code=status.HTTP_201_CREATED)
async def create_metric(data: _MetricCreate, current_user: dict = Depends(get_current_user)):
    role = await v2_svc.get_member_role(data.workspace_id, current_user['id'])
    if role not in ('owner', 'admin', 'editor'):
        raise HTTPException(status_code=403, detail="只有 owner/admin/editor 能创建指标")
    return await v2_sem.create_metric(
        workspace_id=data.workspace_id, owner_user_id=current_user['id'],
        name=data.name, expression=data.expression,
        biz_definition=data.biz_definition, unit=data.unit,
    )


@router.get("/semantic/metrics/{metric_id}")
async def get_metric(metric_id: str, current_user: dict = Depends(get_current_user)):
    m = await v2_sem.get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="metric 不存在")
    return m


@router.patch("/semantic/metrics/{metric_id}")
async def update_metric(metric_id: str, data: _MetricUpdate, current_user: dict = Depends(get_current_user)):
    m = await v2_sem.get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="metric 不存在")
    if m['owner_user_id'] != current_user['id']:
        role = await v2_svc.get_member_role(m['workspace_id'], current_user['id'])
        if role not in ('owner', 'admin'):
            raise HTTPException(status_code=403, detail="无权修改此指标")
    return await v2_sem.update_metric(metric_id, data.model_dump(exclude_unset=True))


@router.delete("/semantic/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric(metric_id: str, current_user: dict = Depends(get_current_user)):
    m = await v2_sem.get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="metric 不存在")
    if m['owner_user_id'] != current_user['id']:
        role = await v2_svc.get_member_role(m['workspace_id'], current_user['id'])
        if role not in ('owner', 'admin'):
            raise HTTPException(status_code=403, detail="无权删除")
    await v2_sem.delete_metric(metric_id)
    return None


@router.get("/semantic/search-metrics")
async def search_metric(workspace_id: str, q: str, limit: int = 10, current_user: dict = Depends(get_current_user)):
    """注意：路径用 search-metrics 而非 metrics/_search，避免被 /metrics/{metric_id} 吃掉。"""
    role = await v2_svc.get_member_role(workspace_id, current_user['id'])
    if not role:
        raise HTTPException(status_code=403, detail="不是该工作区成员")
    return await v2_sem.search_metrics(workspace_id, q, limit)


# ---------- synonyms ----------

@router.get("/semantic/metrics/{metric_id}/synonyms")
async def list_metric_synonyms(metric_id: str, current_user: dict = Depends(get_current_user)):
    return await v2_sem.list_synonyms(metric_id)


@router.post("/semantic/metrics/{metric_id}/synonyms", status_code=status.HTTP_201_CREATED)
async def add_metric_synonym(metric_id: str, data: _SynonymAdd, current_user: dict = Depends(get_current_user)):
    return await v2_sem.add_synonym(metric_id, data.synonym_text, data.weight, data.source)


@router.delete("/semantic/metrics/{metric_id}/synonyms/{synonym_text}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric_synonym(metric_id: str, synonym_text: str, current_user: dict = Depends(get_current_user)):
    await v2_sem.remove_synonym(metric_id, synonym_text)
    return None


# ---------- lineage ----------

@router.get("/semantic/metrics/{metric_id}/lineage")
async def list_metric_lineage(metric_id: str, current_user: dict = Depends(get_current_user)):
    return await v2_sem.list_lineage(metric_id)


@router.post("/semantic/metrics/{metric_id}/lineage", status_code=status.HTTP_201_CREATED)
async def add_metric_lineage(metric_id: str, data: _LineageAdd, current_user: dict = Depends(get_current_user)):
    try:
        return await v2_sem.add_lineage(metric_id, data.to_type, data.to_id, data.relation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/semantic/metrics/{metric_id}/lineage/{to_type}/{to_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric_lineage(metric_id: str, to_type: str, to_id: str, current_user: dict = Depends(get_current_user)):
    await v2_sem.remove_lineage(metric_id, to_type, to_id)
    return None
