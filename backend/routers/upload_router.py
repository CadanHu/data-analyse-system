"""
文件上传路由
"""
import os
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional

from config import ALLOWED_ORIGINS, LOG_LEVEL, LOG_FILE, LOG_JSON_FORMAT, UPLOAD_DIR
from utils.logger import logger

router = APIRouter()

# 确保上传目录存在
UPLOAD_DIR.mkdir(exist_ok=True)

print(f"📁 [UploadRouter] 文件上传目录: {UPLOAD_DIR}")

ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "document": {".pdf", ".txt", ".csv", ".xlsx", ".xls"}
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def get_file_type(filename: str) -> Optional[str]:
    """根据文件扩展名判断文件类型"""
    ext = Path(filename).suffix.lower()
    if ext in ALLOWED_EXTENSIONS["image"]:
        return "image"
    elif ext in ALLOWED_EXTENSIONS["document"]:
        return "document"
    return None

from services.document_processor import DocumentProcessor
from services.vector_store import VectorStore
from services.knowledge_extraction_service import knowledge_extraction_service
import traceback
from fastapi import Form

vector_store = VectorStore()

# ... (保持 UPLOAD_DIR 和 ALLOWED_EXTENSIONS 不变) ...

@router.post("/upload/knowledge")
async def upload_for_knowledge(
    file: UploadFile = File(...),
    engine: str = Form("pro"),  # 默认使用 MinerU 进行深度解析
    prompt: Optional[str] = Form(None)
):
    """上传并进行深度知识提取 (PDF -> Markdown -> JSON)"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    
    file_type = get_file_type(file.filename)
    if file_type != "document":
        raise HTTPException(status_code=400, detail="深度提取仅支持文档类型 (PDF/TXT/EXCEL)")
    
    content = await file.read()
    unique_filename = f"ext_{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        with open(file_path, "wb") as f:
            f.write(content)
        
        # 1. 深度解析文档 (MinerU)
        text_content = DocumentProcessor.process_document(file_path, engine=engine)
        
        # 拦截解析失败的情况
        if text_content.startswith("错误:"):
            return {
                "filename": file.filename,
                "status": "failed",
                "knowledge_count": 0,
                "data": [],
                "markdown_preview": text_content
            }

        # --- 新增：保存解析后的 Markdown 到本地磁盘 ---
        try:
            md_filename = Path(file.filename).stem + ".md"
            md_path = UPLOAD_DIR / md_filename
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(text_content)
            logger.info(f"💾 已保存解析后的内容到: {md_path}")
        except Exception as e:
            logger.error(f"⚠️ 保存 Markdown 失败: {str(e)}")
        # ----------------------------------------

        # 2. 知识提取并持久化 (LangExtract + PostgreSQL)
        knowledge = await knowledge_extraction_service.extract_and_save(
            text_content, 
            doc_id=file.filename, 
            prompt=prompt
        )
        
        # 3. 存入向量库 (可选，保留原始文本以供检索)
        await vector_store.add_text(
            text=text_content, 
            metadata={
                "filename": file.filename,
                "type": "knowledge_source",
                "engine": engine
            }
        )

        return {
            "filename": file.filename,
            "status": "success",
            "knowledge_count": len(knowledge),
            "data": knowledge,
            "markdown_preview": text_content[:1000] if text_content else ""
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"深度处理失败: {str(e)}")

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    engine: str = Form("light")  # 默认为轻量级 PyMuPDF
):
    """上传并处理文件"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    
    file_type = get_file_type(file.filename)
    if not file_type:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")
    
    unique_filename = f"{uuid.uuid4()}{Path(file.filename).suffix.lower()}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        with open(file_path, "wb") as f:
            f.write(content)
        
        # --- 核心 RAG 流程开始 ---
        if file_type == "document":
            # 1. 解析文档
            text_content = DocumentProcessor.process_document(file_path, engine=engine)
            
            # 2. 存入向量库
            await vector_store.add_text(
                text=text_content, 
                metadata={
                    "filename": file.filename,
                    "file_path": str(file_path),
                    "engine": engine
                }
            )
        # --- 核心 RAG 流程结束 ---

        return {
            "filename": file.filename,
            "url": f"/api/uploads/{unique_filename}",
            "type": file_type,
            "status": "indexed" if file_type == "document" else "saved"
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@router.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    """获取上传的文件"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    from fastapi.responses import FileResponse
    return FileResponse(file_path)
