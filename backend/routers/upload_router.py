"""
文件上传与异步深度处理路由
"""
import os
import uuid
import json
import traceback
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form

from config import UPLOAD_DIR
from utils.logger import logger
from database.session_db import session_db
from services.document_processor import DocumentProcessor
from services.vector_store import VectorStore
from services.knowledge_extraction_service import knowledge_extraction_service

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

async def run_deep_extraction_task(file_path: Path, filename: str, session_id: str, engine: str, prompt: str = None):
    """后台执行深度提取任务 (彻底解放主线程)"""
    loop = asyncio.get_event_loop()
    try:
        logger.info(f"🚀 [Background] 启动深度任务: {filename} (异步线程模式)")
        
        # 1. 深度解析文档 - 强制在独立线程中运行，不阻塞主循环
        # 注意：这里改用 loop.run_in_executor
        text_content = await loop.run_in_executor(
            None, 
            DocumentProcessor.process_document, 
            file_path, 
            engine
        )
        
        if text_content.startswith("错误:"):
            logger.error(f"❌ [Background] MinerU 解析失败: {text_content}")
            await session_db.create_message({
                "session_id": session_id,
                "role": "assistant",
                "content": f"❌ 深度解析失败: {filename}\n原因: {text_content}"
            })
            return

        # 2. 知识提取 - LangExtract 内部虽有并行，但外层仍需异步保护
        knowledge = await knowledge_extraction_service.extract_knowledge(text_content, prompt)
        
        # 3. 持久化到 PostgreSQL
        if knowledge:
            await knowledge_extraction_service.extract_and_save(text_content, filename, prompt)
        
        # 4. 存入向量库
        await vector_store.add_text(
            text=text_content, 
            metadata={"filename": filename, "type": "knowledge_source", "engine": engine},
            session_id=session_id
        )

        # 5. 完成通知
        knowledge_count = len(knowledge)
        summary = f"✅ **深度解析已在后台完成！**\n文件: 《{filename}》\n结果: 成功提取了 {knowledge_count} 条知识点。\n\n**解析内容预览:**\n{text_content[:1000]}..."
        
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
        logger.info(f"🏁 [Background] 任务圆满完成: {filename}")
        
    except Exception as e:
        logger.error(f"❌ [Background] 关键任务失败: {str(e)}")
        traceback.print_exc()
        # 发生严重错误也要通知用户，否则用户会一直等
        try:
            await session_db.create_message({
                "session_id": session_id,
                "role": "assistant",
                "content": f"❌ 后台处理出现异常，请查看系统日志。\n错误: {str(e)}"
            })
        except: pass

@router.post("/upload/knowledge")
async def upload_for_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    engine: str = Form("pro"),
    prompt: Optional[str] = Form(None)
):
    """上传并提交后台深度提取任务 (立即返回)"""
    if not file.filename: raise HTTPException(status_code=400, detail="文件名为空")
    
    unique_filename = f"ext_{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # --- 关键修复：先将处理中的提示消息持久化存入数据库 ---
        processing_msg = f"⏳ **任务已成功提交至后台执行**\n文件: 《{file.filename}》\n状态: 系统正在进行深度解析与知识提取，您可以继续其他操作。解析完成后，结果将自动出现在对话列表中。"

        await session_db.create_message({
            "session_id": session_id,
            "role": "assistant",
            "content": processing_msg,
            "data": json.dumps({"status": "processing", "file": file.filename})
        })

        # 立即启动后台任务
        background_tasks.add_task(run_deep_extraction_task, file_path, file.filename, session_id, engine, prompt)

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
    engine: str = Form("light")
):
    """普通上传并同步 RAG 索引"""
    unique_filename = f"{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        text_content = DocumentProcessor.process_document(file_path, engine=engine)
        await vector_store.add_text(text_content, {"filename": file.filename}, session_id=session_id)

        return {
            "filename": file.filename,
            "url": f"/api/uploads/{unique_filename}",
            "status": "indexed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists(): raise HTTPException(status_code=404, detail="Not Found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path)
