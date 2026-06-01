"""阶段 3 — boards / board_widgets / board_versions / board_templates CRUD。

权限模型 (与 workspace_members.role 联动):
- list/get  : workspace 成员都能看 (viewer 以上)
- create    : workspace owner/admin/editor
- update/delete board: board 的 owner_user_id 或 workspace owner/admin
- widget 增删改 : 同上 (board owner 或 workspace owner/admin)
- template list  : 所有登录用户
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import (
    BoardModel, BoardWidgetModel, BoardVersionModel, BoardTemplateModel,
    CanvasNodeModel, V2MessageModel,
)


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ============================================================
# Boards
# ============================================================

async def list_boards(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(BoardModel)
            .where(BoardModel.workspace_id == workspace_id)
            .order_by(BoardModel.updated_at.desc())
        )
        return [_to_dict(b) for b in res.scalars().all()]


async def get_board(board_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(BoardModel).where(BoardModel.id == board_id))
        b = res.scalar_one_or_none()
        return _to_dict(b) if b else None


async def create_board(
    workspace_id: str,
    owner_user_id: int,
    title: str,
    description: Optional[str] = None,
    grid_cols: int = 12,
    from_template_id: Optional[str] = None,
) -> Dict[str, Any]:
    bid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        b = BoardModel(
            id=bid, workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            title=title, description=description,
            grid_cols=grid_cols, from_template_id=from_template_id,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(b)
        await s.commit()
        return _to_dict(b)


async def update_board(board_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ALLOWED = {'title', 'description', 'grid_cols', 'schedule_cron'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return await get_board(board_id)
    async with v2_db.async_session() as s:
        res = await s.execute(select(BoardModel).where(BoardModel.id == board_id))
        b = res.scalar_one_or_none()
        if not b:
            return None
        for k, v in cleaned.items():
            setattr(b, k, v)
        await s.commit()
        return _to_dict(b)


async def delete_board(board_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(BoardWidgetModel).where(BoardWidgetModel.board_id == board_id))
        await s.execute(sa_delete(BoardVersionModel).where(BoardVersionModel.board_id == board_id))
        await s.execute(sa_delete(BoardModel).where(BoardModel.id == board_id))
        await s.commit()


# ============================================================
# Widgets — "钉到看板" 的核心
# ============================================================

async def list_widgets(board_id: str) -> List[Dict[str, Any]]:
    """列看板上的所有 widget，并 JOIN 节点 + 消息让前端能直接渲染图表。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(BoardWidgetModel, CanvasNodeModel, V2MessageModel)
            .join(CanvasNodeModel, CanvasNodeModel.id == BoardWidgetModel.source_node_id)
            .join(V2MessageModel, V2MessageModel.id == CanvasNodeModel.message_id)
            .where(BoardWidgetModel.board_id == board_id)
            .order_by(BoardWidgetModel.order_index)
        )
        out = []
        for widget, node, msg in res.all():
            out.append({
                'widget_id': widget.id,
                'board_id': widget.board_id,
                'source_node_id': widget.source_node_id,
                'node_session_id': node.session_id,   # DAT-28 · 跳回画布需要 session 才能定位节点
                'grid_x': widget.grid_x,
                'grid_y': widget.grid_y,
                'w': widget.w,
                'h': widget.h,
                'override_cfg_json': widget.override_cfg_json,
                'order_index': widget.order_index,
                # 来源节点信息 (前端渲染图表用)
                'node_role': msg.role,
                'node_content': msg.content,
                'node_sql': msg.sql,
                'node_chart_cfg_json': msg.chart_cfg_json,
                'node_branch_label': node.branch_label,
            })
        return out


