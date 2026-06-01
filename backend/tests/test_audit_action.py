"""DAT-38: audit middleware action 规范化 — 不再出现 create_create / update_modify。

只测纯函数 _normalize_action + _parse_target,不依赖 DB / 请求。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from middleware.v2_audit import _normalize_action, _parse_target


def _action_for(method: str, path: str) -> str:
    action, _ttype, _tid = _parse_target(path)
    return _normalize_action(method, action)


def test_no_double_prefix_on_create():
    # 回归: POST 到 create 规则曾产出 create_create
    assert _action_for('POST', '/api/v2/workspaces') == 'create'
    assert _action_for('POST', '/api/v2/sessions') == 'create'
    assert _action_for('POST', '/api/v2/boards') == 'create'
    assert _action_for('POST', '/api/v2/alert-rules') == 'create'


def test_no_double_prefix_on_modify():
    # 回归: PATCH 到 modify 规则曾产出 update_modify
    assert _action_for('PATCH', '/api/v2/sessions/abc') == 'update'
    assert _action_for('PUT', '/api/v2/boards/xyz') == 'update'


def test_delete_normalizes_generic_verbs():
    # DELETE 一个 modify 规则路径 → 干净的 delete,而不是 delete_modify
    assert _action_for('DELETE', '/api/v2/sessions/abc') == 'delete'


def test_delete_keeps_prefix_on_specific_nouns():
    # DELETE 具体动词/名词性 action 仍保留 delete_ 前缀(行为不变)
    assert _action_for('DELETE', '/api/v2/admin/api-keys/k1') == 'delete_api_key'
    assert _action_for('DELETE', '/api/v2/me/security/oauth-apps/o1') == 'delete_security'


def test_specific_verbs_unchanged():
    # 已带具体语义的动词不被套前缀
    assert _action_for('POST', '/api/v2/workspaces/w1/members') == 'invite_member'
    assert _action_for('POST', '/api/v2/share-links') == 'share'
    assert _action_for('POST', '/api/v2/alert-rules/r1/subscribe') == 'subscribe'


def test_action_never_has_repeated_prefix():
    # 兜底: 任何组合都不该出现 create_create / update_update / update_modify
    paths = [
        '/api/v2/workspaces', '/api/v2/sessions', '/api/v2/sessions/a',
        '/api/v2/boards', '/api/v2/boards/b', '/api/v2/alert-rules',
        '/api/v2/share-links', '/api/v2/admin/api-keys/k',
    ]
    for method in ('POST', 'PATCH', 'PUT', 'DELETE'):
        for p in paths:
            a = _action_for(method, p)
            assert 'create_create' not in a
            assert 'update_update' not in a
            assert 'update_modify' not in a
