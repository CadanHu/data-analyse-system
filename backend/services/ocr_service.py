import httpx
import os
import asyncio
import base64
from pathlib import Path
from typing import Optional, Dict, Any
from utils.logger import logger

class OCRService:
    """
    OCR 服务客户端 (支持百度千帆 DeepSeek-OCR)
    """
    
    def __init__(self):
        # 从环境变量读取百度配置
        self.api_key = os.getenv("BAIDU_QIANFAN_API_KEY")
        self.api_url = "https://qianfan.baidubce.com/v2/chat/completions"
        self.model = "deepseek-ocr"
        
        # 备用本地配置 (保留之前的逻辑)
        self.local_url = os.getenv("OCR_SERVICE_URL", "http://localhost:8707").rstrip("/")
        
        self.timeout = 300
        self.client = httpx.AsyncClient(timeout=self.timeout)

    async def _image_to_base64(self, image_path: Path) -> str:
        """将图片转换为 Base64 编码"""
        with open(image_path, "rb") as f:
            encoded_string = base64.b64encode(f.read()).decode("utf-8")
            # 自动识别后缀
            ext = image_path.suffix.lower().replace(".", "")
            if ext == "jpg": ext = "jpeg"
            return f"data:image/{ext};base64,{encoded_string}"

    async def process_file(self, file_path: Path) -> Optional[str]:
        """
        处理文件 OCR (优先使用百度云端接口)
        """
        if not file_path.exists():
            logger.error(f"❌ OCR 文件不存在: {file_path}")
            return None

        # 如果有百度 Key，走百度云端
        if self.api_key and self.api_key.startswith("bce-v3"):
            return await self._process_via_baidu(file_path)
        
        # 否则回退到本地 (之前的逻辑)
        return await self._process_via_local(file_path)

    async def _process_via_baidu(self, file_path: Path) -> Optional[str]:
        """使用百度千帆 deepseek-ocr 接口"""
        logger.info(f"📡 [OCR] 使用百度云端 DeepSeek-OCR | 文件: {file_path.name}")
        
        try:
            # 百度 OCR 仅支持单张图片。如果是 PDF，建议后续先转为图片或告知限制
            if file_path.suffix.lower() == ".pdf":
                logger.warning("⚠️ 百度 DeepSeek-OCR 当前主要支持图片格式，PDF 建议先转图")
                # 暂时尝试直接发送，看百度是否支持 PDF 字节流，若不支持则需 pdf2image
            
            image_data = await self._image_to_base64(file_path)
            
            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Convert the document to markdown."},
                            {"type": "image_url", "image_url": {"url": image_data}}
                        ]
                    }
                ],
                "temperature": 0.1
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }

            response = await self.client.post(self.api_url, headers=headers, json=payload)
            
            if response.status_code == 200:
                result = response.json()
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content:
                    logger.info(f"✅ [OCR] 百度提取成功 | 长度: {len(content)}")
                    return content
            
            logger.error(f"❌ [OCR] 百度请求失败: {response.status_code} | {response.text}")
            return None

        except Exception as e:
            logger.error(f"❌ [OCR] 百度处理错误: {str(e)}")
            return None

    async def _process_via_local(self, file_path: Path) -> Optional[str]:
        """原本的本地服务调用逻辑"""
        url = f"{self.local_url}/ocr"
        try:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f)}
                response = await self.client.post(url, files=files)
                if response.status_code == 200:
                    return response.json().get("markdown")
            return None
        except:
            return None

    async def __aenter__(self): return self
    async def __aexit__(self, *args): await self.client.aclose()

ocr_service = OCRService()
