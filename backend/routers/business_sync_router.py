"""
business_sync_router.py — 业务数据库快照同步端点

GET  /api/biz-sync/databases              列出可同步的业务库
GET  /api/biz-sync/schema/{db_key}        返回所有表结构
GET  /api/biz-sync/data/{db_key}/{table}  分页数据导出（offset + limit）
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from config import DATABASES
from databases.database_manager import DatabaseManager
from routers.auth_router import get_current_user

router = APIRouter(prefix="/biz-sync", tags=["业务数据同步"])

PAGE_SIZE = 500


def _serialize_val(v):
    """将 MySQL 行值转为 JSON 安全的 Python 类型"""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return v


async def _ensure_adapter(db_key: str):
    if db_key not in DATABASES:
        raise HTTPException(404, f"Database '{db_key}' not found")
    adapter = DatabaseManager.get_adapter(db_key)
    if not adapter:
        DatabaseManager.register_database(db_key, DATABASES[db_key])
        adapter = DatabaseManager.get_adapter(db_key)
    if not await adapter.is_connected():
        ok = await adapter.connect()
        if not ok:
            raise HTTPException(500, f"Cannot connect to database '{db_key}'")
    return adapter


@router.get("/databases")
async def list_databases(current_user: dict = Depends(get_current_user)):
    """列出所有可同步的业务数据库（MySQL / PostgreSQL）"""
    result = []
    for key, cfg in DATABASES.items():
        if cfg.get("type") in ("mysql", "postgresql"):
            result.append({"key": key, "name": cfg.get("name", key), "type": cfg.get("type")})
    return {"databases": result}


@router.get("/schema/{db_key}")
async def get_schema(db_key: str, current_user: dict = Depends(get_current_user)):
    """返回业务库的所有表 + 列信息，供手机端在 SQLite 中建表"""
    adapter = await _ensure_adapter(db_key)
    tables = await adapter.get_tables()
    result = []
    for t in tables:
        result.append({
            "name": t.name,
            "columns": [
                {
                    "name": c.name,
                    "type": str(c.type),
                    "nullable": c.nullable,
                    "primary_key": c.primary_key,
                }
                for c in t.columns
            ],
        })
    return {"db_key": db_key, "tables": result}


@router.get("/meta/{db_key}")
async def get_meta(db_key: str, current_user: dict = Depends(get_current_user)):
    """返回每张表的行数 + UPDATE_TIME，供手机端判断哪些表需要增量同步"""
    adapter = await _ensure_adapter(db_key)
    cfg = DATABASES.get(db_key, {})
    db_type = cfg.get("type", "mysql")

    if db_type == "mysql":
        db_name = cfg.get("database", db_key)
        rows = await adapter.execute_query(
            "SELECT TABLE_NAME, TABLE_ROWS, UPDATE_TIME "
            "FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = :db_name",
            {"db_name": db_name},
        )
        result = [
            {
                "table": r["TABLE_NAME"],
                "row_count": int(r["TABLE_ROWS"] or 0),
                "update_time": r["UPDATE_TIME"].isoformat() if r["UPDATE_TIME"] else None,
            }
            for r in rows
        ]
    else:
        # PostgreSQL / 其他：fallback 到逐表 COUNT
        q = '"' if db_type == "postgresql" else "`"
        tables = await adapter.get_tables()
        result = []
        for t in tables:
            count_res = await adapter.execute_query(
                f"SELECT COUNT(*) AS cnt FROM {q}{t.name}{q}"
            )
            row_count = int(count_res[0]["cnt"]) if count_res else 0
            result.append({"table": t.name, "row_count": row_count, "update_time": None})

    return {"db_key": db_key, "tables": result}


@router.get("/data/{db_key}/{table_name}")
async def get_table_data(
    db_key: str,
    table_name: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(PAGE_SIZE, ge=1, le=2000),
    current_user: dict = Depends(get_current_user),
):
    """分页导出指定表的数据，供手机端写入本地 SQLite"""
    adapter = await _ensure_adapter(db_key)

    db_type = DATABASES.get(db_key, {}).get("type", "mysql")
    q = '"' if db_type == "postgresql" else "`"

    count_res = await adapter.execute_query(f"SELECT COUNT(*) AS cnt FROM {q}{table_name}{q}")
    total = int(count_res[0]["cnt"]) if count_res else 0

    rows = await adapter.execute_query(
        f"SELECT * FROM {q}{table_name}{q} LIMIT {limit} OFFSET {offset}"
    )

    serialized = [
        {k: _serialize_val(v) for k, v in row.items()}
        for row in rows
    ]

    return {
        "db_key": db_key,
        "table": table_name,
        "offset": offset,
        "limit": limit,
        "total": total,
        "rows": serialized,
        "has_more": (offset + limit) < total,
    }
