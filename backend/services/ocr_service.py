import httpx
import os
import asyncio
import base64
import json
from pathlib import Path
from typing import Optional, Dict, Any
from utils.logger import logger

class OCRService:
    """
    OCR 服务客户端 - 严格适配百度千帆 DeepSeek-OCR (2025-12-22 文档)
    重点解决 Base64 字段位置问题
    """
    
    def __init__(self):
        self.api_key = os.getenv("BAIDU_QIANFAN_API_KEY")
        self.api_url = "https://qianfan.baidubce.com/v2/chat/completions"
        self.model = "deepseek-ocr"
        self.timeout = 300
        self.client = httpx.AsyncClient(timeout=self.timeout)

    async def _image_to_base64(self, image_path: Path) -> str:
        """格式：data:image/<格式>;base64,<编码>"""
        with open(image_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8").replace("\n", "").replace("\r", "")
            ext = image_path.suffix.lower().lstrip(".")
            if ext == "jpg": ext = "jpeg"
            return f"data:image/{ext};base64,{encoded}"

    async def process_file(self, file_path: Path, engine: str = "light") -> str:
        if not file_path.exists(): return "错误: 文件不存在"
        if not self.api_key: return "错误: 未配置 API Key"

        try:
            image_data = await self._image_to_base64(file_path)
            
            # 🚀 根据文档描述的“缩进结构”：
            # 每一个 item 包含 type, text, image_url, content
            # 对于 Base64，我们尝试将数据放在 item 根部的 content 字段中
            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "OCR this image."
                            },
                            {
                                "type": "image_url",
                                # 🚀 关键：根据文档平级缩进关系，Base64 极大概率放在这里
                                "content": image_data
                            }
                        ]
                    }
                ]
            }
            
            # 审计日志
            audit_payload = json.loads(json.dumps(payload))
            for item in audit_payload["messages"][0]["content"]:
                if "content" in item and len(str(item["content"])) > 50:
                    item["content"] = str(item["content"])[:50] + "...[TRUNCATED]"
            
            print(f"\n📤 [OCR 文档精准对齐审计] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
            print(f"📡 结构: content 数组 Item 中 type='image_url' 且 content='base64'")
            print(json.dumps(audit_payload, ensure_ascii=False, indent=2))
            print(f"<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n")

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            
            response = await self.client.post(self.api_url, headers=headers, json=payload)
            result = response.json()
            
            if response.status_code != 200:
                print(f"❌ [OCR API 报错] 详情: {json.dumps(result, ensure_ascii=False)}")
                return f"错误: 百度接口报错 {response.status_code}"

            usage = result.get("usage", {})
            p_tokens = usage.get("prompt_tokens", 0)
            print(f"📊 [OCR API 返回审计] Prompt Tokens: {p_tokens}")
            
            if p_tokens < 100:
                print("⚠️ [警告] Token 消耗依然异常！尝试另一种平级结构...")
                return await self._process_via_alternate_structure(image_data)

            choices = result.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "识别结果为空")
            return "错误: 无有效回答"
            
        except Exception as e:
            return f"错误: 解析异常 - {str(e)}"

    async def _process_via_alternate_structure(self, image_data: str) -> str:
        """备选方案：如果上面的结构失败，尝试 image_url.content 的嵌套方式"""
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": "OCR this image."},
                {"type": "image_url", "image_url": {"content": image_data}}
            ]}]
        }
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(self.api_url, headers=headers, json=payload)
            res = resp.json()
            print(f"📊 [OCR 备选结构审计] Token: {res.get('usage', {}).get('prompt_tokens')}")
            return res.get("choices", [{}])[0].get("message", {}).get("content", "备选解析失败")

    async def __aenter__(self): return self
    async def __aexit__(self, *args): await self.client.aclose()

ocr_service = OCRService()
