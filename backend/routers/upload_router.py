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


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件接口"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    
    file_type = get_file_type(file.filename)
    if not file_type:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    file_size = 0
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制 (最大 {MAX_FILE_SIZE // (1024*1024)}MB)")
    
    file_ext = Path(file.filename).suffix.lower()
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        with open(file_path, "wb") as f:
            f.write(content)
        
        file_url = f"/uploads/{unique_filename}"
        
        return {
            "filename": file.filename,
            "url": file_url,
            "size": file_size,
            "type": file_type,
            "uploaded_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")


@router.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    """获取上传的文件"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    from fastapi.responses import FileResponse
    return FileResponse(file_path)
