"""
知识图谱管理路由 — 提供实体/关系的 CRUD、搜索、统计、路径查询、导出接口
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from routers.auth_router import get_current_user
from database.knowledge_db import knowledge_db

router = APIRouter()


# ─────────────────────────────────────────
# Pydantic Request Models
# ─────────────────────────────────────────

class CreateEntityRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    entity_class: str = Field(default="Other")
    doc_id: Optional[str] = None
    description: Optional[str] = ""


class UpdateEntityRequest(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=500)
    entity_class: Optional[str] = None
    description: Optional[str] = None


class CreateRelationRequest(BaseModel):
    source_text: str = Field(..., min_length=1, max_length=500)
    target_text: str = Field(..., min_length=1, max_length=500)
    relation_type: str = Field(..., min_length=1, max_length=200)
    doc_id: Optional[str] = None


class UpdateRelationRequest(BaseModel):
    source_text: Optional[str] = Field(None, min_length=1, max_length=500)
    target_text: Optional[str] = Field(None, min_length=1, max_length=500)
    relation_type: Optional[str] = Field(None, min_length=1, max_length=200)


# ─────────────────────────────────────────
# 图谱查询接口
# ─────────────────────────────────────────

@router.get("/knowledge-graph/graph")
async def get_full_graph(
    doc_id: Optional[str] = Query(None, description="按文档过滤，不传则返回全部"),
    limit: int = Query(1000, le=5000, description="最大返回条数"),
    current_user: dict = Depends(get_current_user),
):
    """获取完整知识图谱数据（实体 + 关系）"""
    return await knowledge_db.get_full_graph(
        user_id=current_user["id"], doc_id=doc_id, limit=limit
    )


@router.get("/knowledge-graph/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """获取知识图谱统计信息（实体数、关系数、类型分布等）"""
    return await knowledge_db.get_stats(current_user["id"])


@router.get("/knowledge-graph/search")
async def search_graph(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(20, le=100),
    entity_class: Optional[str] = Query(None, description="按实体类型过滤，如 Person / Org / Location"),
    doc_id: Optional[str] = Query(None, description="按文档过滤"),
    current_user: dict = Depends(get_current_user),
):
    """在实体名、关系类型中全文搜索，支持按实体类型和文档过滤"""
    return await knowledge_db.search_graph(
        q, current_user["id"], limit=limit,
        entity_class=entity_class, doc_id=doc_id,
    )


@router.get("/knowledge-graph/docs")
async def list_docs(current_user: dict = Depends(get_current_user)):
    """列出所有包含知识图谱的文档及其实体/关系计数"""
    docs = await knowledge_db.list_docs(current_user["id"])
    return {"docs": docs, "total": len(docs)}


@router.get("/knowledge-graph/path")
async def find_path(
    source: str = Query(..., description="起始实体名"),
    target: str = Query(..., description="目标实体名"),
    max_hops: int = Query(5, ge=1, le=10, description="最大跳数"),
    current_user: dict = Depends(get_current_user),
):
    """BFS 最短路径查询（返回节点+关系序列）"""
    path = await knowledge_db.find_path(
        source, target, current_user["id"], max_hops=max_hops
    )
    return {
        "path": path,
        "found": path is not None,
        "hops": len(path) if path else 0,
    }


@router.get("/knowledge-graph/communities")
async def get_communities(
    doc_id: Optional[str] = Query(None, description="按文档过滤，不传则返回全部"),
    current_user: dict = Depends(get_current_user),
):
    """获取社区列表（Louvain 检测结果 + LLM 摘要），按社区大小降序"""
    communities = await knowledge_db.get_communities(
        user_id=current_user["id"], doc_id=doc_id
    )
    return {"communities": communities, "total": len(communities)}


@router.post("/knowledge-graph/communities")
async def save_communities_from_mobile(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """接收移动端本地检测的社区数据，保存到 PostgreSQL（供 KnowledgeGraphModal 展示）"""
    doc_id = body.get("doc_id")
    communities = body.get("communities", [])
    if not doc_id or not isinstance(communities, list) or len(communities) == 0:
        return {"saved": 0}
    await knowledge_db.delete_communities(doc_id=doc_id, user_id=current_user["id"])
    await knowledge_db.save_communities(doc_id=doc_id, user_id=current_user["id"], communities=communities)
    return {"saved": len(communities)}


@router.get("/knowledge-graph/neighbors")
async def get_neighbors(
    entity: str = Query(..., min_length=1, description="实体名称"),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    """获取指定实体的所有直接邻居实体及 1 跳关系"""
    return await knowledge_db.get_neighbors(entity, current_user["id"], limit=limit)


@router.get("/knowledge-graph/export")
async def export_graph(
    doc_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """导出图谱数据为 JSON（可用于导入或备份）"""
    data = await knowledge_db.get_full_graph(current_user["id"], doc_id=doc_id)
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": 'attachment; filename="knowledge_graph.json"'},
    )


# ─────────────────────────────────────────
# 实体 CRUD
# ─────────────────────────────────────────

@router.post("/knowledge-graph/entities", status_code=201)
async def create_entity(
    request: CreateEntityRequest,
    current_user: dict = Depends(get_current_user),
):
    """手动创建实体"""
    entity = await knowledge_db.create_entity(
        user_id=current_user["id"],
        text=request.text,
        entity_class=request.entity_class,
        doc_id=request.doc_id,
        description=request.description or "",
    )
    return entity


@router.put("/knowledge-graph/entities/{entity_id}")
async def update_entity(
    entity_id: str,
    request: UpdateEntityRequest,
    current_user: dict = Depends(get_current_user),
):
    """更新实体名称、类型或描述"""
    success = await knowledge_db.update_entity(
        entity_id=entity_id,
        user_id=current_user["id"],
        text=request.text,
        entity_class=request.entity_class,
        description=request.description,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"success": True}


@router.delete("/knowledge-graph/entities/{entity_id}")
async def delete_entity(
    entity_id: str,
    current_user: dict = Depends(get_current_user),
):
    """删除实体"""
    success = await knowledge_db.delete_entity_by_id(entity_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"success": True}


# ─────────────────────────────────────────
# 关系 CRUD
# ─────────────────────────────────────────

@router.post("/knowledge-graph/relations", status_code=201)
async def create_relation(
    request: CreateRelationRequest,
    current_user: dict = Depends(get_current_user),
):
    """手动创建关系"""
    relation = await knowledge_db.create_relationship(
        user_id=current_user["id"],
        source_text=request.source_text,
        target_text=request.target_text,
        relation_type=request.relation_type,
        doc_id=request.doc_id,
    )
    return relation


@router.put("/knowledge-graph/relations/{rel_id}")
async def update_relation(
    rel_id: str,
    request: UpdateRelationRequest,
    current_user: dict = Depends(get_current_user),
):
    """更新关系的起点、终点或类型"""
    success = await knowledge_db.update_relationship(
        rel_id=rel_id,
        user_id=current_user["id"],
        source_text=request.source_text,
        target_text=request.target_text,
        relation_type=request.relation_type,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Relation not found")
    return {"success": True}


@router.delete("/knowledge-graph/relations/{rel_id}")
async def delete_relation(
    rel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """删除关系"""
    success = await knowledge_db.delete_relationship_by_id(rel_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Relation not found")
    return {"success": True}
