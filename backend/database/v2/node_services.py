"""节点附属：comments + mentions + version 简化(基于 v2_messages.parent_msg_id 链)。

node_comments / node_mentions 表已在阶段 2 建好。
节点版本概念暂时用 v2_messages.parent_msg_id 链表示（LLM 候选树）。
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import (
    NodeCommentModel, NodeMentionModel,
    CanvasNodeModel, V2MessageModel, NotificationModel,
)


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ---------- comments ----------

async def list_comments(node_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(NodeCommentModel)
            .where(NodeCommentModel.node_id == node_id)
            .order_by(NodeCommentModel.created_at)
        )
        return [_to_dict(c) for c in res.scalars().all()]


async def add_comment(
    node_id: str, user_id: int, body: str,
    parent_comment_id: Optional[str] = None,
    mentions: Optional[List[int]] = None,
) -> Dict[str, Any]:
    cid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        c = NodeCommentModel(
            id=cid, node_id=node_id, user_id=user_id, body=body,
            parent_comment_id=parent_comment_id, created_at=datetime.utcnow(),
        )
        s.add(c)
        # 处理 @提及 + 写通知
        for uid in (mentions or []):
            if uid == user_id:
                continue
            s.add(NodeMentionModel(
                node_id=node_id, mentioned_user_id=uid,
                by_user_id=user_id, created_at=datetime.utcnow(),
            ))
            s.add(NotificationModel(
                id=str(uuid.uuid4()),
                recipient_user_id=uid, type='mention',
                source_type='node', source_id=node_id,
                payload_json={
                    'title': f'你被 @ 了',
                    'body': body[:120],
                    'comment_id': cid, 'by_user_id': user_id,
                },
                created_at=datetime.utcnow(),
            ))
        await s.commit()
        return _to_dict(c)


async def resolve_comment(comment_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(NodeCommentModel).where(NodeCommentModel.id == comment_id))
        c = res.scalar_one_or_none()
        if not c:
            return None
        if c.resolved_at is None:
            c.resolved_at = datetime.utcnow()
            await s.commit()
        return _to_dict(c)


async def delete_comment(comment_id: str, user_id: int) -> bool:
    """只能删自己的评论。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(NodeCommentModel).where(
                NodeCommentModel.id == comment_id,
                NodeCommentModel.user_id == user_id,
            )
        )
        if not res.scalar_one_or_none():
            return False
        await s.execute(sa_delete(NodeCommentModel).where(NodeCommentModel.id == comment_id))
        await s.commit()
        return True


# ---------- node 详情（聚合 message + comments + mentions） ----------

async def get_node_detail(node_id: str) -> Optional[Dict[str, Any]]:
    """拉一个节点的完整详情：node + message + comments 数 + mentions 数。"""
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(CanvasNodeModel, V2MessageModel)
            .join(V2MessageModel, V2MessageModel.id == CanvasNodeModel.message_id)
            .where(CanvasNodeModel.id == node_id)
        )
        row = res.first()
        if not row:
            return None
        node, msg = row
        # 子节点（分支）
        children_res = await s.execute(
            select(CanvasNodeModel.id, CanvasNodeModel.branch_label)
            .where(CanvasNodeModel.parent_node_id == node_id)
        )
        children = [{'id': r[0], 'branch_label': r[1]} for r in children_res.all()]

        # 评论计数
        from sqlalchemy import func
        cc = await s.execute(
            select(func.count(NodeCommentModel.id)).where(NodeCommentModel.node_id == node_id)
        )
        mc = await s.execute(
            select(func.count(NodeMentionModel.node_id)).where(NodeMentionModel.node_id == node_id)
        )
        return {
            'node_id': node.id,
            'session_id': node.session_id,
            'parent_node_id': node.parent_node_id,
            'branch_label': node.branch_label,
            'branch_color': node.branch_color,
            'pinned_to_board_id': node.pinned_to_board_id,
            'clarify_status': node.clarify_status,
            'hitl_status': node.hitl_status,
            'position_index': node.position_index,
            'created_at': node.created_at,
            # message
            'message_id': msg.id,
            'parent_msg_id': msg.parent_msg_id,
            'role': msg.role,
            'content': msg.content,
            'sql': msg.sql,
            'chart_cfg_json': msg.chart_cfg_json,
            'data_json': msg.data_json,
            'thinking_steps_json': msg.thinking_steps_json,
            'elapsed_ms': msg.elapsed_ms,
            'confidence': msg.confidence,
            'model_provider': msg.model_provider,
            'model_name': msg.model_name,
            'tokens_prompt': msg.tokens_prompt,
            'tokens_completion': msg.tokens_completion,
            # aggregates
            'children': children,
            'comments_count': int(cc.scalar() or 0),
            'mentions_count': int(mc.scalar() or 0),
        }


