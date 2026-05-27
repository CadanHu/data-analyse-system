"""阶段 2 — v2_sessions / v2_messages / canvas_nodes 的 CRUD。

设计原则:
- 每个 v2_message 落表时同步建一个 canvas_node (1:1)
- 默认 parent_node_id = 上一节点（线性时间线），分支由前端传 parent_node_id 显式建
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import V2SessionModel, V2MessageModel, CanvasNodeModel, NodeCommentModel


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ============================================================
# v2_sessions
# ============================================================

async def list_sessions(workspace_id: str, user_id: int) -> List[Dict[str, Any]]:
    """列工作区下当前用户能看到的会话 (现在等价于 owner_user_id = user_id；将来接 share 表后扩展)。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(V2SessionModel)
            .where(V2SessionModel.workspace_id == workspace_id)
            .where(V2SessionModel.owner_user_id == user_id)
            .order_by(V2SessionModel.updated_at.desc())
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(V2SessionModel).where(V2SessionModel.id == session_id))
        r = res.scalar_one_or_none()
        return _to_dict(r) if r else None


async def create_session(
    workspace_id: str,
    owner_user_id: int,
    title: Optional[str] = None,
    model_provider: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    sid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        ses = V2SessionModel(
            id=sid, workspace_id=workspace_id, owner_user_id=owner_user_id,
            title=title or '新会话',
            model_provider=model_provider, model_name=model_name,
            mode_flags_json={},
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(ses)
        await s.commit()
        return _to_dict(ses)


async def update_session_title(session_id: str, title: str) -> None:
    async with v2_db.async_session() as s:
        res = await s.execute(select(V2SessionModel).where(V2SessionModel.id == session_id))
        r = res.scalar_one_or_none()
        if r:
            r.title = title
            await s.commit()


async def delete_session(session_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(CanvasNodeModel).where(CanvasNodeModel.session_id == session_id))
        await s.execute(sa_delete(V2MessageModel).where(V2MessageModel.session_id == session_id))
        await s.execute(sa_delete(V2SessionModel).where(V2SessionModel.id == session_id))
        await s.commit()


# ============================================================
# v2_messages + canvas_nodes (1:1，统一封装)
# ============================================================

async def add_message_with_node(
    session_id: str,
    role: str,
    content: Optional[str],
    *,
    parent_msg_id: Optional[str] = None,
    parent_node_id: Optional[str] = None,
    sql: Optional[str] = None,
    chart_cfg: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    thinking_steps: Optional[List[str]] = None,
    elapsed_ms: Optional[int] = None,
    model_provider: Optional[str] = None,
    model_name: Optional[str] = None,
    branch_label: Optional[str] = None,
    message_id: Optional[str] = None,
    node_id: Optional[str] = None,
) -> Dict[str, Any]:
    """新增一条消息 + 1:1 对应 canvas_node。返回 {message, node}。"""
    mid = message_id or str(uuid.uuid4())
    nid = node_id or str(uuid.uuid4())

    async with v2_db.async_session() as s:
        # 算 position_index = MAX(已有) + 1
        # (用 COUNT 在删过节点后会算回已用过的 pos，导致冲突)
        from sqlalchemy import func
        res = await s.execute(
            select(func.coalesce(func.max(CanvasNodeModel.position_index), -1) + 1)
            .where(CanvasNodeModel.session_id == session_id)
        )
        pos = res.scalar() or 0

        # 默认 parent_node_id = 当前最后一个节点（线性时间线），除非显式指定（分支）
        if parent_node_id is None and pos > 0:
            res2 = await s.execute(
                select(CanvasNodeModel.id)
                .where(CanvasNodeModel.session_id == session_id)
                .order_by(CanvasNodeModel.position_index.desc())
                .limit(1)
            )
            last = res2.scalar_one_or_none()
            parent_node_id = last

        msg = V2MessageModel(
            id=mid, session_id=session_id, parent_msg_id=parent_msg_id,
            role=role, content=content, sql=sql,
            chart_cfg_json=chart_cfg, data_json=data,
            thinking_steps_json=thinking_steps, elapsed_ms=elapsed_ms,
            model_provider=model_provider, model_name=model_name,
            created_at=datetime.utcnow(),
        )
        node = CanvasNodeModel(
            id=nid, session_id=session_id,
            parent_node_id=parent_node_id, message_id=mid,
            branch_label=branch_label, position_index=pos,
            created_at=datetime.utcnow(),
        )
        s.add_all([msg, node])
        await s.commit()
        return {'message': _to_dict(msg), 'node': _to_dict(node)}


async def update_message(message_id: str, updates: Dict[str, Any]) -> None:
    """流式时更新已建好的 message (内容/SQL/chart 渐增)。"""
    ALLOWED = {
        'content', 'sql', 'chart_cfg_json', 'data_json',
        'thinking_steps_json', 'elapsed_ms', 'tokens_prompt', 'tokens_completion',
        'confidence',
    }
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return
    async with v2_db.async_session() as s:
        res = await s.execute(select(V2MessageModel).where(V2MessageModel.id == message_id))
        m = res.scalar_one_or_none()
        if m:
            for k, v in cleaned.items():
                setattr(m, k, v)
            await s.commit()


async def list_canvas_nodes(session_id: str) -> List[Dict[str, Any]]:
    """列时间线节点 (JOIN messages，按 position_index 升序)。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(CanvasNodeModel, V2MessageModel)
            .join(V2MessageModel, V2MessageModel.id == CanvasNodeModel.message_id)
            .where(CanvasNodeModel.session_id == session_id)
            .order_by(CanvasNodeModel.position_index)
        )
        out = []
        for node, msg in res.all():
            out.append({
                # canvas_node 字段
                'node_id': node.id,
                'parent_node_id': node.parent_node_id,
                'branch_label': node.branch_label,
                'pinned_to_board_id': node.pinned_to_board_id,
                'position_index': node.position_index,
                'clarify_status': node.clarify_status,
                'hitl_status': node.hitl_status,
                # message 字段
                'message_id': msg.id,
                'role': msg.role,
                'content': msg.content,
                'sql': msg.sql,
                'chart_cfg_json': msg.chart_cfg_json,
                'data_json': msg.data_json,
                'thinking_steps_json': msg.thinking_steps_json,
                'elapsed_ms': msg.elapsed_ms,
                'created_at': msg.created_at,
            })
        return out
