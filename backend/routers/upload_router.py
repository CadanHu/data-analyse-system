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
from services.knowledge_extraction_service import knowledge_extraction_service, extract_knowledge_graph_for_web
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
import re as _re

def _rewrite_image_paths(markdown: str, stem: str) -> str:
    """将 MinerU markdown 中的相对图片路径替换为可访问的 API 绝对路径"""
    base = f"/api/uploads/parsed/{stem}/images/"
    markdown = _re.sub(r'!\[([^\]]*)\]\(\./images/', f'![\\1]({base}', markdown)
    markdown = _re.sub(r'!\[([^\]]*)\]\(images/', f'![\\1]({base}', markdown)
    return markdown

async def run_deep_extraction_task(file_path: Path, filename: str, session_id: str, user_id: int, engine: str, prompt: str = None, use_high_precision: bool = False, page_ranges: str = None):
    """后台执行深度提取任务 / Execute deep extraction task in background"""
    loop = asyncio.get_event_loop()
    try:
        logger.info(f"🚀 [Background] Starting deep task (启动深度任务): {filename} (Async mode, High precision: {use_high_precision})")

        # 计算 Plan A（按文件名）和 Plan B（按会话）的保存目录
        stem = Path(filename).stem
        save_dirs = [
            UPLOAD_DIR / "parsed" / stem,                          # Plan A
            UPLOAD_DIR / "sessions" / session_id / "parsed" / stem, # Plan B
        ]

        # 1. 深度解析文档 - 异步执行
        text_content = await DocumentProcessor.process_document(
            file_path,
            engine,
            use_high_precision,
            save_dirs=save_dirs,
            page_ranges=page_ranges,
        )
        # 修复 MinerU 返回的相对图片路径为可访问的绝对 URL
        stem = Path(filename).stem
        text_content = _rewrite_image_paths(text_content, stem)
        
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

        # 5. 知识图谱抽取（Web 专用，仅 knowledge 引擎）
        knowledge_graph = None
        if engine == "knowledge":
            logger.info(f"🕸️ [Background] 正在抽取知识图谱: {filename}")
            knowledge_graph = await extract_knowledge_graph_for_web(text_content, user_id, filename)

        # 6. 完成通知
        knowledge_count = len(knowledge)
        graph_hint = f"\n\n💡 知识图谱已生成（{len(knowledge_graph['entities'])} 实体，{len(knowledge_graph['relations'])} 关系），点击消息上方「知识图谱」按钮查看。" if knowledge_graph else ""
        summary = f"✅ **深度解析已完成！**\n文件：《{filename}》\n成功提取了 {knowledge_count} 条知识点。{graph_hint}\n\n**预览：**\n{text_content[:1000]}..."

        final_data = {
            "knowledge": knowledge,
            "markdown_full": text_content,
            "file_url": f"/uploads/{file_path.name}",
            "is_knowledge_extraction": True,
            "is_background_completed": True,
            "doc_name": filename,
        }
        if knowledge_graph:
            final_data["has_graph"] = True
            final_data["knowledge_graph"] = knowledge_graph
        
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
    page_range: Optional[str] = Form(None),
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
            use_high_precision,
            page_range,
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
    page_range: Optional[str] = Form(None),
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
        
        # MinerU 引擎同时保存全量解析文件
        sync_save_dirs = None
        if engine in ("pro", "knowledge"):
            stem = Path(file.filename).stem
            sync_save_dirs = [
                UPLOAD_DIR / "parsed" / stem,
                UPLOAD_DIR / "sessions" / session_id / "parsed" / stem,
            ]

        text_content = await DocumentProcessor.process_document(
            file_path,
            engine=engine,
            use_high_precision=use_high_precision,
            save_dirs=sync_save_dirs,
            page_ranges=page_range,
        )
        # 修复 MinerU 返回的相对图片路径
        if engine in ("pro", "knowledge") and sync_save_dirs:
            stem = Path(file.filename).stem
            text_content = _rewrite_image_paths(text_content, stem)
        
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

@router.get("/uploads/{filepath:path}")
async def get_uploaded_file(filepath: str):
    file_path = UPLOAD_DIR / filepath
    # 安全检查：不允许路径穿越
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Not Found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path)


@router.get("/parsed-output/{stem}")
async def list_parsed_output(stem: str):
    """列出 Plan A 目录下的解析文件列表"""
    plan_a = UPLOAD_DIR / "parsed" / stem
    if not plan_a.exists():
        raise HTTPException(status_code=404, detail="Parsed output not found")
    files = []
    for p in sorted(plan_a.rglob("*")):
        if p.is_file():
            rel = str(p.relative_to(plan_a))
            files.append({"name": rel, "size": p.stat().st_size, "url": f"/api/uploads/parsed/{stem}/{rel}"})
    return {"stem": stem, "dir": str(plan_a), "files": files}


@router.get("/parsed-output/session/{session_id}/{stem}")
async def list_session_parsed_output(session_id: str, stem: str):
    """列出 Plan B（会话维度）目录下的解析文件列表"""
    plan_b = UPLOAD_DIR / "sessions" / session_id / "parsed" / stem
    if not plan_b.exists():
        raise HTTPException(status_code=404, detail="Parsed output not found")
    files = []
    for p in sorted(plan_b.rglob("*")):
        if p.is_file():
            rel = str(p.relative_to(plan_b))
            files.append({"name": rel, "size": p.stat().st_size, "url": f"/api/uploads/sessions/{session_id}/parsed/{stem}/{rel}"})
    return {"session_id": session_id, "stem": stem, "dir": str(plan_b), "files": files}