async def list_message_versions(message_id: str) -> List[Dict[str, Any]]:
    """通过 parent_msg_id 链表展开"同一问题的多个回答候选"。

    简化：返回所有 parent_msg_id 等于这条 message 的 parent_msg_id 的 messages
    （即兄弟节点）。这是 LLM 候选树语义。
    """
    async with v2_db.async_session() as s:
        res = await s.execute(select(V2MessageModel).where(V2MessageModel.id == message_id))
        m = res.scalar_one_or_none()
        if not m or m.parent_msg_id is None:
            return []
        res2 = await s.execute(
            select(V2MessageModel)
            .where(V2MessageModel.parent_msg_id == m.parent_msg_id)
            .order_by(V2MessageModel.created_at)
        )
        return [{
            'id': v.id, 'role': v.role, 'content': v.content,
            'sql': v.sql, 'chart_cfg_json': v.chart_cfg_json,
            'created_at': v.created_at, 'model_name': v.model_name,
        } for v in res2.scalars().all()]


# ---------- node status (clarify / hitl) ----------

async def set_clarify_status(node_id: str, status: str) -> Optional[Dict[str, Any]]:
    if status not in ('none', 'pending', 'cleared', 'skipped'):
        return None
    async with v2_db.async_session() as s:
        res = await s.execute(select(CanvasNodeModel).where(CanvasNodeModel.id == node_id))
        n = res.scalar_one_or_none()
        if not n:
            return None
        n.clarify_status = status
        await s.commit()
        return _to_dict(n)


async def set_hitl_status(node_id: str, status: str) -> Optional[Dict[str, Any]]:
    if status not in ('none', 'waiting', 'approved', 'rejected'):
        return None
    async with v2_db.async_session() as s:
        res = await s.execute(select(CanvasNodeModel).where(CanvasNodeModel.id == node_id))
        n = res.scalar_one_or_none()
        if not n:
            return None
        n.hitl_status = status
        await s.commit()
        return _to_dict(n)


# ---------- delete node (级联影响告知) ----------

async def get_delete_impact(node_id: str) -> Dict[str, Any]:
    """删节点前查级联影响：子节点 / 评论 / 钉看板的引用。"""
    async with v2_db.async_session() as s:
        from sqlalchemy import func
        # 子分支节点
        ch = await s.execute(
            select(func.count(CanvasNodeModel.id)).where(CanvasNodeModel.parent_node_id == node_id)
        )
        # 评论
        cc = await s.execute(
            select(func.count(NodeCommentModel.id)).where(NodeCommentModel.node_id == node_id)
        )
        # 看板 widget 引用
        from .models import BoardWidgetModel
        bw = await s.execute(
            select(func.count(BoardWidgetModel.id)).where(BoardWidgetModel.source_node_id == node_id)
        )
        return {
            'node_id': node_id,
            'children_count': int(ch.scalar() or 0),
            'comments_count': int(cc.scalar() or 0),
            'pinned_widgets_count': int(bw.scalar() or 0),
        }


async def delete_node(node_id: str, cascade: bool = False) -> bool:
    """删节点。cascade=True 时同时删子分支 + 评论 + widgets。"""
    async with v2_db.async_session() as s:
        res = await s.execute(select(CanvasNodeModel).where(CanvasNodeModel.id == node_id))
        n = res.scalar_one_or_none()
        if not n:
            return False
        if cascade:
            from .models import BoardWidgetModel
            # 找全部后代节点（递归一层；深度递归留作后续）
            ch = await s.execute(
                select(CanvasNodeModel.id).where(CanvasNodeModel.parent_node_id == node_id)
            )
            child_ids = list(ch.scalars().all())
            for cid in child_ids:
                await s.execute(sa_delete(NodeCommentModel).where(NodeCommentModel.node_id == cid))
                await s.execute(sa_delete(NodeMentionModel).where(NodeMentionModel.node_id == cid))
                await s.execute(sa_delete(BoardWidgetModel).where(BoardWidgetModel.source_node_id == cid))
                await s.execute(sa_delete(CanvasNodeModel).where(CanvasNodeModel.id == cid))
            await s.execute(sa_delete(NodeCommentModel).where(NodeCommentModel.node_id == node_id))
            await s.execute(sa_delete(NodeMentionModel).where(NodeMentionModel.node_id == node_id))
            await s.execute(sa_delete(BoardWidgetModel).where(BoardWidgetModel.source_node_id == node_id))
        await s.execute(sa_delete(CanvasNodeModel).where(CanvasNodeModel.id == node_id))
        await s.commit()
        return True
