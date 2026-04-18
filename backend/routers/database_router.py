"""
数据库管理路由 (SQLAlchemy 驱动)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATABASES
from databases.database_manager import DatabaseManager
from databases.base_adapter import TableInfo
from routers.auth_router import get_current_user
from services.schema_service import SchemaService
from database.datasource_db import datasource_db, DatasourceDB

router = APIRouter(prefix="/api", tags=["databases"])


class DatabaseConfig(BaseModel):
    key: str
    name: str
    type: str
    config: Dict[str, Any]


class TestConnectionRequest(BaseModel):
    db_key: str


class SwitchDatabaseRequest(BaseModel):
    database_key: str
    session_id: Optional[str] = None


@router.on_event("startup")
async def startup_event():
    """启动时初始化 DatabaseManager"""
    for db_key, config in DATABASES.items():
        DatabaseManager.register_database(db_key, config)


@router.get("/databases")
async def get_databases(current_user: dict = Depends(get_current_user)):
    """获取所有可用数据库（系统预置 + 当前用户数据源）"""
    current_key = SchemaService.get_current_db_key()
    user_id = current_user["id"]

    databases = []

    # 1. 系统预置数据库
    for key, config in DATABASES.items():
        if not DatabaseManager.get_adapter(key):
            DatabaseManager.register_database(key, config)
        databases.append({
            "key":        key,
            "name":       config["name"],
            "type":       config.get("type"),
            "is_current": (key == current_key),
            "source":     "system",
        })

    # 2. 用户自定义数据源
    user_ds_list = await datasource_db.list_by_user(user_id)
    for ds in user_ds_list:
        db_key = ds["db_key"]          # "user_ds_{id}"
        # 按需动态注册（含明文密码需重新查询）
        if not DatabaseManager.get_config(db_key):
            full_ds = await datasource_db.get_by_key(db_key)
            if full_ds:
                DatabaseManager.register_database(db_key, DatasourceDB.to_db_config(full_ds))
        databases.append({
            "key":        db_key,
            "name":       ds["name"],
            "type":       ds["type"],
            "is_current": (db_key == current_key),
            "source":     "user",
        })

    return {"databases": databases}


@router.post("/database/switch")
async def switch_database(request: SwitchDatabaseRequest, current_user: dict = Depends(get_current_user)):
    """切换数据库 / Switch database"""
    db_key = request.database_key
    session_id = request.session_id
    
    # 特殊值：用户明确选择不使用数据库
    if db_key == '__no_db__':
        if session_id:
            from database.session_db import session_db
            user_id = current_user["id"]
            await session_db.update_session_database(session_id, user_id, '__no_db__')
        return {"message": "No database selected", "database": {"key": "__no_db__", "name": "无数据库"}}

    # 处理用户自定义数据源（user_ds_ 前缀）
    if db_key.startswith("user_ds_"):
        full_ds = await datasource_db.get_by_key(db_key)
        if not full_ds:
            raise HTTPException(status_code=404, detail=f"用户数据源 {db_key} 不存在")
        # 按需注册到 DatabaseManager
        if not DatabaseManager.get_config(db_key):
            DatabaseManager.register_database(db_key, DatasourceDB.to_db_config(full_ds))
        SchemaService.set_database(db_key)
        if session_id:
            from database.session_db import session_db
            user_id = current_user["id"]
            await session_db.update_session_database(session_id, user_id, db_key)
        return {
            "message": f"已切换到 {full_ds['name']}",
            "database": {"key": db_key, "name": full_ds["name"]}
        }

    if db_key not in DATABASES:
        raise HTTPException(status_code=400, detail=f"Database {db_key} not found (数据库 {db_key} 不存在)")

    # 1. 更新全局 SchemaService (即时生效)
    SchemaService.set_database(db_key)

    # 2. 如果提供了会话 ID，持久化到数据库 (后续请求生效)
    if session_id:
        from database.session_db import session_db
        user_id = current_user["id"]
        print(f"🎯 [Database] 正在切换会话数据库 / Switching session DB: {session_id} -> {db_key}")
        success = await session_db.update_session_database(session_id, user_id, db_key)
        if not success:
            print(f"⚠️ [Database] 更新会话数据库失败 / Failed to update session DB")

    return {
        "message": f"Switched to (已切换到) {DATABASES[db_key]['name']}",
        "database": {
            "key": db_key,
            "name": DATABASES[db_key]["name"]
        }
    }


@router.get("/databases/list", response_model=List[Dict[str, Any]])
async def get_databases_list():
    """获取所有可用数据库（详细列表） / Get all available databases (Detailed list)"""
    configs = DatabaseManager.get_configs()
    result = []
    for key, config in configs.items():
        result.append({
            "key": key,
            "name": config.get("name", key),
            "type": config.get("type", "mysql")
        })
    return result


@router.get("/databases/{db_key}/tables", response_model=List[TableInfo])
async def get_database_tables(db_key: str):
    """获取指定数据库的所有表 / Get all tables in a database"""
    adapter = DatabaseManager.get_adapter(db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Database {db_key} not found (数据库 {db_key} 不存在)")

    if not await adapter.is_connected():
        connected = await adapter.connect()
        if not connected:
            raise HTTPException(status_code=500, detail=f"Unable to connect to database (无法连接到数据库) {db_key}")

    try:
        tables = await adapter.get_tables()
        return tables
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables (获取表列表失败): {str(e)}")


@router.get("/databases/{db_key}/tables/{table_name}/schema")
async def get_table_schema(db_key: str, table_name: str):
    """获取指定表的结构 / Get table schema"""
    adapter = DatabaseManager.get_adapter(db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Database {db_key} not found (数据库 {db_key} 不存在)")

    if not await adapter.is_connected():
        connected = await adapter.connect()
        if not connected:
            raise HTTPException(status_code=500, detail=f"Unable to connect to database (无法连接到数据库) {db_key}")

    try:
        schema = await adapter.get_table_schema(table_name)
        return schema
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch table schema (获取表结构失败): {str(e)}")


@router.post("/databases/test")
async def test_connection(request: TestConnectionRequest):
    """测试数据库连接 / Test database connection"""
    adapter = DatabaseManager.get_adapter(request.db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Database {request.db_key} not found (数据库 {request.db_key} 不存在)")

    try:
        connected = await adapter.connect()
        if connected:
            return {"success": True, "message": "Connection Successful (连接成功)"}
        else:
            raise HTTPException(status_code=500, detail="Connection Failed (连接失败)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection Test Failed (连接测试失败): {str(e)}")
