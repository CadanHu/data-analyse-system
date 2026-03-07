import httpx
import os
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from utils.logger import setup_logging
import logging

logger = logging.getLogger(__name__)

class OCRService:
    """
    OCR 服务客户端 (异步版)
    对接外部 OCR 引擎 (如 DeepSeek OCR/PaddleOCR API)
    """
    
    def __init__(self, base_url: str = "http://localhost:8707", timeout: int = 300):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    async def process_file(self, file_path: Path) -> Optional[str]:
        """
        处理 PDF 或图片 OCR
        
        Args:
            file_path: 文件路径 (PDF, PNG, JPG 等)
            
        Returns:
            提取出的 Markdown 文本内容
        """
        if not file_path.exists():
            logger.error(f"❌ OCR 文件不存在: {file_path}")
            return None

        url = f"{self.base_url}/ocr"
        logger.info(f"📡 [OCR] 正在发起请求 -> {url} | 文件: {file_path.name}")
        
        try:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f)}
                response = await self.client.post(url, files=files)
                
            if response.status_code == 200:
                result = response.json()
                # 兼容多种返回格式 (markdown 或 text)
                content = result.get("markdown") or result.get("text") or result.get("data", "")
                
                if content:
                    logger.info(f"✅ [OCR] 提取成功 | 长度: {len(content)} 字符")
                    return content
                else:
                    logger.warning(f"⚠️ [OCR] 接口返回空内容 | {result}")
                    return None
            else:
                logger.error(f"❌ [OCR] 接口响应异常: {response.status_code} | {response.text}")
                return None

        except httpx.ReadTimeout:
            logger.error(f"⏰ [OCR] 请求超时 ({self.timeout}s) | 请检查服务端负载")
            return None
        except Exception as e:
            logger.error(f"❌ [OCR] 处理错误: {str(e)}")
            return None

    async def health_check(self) -> bool:
        """检查 OCR 服务是否在线"""
        try:
            response = await self.client.get(f"{self.base_url}/health", timeout=5)
            return response.status_code == 200
        except:
            return False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()

# 单例模式
ocr_service = OCRService()
