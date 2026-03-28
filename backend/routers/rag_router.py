"""
RAG 知识库管理路由 — 查看片段、去重、删除
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from routers.auth_router import get_current_user
from services.vector_store import vector_store

router = APIRouter()


class DeduplicateRequest(BaseModel):
    session_id: Optional[str] = None
    similarity_threshold: float = Field(default=0.85, ge=0.5, le=1.0)


class DeleteChunkRequest(BaseModel):
    chunk_id: str


class DeleteDocRequest(BaseModel):
    filename: str
    session_id: Optional[str] = None


@router.get("/rag/chunks")
async def list_rag_chunks(
    session_id: Optional[str] = Query(None, description="会话ID，不传则返回当前用户全部"),
    limit: Optional[int] = Query(None, description="每页数量，不传则返回全部"),
    offset: int = Query(0, description="偏移量"),
    current_user: dict = Depends(get_current_user)
):
    """返回当前用户的RAG片段，可按 session_id 进一步过滤，支持分页。
    注：user_id 只写入不过滤，保证历史数据可见。"""
    result = await vector_store.list_chunks(
        session_id=session_id or None,
        limit=limit,
        offset=offset,
    )
    return result


@router.get("/rag/docs")
async def list_rag_docs(
    session_id: Optional[str] = Query(None, description="会话ID，不传则返回当前用户全部"),
    current_user: dict = Depends(get_current_user)
):
    """返回当前用户的 RAG 文档名列表（去重），只拉 metadata 不拉内容，比 /rag/chunks 轻量得多"""
    docs = await vector_store.list_doc_names(session_id=session_id or None)
    return {"docs": docs, "total": len(docs)}


@router.post("/rag/deduplicate")
async def deduplicate_rag(
    request: DeduplicateRequest,
    current_user: dict = Depends(get_current_user)
):
    """对当前用户的RAG内容去重，不传 session_id 则对用户全库去重"""
    result = await vector_store.deduplicate(
        session_id=request.session_id,
        similarity_threshold=request.similarity_threshold
    )
    return result


@router.post("/rag/chunk/delete")
async def delete_rag_chunk(
    request: DeleteChunkRequest,
    current_user: dict = Depends(get_current_user)
):
    """删除单个RAG片段"""
    success = await vector_store.delete_chunk(request.chunk_id)
    return {"success": success}


@router.post("/rag/doc/delete")
async def delete_rag_doc(
    request: DeleteDocRequest,
    current_user: dict = Depends(get_current_user)
):
    """删除某文档的全部RAG片段及知识图谱数据"""
    deleted = await vector_store.delete_by_doc(request.filename, request.session_id)
    # 清理知识图谱（PostgreSQL），失败不阻断主流程
    try:
        from database.knowledge_db import knowledge_db
        await knowledge_db.delete_by_doc(request.filename, current_user["id"])
    except Exception as e:
        print(f"⚠️ [RAG] 知识图谱清理失败（非阻断）: {e}")
    return {"success": True, "deleted": deleted}