async def get_widget_source(widget_id: str) -> Optional[Dict[str, Any]]:
    """DAT-28 · 解析一个 board widget 的源数据位置:
    widget → source_node_id → 该节点所在 session。供告警/看板跳回画布定位用。
    widget 不存在或源节点已删返回 None。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(BoardWidgetModel, CanvasNodeModel)
            .join(CanvasNodeModel, CanvasNodeModel.id == BoardWidgetModel.source_node_id)
            .where(BoardWidgetModel.id == widget_id)
        )
        row = res.first()
        if not row:
            return None
        widget, node = row
        return {
            'widget_id': widget.id,
            'board_id': widget.board_id,
            'source_node_id': widget.source_node_id,
            'session_id': node.session_id,
        }


async def pin_node_to_board(
    board_id: str,
    source_node_id: str,
    grid_x: int = 0,
    grid_y: int = 0,
    w: int = 4,
    h: int = 3,
    override_cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """把一个 canvas_node 钉到看板。同步把 canvas_nodes.pinned_to_board_id 标记上。"""
    wid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        # 算 order_index
        from sqlalchemy import func
        res = await s.execute(
            select(func.count(BoardWidgetModel.id)).where(BoardWidgetModel.board_id == board_id)
        )
        order = res.scalar() or 0

        widget = BoardWidgetModel(
            id=wid, board_id=board_id, source_node_id=source_node_id,
            grid_x=grid_x, grid_y=grid_y, w=w, h=h,
            override_cfg_json=override_cfg, order_index=order,
            created_at=datetime.utcnow(),
        )
        s.add(widget)

        # 同步更新 canvas_node.pinned_to_board_id
        res2 = await s.execute(
            select(CanvasNodeModel).where(CanvasNodeModel.id == source_node_id)
        )
        node = res2.scalar_one_or_none()
        if node:
            node.pinned_to_board_id = board_id

        await s.commit()
        return _to_dict(widget)


async def update_widget(widget_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ALLOWED = {'grid_x', 'grid_y', 'w', 'h', 'override_cfg_json', 'order_index'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return None
    async with v2_db.async_session() as s:
        res = await s.execute(select(BoardWidgetModel).where(BoardWidgetModel.id == widget_id))
        w = res.scalar_one_or_none()
        if not w:
            return None
        for k, v in cleaned.items():
            setattr(w, k, v)
        await s.commit()
        return _to_dict(w)


async def delete_widget(widget_id: str) -> None:
    """删 widget，同步清掉 canvas_node.pinned_to_board_id (如果这是唯一的引用)。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(BoardWidgetModel).where(BoardWidgetModel.id == widget_id))
        w = res.scalar_one_or_none()
        if not w:
            return
        source_node_id = w.source_node_id
        await s.execute(sa_delete(BoardWidgetModel).where(BoardWidgetModel.id == widget_id))

        # 如果该 node 不再被任何 widget 引用，清掉 pinned 标记
        res2 = await s.execute(
            select(BoardWidgetModel.id).where(BoardWidgetModel.source_node_id == source_node_id)
        )
        if not res2.first():
            res3 = await s.execute(select(CanvasNodeModel).where(CanvasNodeModel.id == source_node_id))
            node = res3.scalar_one_or_none()
            if node:
                node.pinned_to_board_id = None

        await s.commit()


# ============================================================
# Templates
# ============================================================

async def list_templates(category: Optional[str] = None) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(BoardTemplateModel)
        if category:
            stmt = stmt.where(BoardTemplateModel.category == category)
        stmt = stmt.order_by(BoardTemplateModel.is_builtin.desc(), BoardTemplateModel.created_at)
        res = await s.execute(stmt)
        return [_to_dict(t) for t in res.scalars().all()]


async def seed_builtin_templates_if_empty() -> int:
    """启动时调一次：如果 board_templates 表空，灌 6 个内置模板。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(BoardTemplateModel.id).limit(1))
        if res.first():
            return 0
        builtin = [
            ('exec', '高管 · 本周一图', None),
            ('exec', '高管 · 月度财务摘要', None),
            ('sales', '销售 · 管线 + 区域漏斗', None),
            ('pm', '产品 · 健康度 + A/B 实验', None),
            ('ops', '运营 · Q3 渠道复盘', None),
            ('analyst', '分析师 · 自由探索起手式', None),
        ]
        for cat, name, url in builtin:
            s.add(BoardTemplateModel(
                id=str(uuid.uuid4()), category=cat, name=name,
                preview_url=url, layout_json={'widgets': []},
                is_builtin=True, created_at=datetime.utcnow(),
            ))
        await s.commit()
        return len(builtin)
