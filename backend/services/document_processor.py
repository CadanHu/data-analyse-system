import os
from typing import List, Dict, Any, Optional
from pathlib import Path
import traceback

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
    def process_pdf_pro(file_path: Path) -> str:
        """重量级解析：MinerU (Magic-PDF)"""
        # --- MinerU 测试与逻辑说明 ---
        # 1. 本地模式：需要 pip install magic-pdf[full] 并下载几 GB 的模型权重
        # 2. API 模式：建议调用已部署的 MinerU 服务的 API 接口（如私有云部署）
        try:
            # 此处目前返回模拟内容，若要启用真实 MinerU，请取消下方注释并安装依赖
            # from magic_pdf.data.data_reader_factory import get_data_reader
            return "[MinerU] 深度解析已就绪：此模式下 AI 将能识别 PDF 中的表格、数学公式和多栏布局。"
        except Exception as e:
            return f"MinerU 解析未就绪: {str(e)}"

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
    def process_document(cls, file_path: Path, engine: str = "light") -> str:
        """分发器"""
        ext = file_path.suffix.lower()
        print(f"📥 [Processor] 开始解析文件: {file_path.name}, 引擎: {engine}")
        
        if ext == ".pdf":
            if engine == "pro":
                return cls.process_pdf_pro(file_path)
            return cls.process_pdf_light(file_path)
        elif ext in [".xlsx", ".xls", ".csv"]:
            return cls.process_excel(file_path)
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        
        return "不支持的文件类型"
