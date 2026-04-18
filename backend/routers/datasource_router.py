"""
用户数据源管理路由
GET/POST/PUT/DELETE /api/datasources
POST /api/datasources/test  (不保存，仅测试连通性)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from routers.auth_router import get_current_user
from database.datasource_db import datasource_db, DatasourceDB

router = APIRouter(prefix="/api/datasources", tags=["datasources"])


# ── Pydantic 模型 ─────────────────────────────────────────────────────────────

class DatasourceCreate(BaseModel):
    name:        str
    type:        str          # mysql / postgresql
    host:        str
    port:        int
    db_name:     str
    username:    str
    password:    str
    description: Optional[str] = None


class DatasourceUpdate(BaseModel):
    name:        Optional[str] = None
    type:        Optional[str] = None
    host:        Optional[str] = None
    port:        Optional[int] = None
    db_name:     Optional[str] = None
    username:    Optional[str] = None
    password:    Optional[str] = None   # "***" 表示不修改
    description: Optional[str] = None


class DatasourceTestRequest(BaseModel):
    type:     str
    host:     str
    port:     int
    db_name:  str
    username: str
    password: str


# ── 辅助：临时建立连接测试 ───────────────────────────────────────────────────

async def _test_connection(cfg: dict) -> tuple[bool, str]:
    """用传入 cfg 临时建连，返回 (success, message)"""
    from databases.database_manager import DatabaseManager
    from databases.base_adapter import DatabaseType

    db_type = cfg.get("type", "").lower()
    tmp_key = f"__test_{cfg['host']}_{cfg['db_name']}__"
    DatabaseManager.register_database(tmp_key, {
        "type":     db_type,
        "host":     cfg["host"],
        "port":     cfg["port"],
        "database": cfg["db_name"],
        "user":     cfg["username"],
        "password": cfg["password"],
        "name":     "test",
    })
    try:
        adapter = DatabaseManager.get_adapter(tmp_key)
        if not adapter:
            return False, f"不支持的数据库类型: {db_type}"
        ok = await adapter.connect()
        return (True, "连接成功") if ok else (False, "连接失败，请检查参数")
    except Exception as e:
        return False, str(e)
    finally:
        # 清理临时 adapter，避免污染全局状态
        await DatabaseManager.disconnect(tmp_key)
        DatabaseManager._configs.pop(tmp_key, None)


# ── 路由 ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_datasources(current_user: dict = Depends(get_current_user)):
    """列出当前用户的全部数据源（密码脱敏）"""
    user_id = current_user["id"]
    items = await datasource_db.list_by_user(user_id)
    return {"datasources": items}


@router.post("/test")
async def test_connection(
    req: DatasourceTestRequest,
    current_user: dict = Depends(get_current_user)
):
    """测试连通性（不保存到数据库）"""
    ok, msg = await _test_connection(req.model_dump())
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


@router.post("")
async def create_datasource(
    req: DatasourceCreate,
    current_user: dict = Depends(get_current_user)
):
    """创建数据源（先测试连接，成功后保存）"""
    user_id = current_user["id"]

    # 保存前自动验证连通性
    ok, msg = await _test_connection(req.model_dump())
    if not ok:
        raise HTTPException(status_code=400, detail=f"连接测试失败: {msg}")

    ds = await datasource_db.create(user_id, req.model_dump())
    return {"datasource": ds}


@router.put("/{ds_id}")
async def update_datasource(
    ds_id: str,
    req: DatasourceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """更新数据源（若修改了连接参数，重新测试连通性）"""
    user_id = current_user["id"]

    # 取出当前记录
    existing = await datasource_db.get(ds_id, user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="数据源不存在")

    update_data = {k: v for k, v in req.model_dump().items() if v is not None}

    # 连接参数有变化时重新测试
    conn_fields = {"type", "host", "port", "db_name", "username", "password"}
    if conn_fields & set(update_data.keys()):
        # 合并最新参数用于测试
        test_cfg = {
            "type":     update_data.get("type",     existing["type"]),
            "host":     update_data.get("host",     existing["host"]),
            "port":     update_data.get("port",     existing["port"]),
            "db_name":  update_data.get("db_name",  existing["db_name"]),
            "username": update_data.get("username", existing["username"]),
            "password": (
                update_data["password"]
                if update_data.get("password") and update_data["password"] != "***"
                else existing["password"]      # 已解密的明文
            ),
        }
        ok, msg = await _test_connection(test_cfg)
        if not ok:
            raise HTTPException(status_code=400, detail=f"连接测试失败: {msg}")

        # 清除旧 adapter 缓存，保证下次使用新配置
        db_key = f"user_ds_{ds_id}"
        from databases.database_manager import DatabaseManager
        await DatabaseManager.disconnect(db_key)

    updated = await datasource_db.update(ds_id, user_id, update_data)
    return {"datasource": updated}


@router.delete("/{ds_id}")
async def delete_datasource(
    ds_id: str,
    current_user: dict = Depends(get_current_user)
):
    """删除数据源"""
    user_id = current_user["id"]
    ok = await datasource_db.delete(ds_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="数据源不存在")
    return {"success": True}
