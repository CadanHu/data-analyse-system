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
