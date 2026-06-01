"""DAT-27 — workspace 成员增删改 API 集成测试。

直接调用 v2_router 的路由协程(传入伪 current_user dict),覆盖:
邀请(按 email)/ 列表 enrich(跨库补 email)/ 改角色 / 移除 / owner 保护 / 权限 / 非法入参。

需要可达的 MySQL(session + v2 两库);CI 的裸单测环境没有 DB,会自动 skip。
本地跑: backend/venv312/bin/pytest backend/tests/test_workspace_members.py -s
"""
import os
import sys
import uuid
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from fastapi import HTTPException

from database.session_db import session_db
from database.user_db import user_db
from database.v2.base import v2_db
from database.v2 import services as v2_svc
from routers import v2_router as R


async def _db_reachable() -> bool:
    try:
        await session_db.init_db()
        await v2_db.init_db()
        return True
    except Exception as e:  # noqa
        print('DB unreachable:', repr(e)[:160])
        return False


async def _mk_user(tag: str) -> int:
    suffix = uuid.uuid4().hex[:8]
    return await user_db.create_user({
        'username': f'dat27_{tag}_{suffix}',
        'email': f'dat27_{tag}_{suffix}@test.local',
        'password_hash': 'x',
    })


async def _del_user(uid: int):
    from sqlalchemy import delete
    from database.user_db import UserModel
    async with user_db.async_session() as s:
        await s.execute(delete(UserModel).where(UserModel.id == uid))
        await s.commit()


async def _del_workspace(ws_id: str):
    from sqlalchemy import delete
    from database.v2.models import WorkspaceModel, WorkspaceMemberModel
    async with v2_db.async_session() as s:
        await s.execute(delete(WorkspaceMemberModel).where(WorkspaceMemberModel.workspace_id == ws_id))
        await s.execute(delete(WorkspaceModel).where(WorkspaceModel.id == ws_id))
        await s.commit()


async def _run():
    owner_id = await _mk_user('owner')
    alice_id = await _mk_user('alice')
    bob_id = await _mk_user('bob')
    alice_email = (await user_db.get_users_by_ids([alice_id]))[alice_id]['email']
    bob_email = (await user_db.get_users_by_ids([bob_id]))[bob_id]['email']

    ws = await v2_svc.create_workspace('DAT27 测试工作区', owner_user_id=owner_id)
    ws_id = ws['id']
    owner_cu = {'id': owner_id}
    bob_cu = {'id': bob_id}

    try:
        # --- 邀请 alice(按 email) ---
        added = await R.add_workspace_member(ws_id, R.MemberAdd(email=alice_email, role='analyst'), owner_cu)
        assert added['user_id'] == alice_id, added
        assert added['role'] == 'analyst'
        assert added['email'] == alice_email, '应 enrich 出 email'

        # --- 列表 enrich:owner + alice 都在,且都有 email/username ---
        members = await R.list_workspace_members(ws_id, owner_cu)
        by_id = {m['user_id']: m for m in members}
        assert set(by_id) == {owner_id, alice_id}, by_id
        assert by_id[owner_id]['role'] == 'owner'
        assert all(m['email'] and m['username'] for m in members), members

        # --- 改角色:analyst -> admin ---
        upd = await R.update_workspace_member_role(ws_id, alice_id, R.MemberRoleUpdate(role='admin'), owner_cu)
        assert upd['role'] == 'admin', upd

        # --- owner 保护:不能改 owner 角色 / 不能移除 owner ---
        with pytest.raises(HTTPException) as e1:
            await R.update_workspace_member_role(ws_id, owner_id, R.MemberRoleUpdate(role='admin'), owner_cu)
        assert e1.value.status_code == 400
        with pytest.raises(HTTPException) as e2:
            await R.remove_workspace_member(ws_id, owner_id, owner_cu)
        assert e2.value.status_code == 400

        # --- 非法角色 -> 400 ---
        with pytest.raises(HTTPException) as e3:
            await R.add_workspace_member(ws_id, R.MemberAdd(email=bob_email, role='owner'), owner_cu)
        assert e3.value.status_code == 400
        with pytest.raises(HTTPException) as e4:
            await R.update_workspace_member_role(ws_id, alice_id, R.MemberRoleUpdate(role='superuser'), owner_cu)
        assert e4.value.status_code == 400

        # --- 邀请未注册 email -> 404 ---
        with pytest.raises(HTTPException) as e5:
            await R.add_workspace_member(ws_id, R.MemberAdd(email='nobody_xyz@nowhere.local', role='viewer'), owner_cu)
        assert e5.value.status_code == 404

        # --- 权限:非成员 bob 不能加成员 -> 403 ---
        with pytest.raises(HTTPException) as e6:
            await R.add_workspace_member(ws_id, R.MemberAdd(email=bob_email, role='viewer'), bob_cu)
        assert e6.value.status_code == 403

        # --- 加 bob 再移除,列表恢复到 2 人 ---
        await R.add_workspace_member(ws_id, R.MemberAdd(email=bob_email, role='viewer'), owner_cu)
        assert {m['user_id'] for m in await R.list_workspace_members(ws_id, owner_cu)} == {owner_id, alice_id, bob_id}
        await R.remove_workspace_member(ws_id, bob_id, owner_cu)
        assert {m['user_id'] for m in await R.list_workspace_members(ws_id, owner_cu)} == {owner_id, alice_id}

        # --- 移除不存在的成员 -> 404 ---
        with pytest.raises(HTTPException) as e7:
            await R.remove_workspace_member(ws_id, bob_id, owner_cu)
        assert e7.value.status_code == 404

        print('✅ DAT-27 workspace members e2e PASS')
    finally:
        await _del_workspace(ws_id)
        for uid in (owner_id, alice_id, bob_id):
            await _del_user(uid)


async def _main():
    # 必须和 _run 同一个事件循环:SQLAlchemy async engine 的连接池绑定 loop,
    # 跨 asyncio.run 复用会触发 "Event loop is closed"。
    if not await _db_reachable():
        pytest.skip('MySQL 不可达,跳过集成测试')
    await _run()


def test_workspace_members_e2e():
    asyncio.run(_main())
