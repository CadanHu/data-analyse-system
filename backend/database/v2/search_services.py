"""DAT-32 第五波 · 全局搜索聚合(⌘K 命令面板后端)。

对 v2 几类资源做包含匹配,按类型分组返回。结果结构与第一波 URL 协议
(前端 v2Urls / notifJumpUrl)对齐,前端据 type + id 跳转:
- sessions: v2_sessions.title           (workspace 内)
- boards:   boards.title                (workspace 内)
- metrics:  metrics.name                (workspace 内)
- nodes:    canvas_nodes.branch_label   (join v2_sessions 限定 workspace)
- notifications: 当前用户最近通知,Python 端按 payload/type 文本过滤(该表无 workspace 列)
"""
from typing import List, Dict, Any
from sqlalchemy.future import select

from .base import v2_db
from .models import V2SessionModel, BoardModel, MetricModel, CanvasNodeModel
from . import notification_services

_EMPTY = {'sessions': [], 'boards': [], 'metrics': [], 'nodes': [], 'notifications': []}


def _like(q: str) -> str:
    """转义 LIKE 通配符后做包含匹配。"""
    esc = q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{esc}%'


async def global_search(
    workspace_id: str, user_id: int, q: str, limit_per_type: int = 5,
) -> Dict[str, List[Dict[str, Any]]]:
    q = (q or '').strip()
    if not q:
        return {k: [] for k in _EMPTY}
    pat = _like(q)
    out: Dict[str, List[Dict[str, Any]]] = {}

    async with v2_db.async_session() as s:
        # sessions
        rows = (await s.execute(
            select(V2SessionModel.id, V2SessionModel.title)
            .where(V2SessionModel.workspace_id == workspace_id)
            .where(V2SessionModel.title.ilike(pat))
            .order_by(V2SessionModel.updated_at.desc()).limit(limit_per_type)
        )).all()
        out['sessions'] = [{'id': r[0], 'label': r[1] or '(未命名会话)'} for r in rows]

        # boards
        rows = (await s.execute(
            select(BoardModel.id, BoardModel.title)
            .where(BoardModel.workspace_id == workspace_id)
            .where(BoardModel.title.ilike(pat))
            .order_by(BoardModel.updated_at.desc()).limit(limit_per_type)
        )).all()
        out['boards'] = [{'id': r[0], 'label': r[1]} for r in rows]

        # metrics
        rows = (await s.execute(
            select(MetricModel.id, MetricModel.name)
            .where(MetricModel.workspace_id == workspace_id)
            .where(MetricModel.name.ilike(pat))
            .order_by(MetricModel.updated_at.desc()).limit(limit_per_type)
        )).all()
        out['metrics'] = [{'id': r[0], 'label': r[1]} for r in rows]

        # nodes — 搜分支名,join v2_sessions 限定 workspace
        rows = (await s.execute(
            select(CanvasNodeModel.id, CanvasNodeModel.branch_label, CanvasNodeModel.session_id)
            .join(V2SessionModel, V2SessionModel.id == CanvasNodeModel.session_id)
            .where(V2SessionModel.workspace_id == workspace_id)
            .where(CanvasNodeModel.branch_label.ilike(pat))
            .order_by(CanvasNodeModel.created_at.desc()).limit(limit_per_type)
        )).all()
        out['nodes'] = [{'id': r[0], 'label': r[1], 'session_id': r[2]} for r in rows]

    # notifications — 无 workspace 列,取当前用户最近通知 Python 端过滤
    ql = q.lower()
    matched: List[Dict[str, Any]] = []
    for n in await notification_services.list_for_user(user_id, only_unread=False, limit=50):
        payload = n.get('payload_json') if isinstance(n.get('payload_json'), dict) else {}
        haystack = ' '.join(str(x) for x in [
            n.get('type'), n.get('source_type'), n.get('source_id'),
            payload.get('title'), payload.get('body'), n.get('payload_json'),
        ] if x).lower()
        if ql in haystack:
            matched.append({
                'id': n['id'],
                'label': payload.get('title') or payload.get('body') or n.get('type'),
                'type': n.get('type'), 'source_type': n.get('source_type'),
                'source_id': n.get('source_id'), 'payload_json': n.get('payload_json'),
            })
        if len(matched) >= limit_per_type:
            break
    out['notifications'] = matched

    return out
