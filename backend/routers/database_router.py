"""
数据库管理路由 (Phase 2)
支持多种数据库类型，保持与旧 API 向后兼容
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATABASES
from databases.database_manager import DatabaseManager
from databases.base_adapter import TableInfo

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


@router.on_event("startup")
async def startup_event():
    """启动时初始化 DatabaseManager"""
    for db_key, config in DATABASES.items():
        DatabaseManager.register_database(db_key, config)


@router.get("/databases")
async def get_databases():
    """获取所有可用数据库 - 保持旧 API 格式兼容"""
    from config import DATABASES
    from services.schema_service import SchemaService
    
    current_db_path = SchemaService.get_current_db_path()
    
    databases = []
    for key, config in DATABASES.items():
        databases.append({
            "key": key,
            "name": config["name"],
            "path": str(config.get("path", "")),
            "is_current": str(config.get("path", "")) == str(current_db_path)
        })
    
    return {"databases": databases}


@router.post("/database/switch")
async def switch_database(request: SwitchDatabaseRequest):
    """切换数据库 - 保持旧 API 格式兼容"""
    from config import DATABASES
    from services.schema_service import SchemaService
    
    db_key = request.database_key
    if db_key not in DATABASES:
        raise HTTPException(status_code=400, detail=f"数据库 {db_key} 不存在")
    
    SchemaService.set_database(db_key)
    
    return {
        "message": f"已切换到 {DATABASES[db_key]['name']}",
        "database": {
            "key": db_key,
            "name": DATABASES[db_key]["name"]
        }
    }


@router.get("/databases/list", response_model=List[Dict[str, Any]])
async def get_databases_list():
    """获取所有可用数据库（新 API 格式）"""
    configs = DatabaseManager.get_configs()
    result = []
    for key, config in configs.items():
        result.append({
            "key": key,
            "name": config.get("name", key),
            "type": config.get("type", "sqlite")
        })
    return result


@router.get("/databases/{db_key}/tables", response_model=List[TableInfo])
async def get_database_tables(db_key: str):
    """获取指定数据库的所有表"""
    adapter = DatabaseManager.get_adapter(db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"数据库 {db_key} 不存在")

    if not await adapter.is_connected():
        connected = await adapter.connect()
        if not connected:
            raise HTTPException(status_code=500, detail=f"无法连接到数据库 {db_key}")

    try:
        tables = await adapter.get_tables()
        return tables
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")


@router.get("/databases/{db_key}/tables/{table_name}/schema")
async def get_table_schema(db_key: str, table_name: str):
    """获取指定表的结构"""
    adapter = DatabaseManager.get_adapter(db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"数据库 {db_key} 不存在")

    if not await adapter.is_connected():
        connected = await adapter.connect()
        if not connected:
            raise HTTPException(status_code=500, detail=f"无法连接到数据库 {db_key}")

    try:
        schema = await adapter.get_table_schema(table_name)
        return schema
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取表结构失败: {str(e)}")


@router.post("/databases/test")
async def test_connection(request: TestConnectionRequest):
    """测试数据库连接"""
    adapter = DatabaseManager.get_adapter(request.db_key)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"数据库 {request.db_key} 不存在")

    try:
        connected = await adapter.connect()
        if connected:
            return {"success": True, "message": "连接成功"}
        else:
            raise HTTPException(status_code=500, detail="连接失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"连接测试失败: {str(e)}")
