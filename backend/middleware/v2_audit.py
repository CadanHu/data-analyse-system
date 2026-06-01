"""v2 自动审计 middleware。

把所有 POST/PATCH/DELETE 到 /api/v2/* 的请求（除少数白名单）自动写一条 audit_logs。
- actor_user_id 从 Authorization 头解析（懒，不阻塞请求；解析失败就跳过）
- action 由 HTTP method 推导
- target_type / target_id 从路径推断
- diff 不做（要做需要包装 response，性能/正确性都难权衡）

这是 fire-and-forget：审计写失败不影响业务请求。
"""
import re
import asyncio
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


# 不写审计的路径（noise 太大）
_SKIP_PATTERNS = [
    re.compile(r'^/api/v2/notifications/[^/]+/read$'),    # 标记已读，频率高
    re.compile(r'^/api/v2/notifications/_count$'),
    re.compile(r'^/api/v2/me/notification-prefs$'),       # 调一次写一堆，noise
    re.compile(r'^/api/v2/admin/audit'),                  # 别写审计的审计
    re.compile(r'^/api/v2/sessions/[^/]+/ask$'),          # SSE 单独打点更合适
]


def _should_skip(path: str) -> bool:
    return any(p.match(path) for p in _SKIP_PATTERNS)


# path → (action, target_type, target_id_extractor)
_PATH_RULES = [
    # workspaces
    (re.compile(r'^/api/v2/workspaces$'), 'create', 'workspace', None),
    (re.compile(r'^/api/v2/workspaces/([^/]+)/members$'), 'invite_member', 'workspace', 1),
    # v2 sessions
    (re.compile(r'^/api/v2/sessions$'), 'create', 'v2_session', None),
    (re.compile(r'^/api/v2/sessions/([^/]+)$'), 'modify', 'v2_session', 1),
    # boards
    (re.compile(r'^/api/v2/boards$'), 'create', 'board', None),
    (re.compile(r'^/api/v2/boards/([^/]+)$'), 'modify', 'board', 1),
    (re.compile(r'^/api/v2/boards/([^/]+)/widgets'), 'pin_widget', 'board', 1),
    # share
    (re.compile(r'^/api/v2/share-links'), 'share', 'share_link', None),
    (re.compile(r'^/api/v2/share-grants'), 'grant', 'share_grant', None),
    # alerts
    (re.compile(r'^/api/v2/alert-rules$'), 'create', 'alert_rule', None),
    (re.compile(r'^/api/v2/alert-rules/([^/]+)/_trigger$'), 'trigger', 'alert_rule', 1),
    (re.compile(r'^/api/v2/alert-rules/([^/]+)/subscribe$'), 'subscribe', 'alert_rule', 1),
    (re.compile(r'^/api/v2/alert-events/([^/]+)/(ack|resolve)$'), 'lifecycle', 'alert_event', 1),
    # admin
    (re.compile(r'^/api/v2/admin/billing/subscription$'), 'upgrade_plan', 'subscription', None),
    (re.compile(r'^/api/v2/admin/billing/invoices/?([^/]*)?$'), 'invoice', 'invoice', 1),
    (re.compile(r'^/api/v2/admin/model-routes/?([^/]*)?$'), 'route', 'model_route', 1),
    (re.compile(r'^/api/v2/admin/api-keys/?([^/]*)?(/[a-z]+)?$'), 'api_key', 'api_key', 1),
    # security
    (re.compile(r'^/api/v2/me/security/2fa'), 'security', '2fa', None),
    (re.compile(r'^/api/v2/me/security/sessions/([^/]+)$'), 'security', 'login_session', 1),
    (re.compile(r'^/api/v2/me/security/oauth-apps/([^/]+)$'), 'security', 'oauth_app', 1),
    # node detail (要做在阶段 8 时填进来)
    (re.compile(r'^/api/v2/nodes/([^/]+)/comments'), 'comment', 'canvas_node', 1),
    (re.compile(r'^/api/v2/nodes/([^/]+)$'), 'modify', 'canvas_node', 1),
]


def _parse_target(path: str):
    """从路径推 (action, target_type, target_id)。"""
    for pat, action, ttype, idx in _PATH_RULES:
        m = pat.match(path)
        if not m:
            continue
        target_id = m.group(idx) if idx is not None and idx <= m.lastindex else None
        return action, ttype, target_id
    return 'unknown', None, None


async def _resolve_actor(request: Request):
    """尝试解析当前 user_id；失败返回 None 不阻塞请求。"""
    auth = request.headers.get('authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth[7:]
    try:
        # M2M token (dp_)
        if token.startswith('dp_'):
            import hashlib
            from database.user_db import user_db
            h = hashlib.sha256(token.encode()).hexdigest()
            rec = await user_db.get_api_token_by_hash(h)
            return rec.get('user_id') if rec else None
        # JWT
        from utils.security import decode_access_token   # 旧 auth_router 里用过的 helper
        from database.user_db import user_db
        payload = decode_access_token(token)
        email = payload.get('sub')
        if not email:
            return None
        u = await user_db.get_user_by_email(email)
        return u.get('id') if u else None
    except Exception:
        return None


class V2AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 先放过请求
        response = await call_next(request)

        path = request.url.path
        method = request.method
        # 只审计 v2 的写操作 + 2xx 响应
        if (
            method in ('POST', 'PATCH', 'PUT', 'DELETE')
            and path.startswith('/api/v2/')
            and 200 <= response.status_code < 300
            and not _should_skip(path)
        ):
            asyncio.create_task(_async_write_audit(request, method, path))
        return response


async def _async_write_audit(request: Request, method: str, path: str):
    try:
        actor = await _resolve_actor(request)
        if actor is None:
            return  # 没拿到 actor 不写
        action, ttype, tid = _parse_target(path)
        if method == 'DELETE':
            action = f'delete_{action}'
        elif method == 'PATCH' or method == 'PUT':
            action = f'update_{action}' if action == 'modify' else action
        else:
            action = f'create_{action}' if action == 'create' else action
        # 取 workspace_id（如果路径里没有，跳过，作为平台级动作）
        from database.v2 import audit_services as audit
        await audit.write(
            actor_user_id=actor, action=action,
            target_type=ttype, target_id=tid,
            ip=(request.client.host if request.client else None),
            ua=request.headers.get('user-agent'),
            request_id=request.headers.get('x-request-id'),
        )
    except Exception as e:
        print(f'[v2-audit-mw] 写审计失败 (吞掉): {e}')
