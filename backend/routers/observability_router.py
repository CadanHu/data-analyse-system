from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from services.observability_service import observability_service

router = APIRouter(prefix="/api/observability", tags=["可观测性"])

@router.get("/logs/stream")
async def stream_logs():
    """实时推送系统日志"""
    return StreamingResponse(
        observability_service.stream_logs(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
