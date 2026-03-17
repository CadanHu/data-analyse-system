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


@router.get("/rag/chunks")
async def list_rag_chunks(
    session_id: Optional[str] = Query(None, description="会话ID，不传则返回当前用户全部"),
    current_user: dict = Depends(get_current_user)
):
    """返回当前用户的RAG片段，可按 session_id 进一步过滤。
    注：user_id 只写入不过滤，保证历史数据可见。"""
    chunks = await vector_store.list_chunks(session_id=session_id or None)
    return {"chunks": chunks, "total": len(chunks)}


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
