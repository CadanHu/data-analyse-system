import os
import time
import requests
import zipfile
import io
import json
from typing import Optional, Dict, Any, List
from pathlib import Path
from utils.logger import logger

class MinerUService:
    """MinerU 云端解析服务 (最终修复版)"""
    
    BASE_URL = "https://mineru.net/api/v4"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("MINERU_API_KEY")
        if not self.api_key:
            logger.warning("⚠️ MinerU API Key 未配置。")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        # 强制直连，不走代理（解决国内 API 访问冲突）
        self.no_proxy = {"http": None, "https": None}

    def _get_upload_url(self, filename: str) -> Optional[Dict[str, Any]]:
        """第一步：申请上传 URL"""
        url = f"{self.BASE_URL}/file-urls/batch"
        data = {
            "files": [{"name": filename, "data_id": f"ext_{int(time.time())}"}],
            "model_version": "vlm"
        }
        try:
            logger.info(f"📡 [MinerU] 申请上传 URL: {filename}")
            response = requests.post(url, headers=self.headers, json=data, timeout=15, proxies=self.no_proxy)
            result = response.json()
            if result.get("code") == 0:
                batch_id = result["data"]["batch_id"]
                upload_urls = result["data"]["file_urls"]
                return {
                    "batch_id": batch_id,
                    "upload_url": upload_urls[0]
                }
            else:
                logger.error(f"❌ [MinerU] 申请 URL 失败: {result.get('msg')}")
                return None
        except Exception as e:
            logger.error(f"❌ [MinerU] 请求异常: {str(e)}")
            return None

    def _upload_file(self, upload_url: str, file_path: Path) -> bool:
        """第二步：PUT 上传文件"""
        try:
            logger.info(f"📤 [MinerU] 上传二进制流: {file_path.name}")
            with open(file_path, "rb") as f:
                # 上传到阿里云 OSS 建议直连
                response = requests.put(upload_url, data=f, timeout=120, proxies=self.no_proxy)
                if response.status_code == 200:
                    logger.info("✅ [MinerU] 上传成功")
                    return True
                else:
                    logger.error(f"❌ [MinerU] 上传失败, 状态码: {response.status_code}")
                    return False
        except Exception as e:
            logger.error(f"❌ [MinerU] 上传异常: {str(e)}")
            return False

    def _download_and_extract_md(self, zip_url: str) -> str:
        """从结果压缩包中提取 Markdown 内容"""
        try:
            logger.info(f"📡 [MinerU] 正在下载并解析结果包: {zip_url}")
            
            # 使用 Auth 头并强制直连
            resp = requests.get(zip_url, headers=self.headers, timeout=30, proxies=self.no_proxy)
            
            if resp.status_code != 200:
                logger.error(f"❌ [MinerU] 结果包下载失败 (状态码: {resp.status_code})")
                return f"错误: 结果包下载失败 (状态码: {resp.status_code})"
            
            # 检查是否为有效 ZIP
            if resp.content[:2] != b'PK':
                content_type = resp.headers.get("Content-Type", "")
                logger.error(f"❌ [MinerU] 下载的内容不是 ZIP (Type: {content_type})")
                if "text/html" in content_type:
                    logger.error(f"📄 HTML 预览: {resp.text[:200]}")
                return "错误: 提取结果失败 - 下载的内容不是有效的 ZIP 文件"

            with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                # 寻找根目录或子目录下的 .md 文件
                for name in z.namelist():
                    if name.endswith('.md'):
                        logger.info(f"📄 [MinerU] 找到 Markdown 文件: {name}")
                        with z.open(name) as f:
                            return f.read().decode('utf-8')
            return "错误: 压缩包内未找到 Markdown 文件"
        except Exception as e:
            logger.error(f"❌ [MinerU] 提取结果失败: {str(e)}")
            return f"错误: 提取结果失败 - {str(e)}"

    def _poll_task(self, batch_id: str) -> str:
        """第三步：轮询任务状态"""
        url = f"{self.BASE_URL}/extract-results/batch/{batch_id}"
        max_retries = 60
        interval = 5      
        
        logger.info(f"⏳ [MinerU] 开始轮询结果, ID: {batch_id}")
        for i in range(max_retries):
            try:
                response = requests.get(url, headers=self.headers, timeout=15, proxies=self.no_proxy)
                result = response.json()
                if result.get("code") == 0:
                    extract_results = result["data"].get("extract_result", [])
                    if not extract_results:
                        time.sleep(interval)
                        continue
                    
                    task_info = extract_results[0]
                    state = task_info.get("state")
                    if state == "done":
                        logger.info("✅ [MinerU] 任务解析完成")
                        
                        # 1. 尝试直接获取
                        for field in ["content", "markdown", "full_markdown"]:
                            val = task_info.get(field)
                            if val:
                                return val
                        
                        # 2. 尝试下载 ZIP
                        zip_url = task_info.get("full_zip_url")
                        if zip_url:
                            return self._download_and_extract_md(zip_url)
                        
                        return "错误: 解析完成但未找到内容或链接"
                    elif state == "failed":
                        err = task_info.get("err_msg") or "未知错误"
                        return f"错误: MinerU 解析失败 - {err}"
                    else:
                        logger.info(f"⏳ [MinerU] 状态: {state}... {i+1}/{max_retries}")
                else:
                    logger.error(f"❌ [MinerU] 轮询异常: {result.get('msg')}")
            except Exception as e:
                logger.error(f"❌ [MinerU] 请求出错: {str(e)}")
            time.sleep(interval)
        return "错误: 任务处理超时 (5分钟)"

    def parse_pdf(self, file_path: Path) -> str:
        if not self.api_key: return "错误: 未配置 MinerU API Key"
        info = self._get_upload_url(file_path.name)
        if not info: return "错误: 申请上传通道失败"
        if not self._upload_file(info["upload_url"], file_path):
            return "错误: 文件上传失败"
        return self._poll_task(info["batch_id"])

# 全局实例
mineru_service = MinerUService()
