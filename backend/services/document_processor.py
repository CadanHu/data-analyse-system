import os
from typing import List, Dict, Any, Optional
from pathlib import Path
import traceback
from utils.logger import logger

class DocumentProcessor:
    """文档处理引擎：支持多引擎切换 (PyMuPDF / MinerU / Pandas)"""

    @staticmethod
    def process_pdf_light(file_path: Path) -> str:
        """轻量级解析：使用 PyMuPDF (fitz)"""
        try:
            import fitz
            doc = fitz.open(str(file_path))
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        except ImportError:
            return "错误: 未安装 PyMuPDF (pip install pymupdf)"
        except Exception as e:
            return f"PyMuPDF 解析失败: {str(e)}"

    @staticmethod
    def process_pdf_pro(file_path: Path, save_dirs: Optional[List[Path]] = None, page_ranges: Optional[str] = None) -> str:
        """重量级解析：MinerU 云端解析"""
        try:
            from services.mineru_service import mineru_service
            logger.info(f"🚀 [Processor] 启动 MinerU 深度解析: {file_path.name}" + (f" 页码: {page_ranges}" if page_ranges else ""))
            return mineru_service.parse_pdf(file_path, save_dirs=save_dirs, page_ranges=page_ranges)
        except Exception as e:
            return f"MinerU 解析失败: {str(e)}"

    @staticmethod
    def process_excel(file_path: Path) -> str:
        """Excel 解析：使用 Pandas"""
        try:
            import pandas as pd
            # 确保安装了 openpyxl 和 tabulate
            df_dict = pd.read_excel(file_path, sheet_name=None)
            full_text = ""
            for sheet_name, df in df_dict.items():
                full_text += f"\n### Sheet: {sheet_name}\n"
                full_text += df.to_markdown() 
            return full_text
        except Exception as e:
            return f"Excel 解析失败 (请确保安装 pandas/tabulate): {str(e)}"

    @classmethod
    async def process_document(cls, file_path: Path, engine: str = "light", use_high_precision: bool = False, save_dirs: Optional[List[Path]] = None, page_ranges: Optional[str] = None) -> str:
        """分发器 (支持图片 OCR 与高精度开关)"""
        ext = file_path.suffix.lower()
        print(f"📥 [Processor] 开始解析文件: {file_path.name}, 引擎: {engine}, 高精度: {use_high_precision}" + (f", 页码: {page_ranges}" if page_ranges else ""))

        # 1. 图片处理
        if ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            from services.ocr_service import ocr_service
            # 🚀 修复参数名：使用 engine
            return await ocr_service.process_file(file_path, engine=engine)

        # 2. PDF 处理
        if ext == ".pdf":
            if engine in ("pro", "knowledge"):
                import asyncio, functools
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(
                    None,
                    functools.partial(cls.process_pdf_pro, file_path, save_dirs=save_dirs, page_ranges=page_ranges)
                )
            return cls.process_pdf_light(file_path)
        elif ext in [".xlsx", ".xls", ".csv"]:
            return cls.process_excel(file_path)
        elif ext in [".txt", ".md"]:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                return f"读取文本文件失败: {str(e)}"
        
        return "不支持的文件类型"
