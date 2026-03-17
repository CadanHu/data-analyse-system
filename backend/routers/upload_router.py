"""
文件上传与异步深度处理路由 / File Upload and Async Deep Processing Router
"""
import os
import uuid
import json
import traceback
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form, Depends

from config import UPLOAD_DIR
from utils.logger import logger
from database.session_db import session_db
from services.document_processor import DocumentProcessor
from services.vector_store import VectorStore
from services.knowledge_extraction_service import knowledge_extraction_service
from routers.auth_router import get_current_user

router = APIRouter()
vector_store = VectorStore()

# 确保上传目录存在
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "document": {".pdf", ".txt", ".csv", ".xlsx", ".xls", ".md"}
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 提高到 50MB 以支持大文件深度提取

def get_file_type(filename: str) -> Optional[str]:
    ext = Path(filename).suffix.lower()
    if ext in ALLOWED_EXTENSIONS["image"]: return "image"
    if ext in ALLOWED_EXTENSIONS["document"]: return "document"
    return None

import asyncio
async def run_deep_extraction_task(file_path: Path, filename: str, session_id: str, user_id: int, engine: str, prompt: str = None, use_high_precision: bool = False):
    """后台执行深度提取任务 / Execute deep extraction task in background"""
    loop = asyncio.get_event_loop()
    try:
        logger.info(f"🚀 [Background] Starting deep task (启动深度任务): {filename} (Async mode, High precision: {use_high_precision})")

        # 1. 深度解析文档 - 异步执行
        text_content = await DocumentProcessor.process_document(
            file_path,
            engine,
            use_high_precision
        )
        
        if text_content.startswith("错误:") or text_content.startswith("Error:"):
            logger.error(f"❌ [Background] MinerU extraction failed (解析失败): {text_content}")
            await session_db.create_message({
                "session_id": session_id,
                "role": "assistant",
                "content": f"❌ Deep analysis failed (深度解析失败): {filename}\nReason (原因): {text_content}"
            })
            return

        # 2. 知识提取
        knowledge = await knowledge_extraction_service.extract_knowledge(text_content, prompt)
        
        # 3. 持久化到 PostgreSQL
        if knowledge:
            await knowledge_extraction_service.extract_and_save(text_content, filename, prompt)
        
        # 4. 存入向量库
        await vector_store.add_text(
            text=text_content,
            metadata={"filename": filename, "type": "knowledge_source", "engine": engine},
            session_id=session_id,
            user_id=user_id
        )

        # 5. 完成通知
        knowledge_count = len(knowledge)
        summary = f"✅ **Deep analysis completed in background! (深度解析已在后台完成！)**\nFile (文件): 《{filename}》\nResult (结果): Successfully extracted {knowledge_count} points (成功提取了 {knowledge_count} 条知识点)。\n\n**Preview (预览):**\n{text_content[:1000]}..."
        
        final_data = {
            "knowledge": knowledge,
            "markdown_full": text_content,
            "file_url": f"/uploads/{file_path.name}",
            "is_knowledge_extraction": True,
            "is_background_completed": True
        }
        
        await session_db.create_message({
            "session_id": session_id,
            "role": "assistant",
            "content": summary,
            "data": json.dumps(final_data)
        })
        logger.info(f"🏁 [Background] Task completed (任务圆满完成): {filename}")
        
    except Exception as e:
        logger.error(f"❌ [Background] Critical task failed (关键任务失败): {str(e)}")
        traceback.print_exc()
        try:
            await session_db.create_message({
                "session_id": session_id,
                "role": "assistant",
                "content": f"❌ Background processing error (后台处理出现异常), please check logs.\nError (错误): {str(e)}"
            })
        except: pass

@router.post("/upload/knowledge")
async def upload_for_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    engine: str = Form("pro"),
    prompt: Optional[str] = Form(None),
    use_high_precision: bool = Form(False),
    current_user: dict = Depends(get_current_user)
):
    """上传并提交后台深度提取任务 / Upload and submit background deep extraction task"""
    if not file.filename: raise HTTPException(status_code=400, detail="Filename is empty (文件名为空)")
    user_id = current_user["id"]
    
    unique_filename = f"ext_{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        precision_tag = " [✨ High Precision (高精度模式)]" if use_high_precision else ""
        processing_msg = f"⏳ **Task submitted to background (任务已成功提交至后台执行){precision_tag}**\nFile (文件): 《{file.filename}》\nStatus (状态): System is performing deep extraction. Results will appear in the chat list once completed."

        await session_db.create_message({
            "session_id": session_id,
            "role": "assistant",
            "content": processing_msg,
            "data": json.dumps({"status": "processing", "file": file.filename, "high_precision": use_high_precision})
        })

        background_tasks.add_task(
            run_deep_extraction_task,
            file_path,
            file.filename,
            session_id,
            user_id,
            engine,
            prompt,
            use_high_precision
        )

        return {
            "filename": file.filename,
            "status": "processing",
            "message": processing_msg,
            "file_url": f"/uploads/{unique_filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    engine: str = Form("light"),
    use_high_precision: bool = Form(False),
    current_user: dict = Depends(get_current_user)
):
    """普通上传并同步 RAG 索引 / Standard upload and sync RAG index"""
    user_id = current_user["id"]
    unique_filename = f"{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        text_content = await DocumentProcessor.process_document(
            file_path, 
            engine=engine, 
            use_high_precision=use_high_precision
        )
        
        print(f"\n📄 [OCR/Parser Result / 解析结果] ================================")
        print(f"📄 File (文件): {file.filename}")
        print(f"📄 Preview (前 2000 字):\n{text_content[:2000]}")
        
        if not text_content or text_content.strip() == "" or text_content.startswith("错误:") or text_content.startswith("Error:"):
            print(f"⚠️ [Warning] Extraction failed (解析失败). Reason: {text_content}")
            raise HTTPException(
                status_code=400, 
                detail=f"Parsing failed (解析失败): {text_content if text_content else 'Empty content'}"
            )
        
        print(f"==================================================\n")

        await vector_store.add_text(text_content, {"filename": file.filename}, session_id=session_id, user_id=user_id)

        return {
            "filename": file.filename,
            "url": f"/api/uploads/{unique_filename}",
            "status": "indexed",
            "text_preview": text_content[:200] if text_content else "No content recognized"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists(): raise HTTPException(status_code=404, detail="Not Found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path)
