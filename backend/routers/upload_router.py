"""
文件上传路由
"""
import os
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional

router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

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


from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional
from services.document_processor import DocumentProcessor
from services.vector_store import VectorStore

router = APIRouter()
vector_store = VectorStore()

# ... (保持 UPLOAD_DIR 和 ALLOWED_EXTENSIONS 不变) ...

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
