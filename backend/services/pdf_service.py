import os
import asyncio
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
from weasyprint import HTML, CSS
from concurrent.futures import ThreadPoolExecutor
from utils.logger import logger

# 强制绝对路径
BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "outputs"
if not OUTPUT_DIR.exists():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class PDFService:
    """
    离线 PDF 报告生成服务 (回归稳健排版 + 字体兼容版)
    """
    
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=5)

    def _get_document_styles(self) -> str:
        """专为 A4 数据报告设计的商务排版 (极强兼容性)"""
        return """
        @page {
            size: A4;
            margin: 2cm;
            @bottom-center {
                content: "DataPulse 智能分析报告 | 第 " counter(page) " 页";
                font-size: 9pt;
                color: #888;
            }
        }
        * { box-sizing: border-box; }
        body {
            /* 🚀 字体补丁：确保 macOS 预览不丢字 */
            font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Heiti SC", sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff !important;
            padding: 0;
            margin: 0;
        }
        /* 🚀 强制线性重置：彻底解决内容乱跳和堆叠 */
        div, section, article, header, footer {
            display: block !important;
            width: 100% !important;
            position: static !important;
            float: none !important;
            margin: 15pt 0 !important;
            height: auto !important;
            min-height: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
        }
        .cover {
            text-align: center;
            padding: 100pt 0;
            border-bottom: 3pt solid #1a5f7a;
            page-break-after: always;
        }
        .cover h1 { font-size: 32pt; color: #1a5f7a; }
        
        .summary-card {
            background: #f8f9fa;
            border-left: 5pt solid #1a5f7a;
            padding: 20pt;
            margin: 20pt 0;
            border-radius: 4pt;
        }
        h2 { color: #1a5f7a; font-size: 18pt; border-bottom: 1pt solid #eee; padding-bottom: 5pt; }
        
        /* 🚀 表格打印美化 */
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 20pt 0 !important;
            page-break-inside: auto;
        }
        tr { page-break-inside: avoid; }
        th, td {
            border: 1px solid #ccc !important;
            padding: 10pt 8pt !important;
            text-align: left !important;
            font-size: 10.5pt !important;
        }
        th { background: #f2f2f2 !important; font-weight: bold; }
        
        /* 隐藏无用 Web 元素 */
        script, style, button, canvas, .no-print, .echarts-container { 
            display: none !important; 
        }
        """

    def _extract_core_content(self, html: str) -> str:
        """温和清理逻辑：只去掉干扰排版的属性，保留内容"""
        if not html: return ""
        
        # 1. 移除有害标签
        html = re.sub(r'<(script|style|head|canvas|button).*?>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
        
        # 2. 移除所有布局定位属性
        html = re.sub(r'\s+style=".*?"', '', html, flags=re.IGNORECASE)
        html = re.sub(r'\s+class=".*?"', '', html, flags=re.IGNORECASE)
        
        # 3. 规范化表格
        html = html.replace('<table', '<table border="1"')
        
        return html.strip()

    async def generate_report_pdf(self, report_data: Dict[str, Any]) -> Optional[str]:
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(
                self.executor, 
                self._render_pdf_sync, 
                report_data
            )
        except Exception as e:
            logger.error(f"❌ [PDF] 生成失败: {str(e)}")
            return None

    def _render_pdf_sync(self, data: Dict[str, Any]) -> str:
        title = data.get("title", "数据分析报告")
        summary = data.get("summary", "无摘要记录")
        
        # 提取并重组
        body_content = self._extract_core_content(data.get("html", ""))
        
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>{self._get_document_styles()}</style>
        </head>
        <body>
            <div class="cover">
                <h1>{title}</h1>
                <p>DataPulse AI 商业报告</p>
                <div style="margin-top: 80pt; font-size: 10pt; color: #999;">
                    报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                </div>
            </div>
            
            <div class="summary-card">
                <h2 style="border:none; margin:0 0 10pt 0;">📄 业务核心结论</h2>
                <div>{summary}</div>
            </div>
            
            <div class="main-content">
                {body_content}
            </div>
        </body>
        </html>
        """
        
        filename = f"Analytical_Report_{datetime.now().strftime('%H%M%S')}.pdf"
        output_path = OUTPUT_DIR / filename
        
        HTML(string=full_html).write_pdf(target=str(output_path))
        
        logger.info(f"✅ [PDF] 打印版已就绪: {output_path}")
        return str(output_path)

# 单例
pdf_service = PDFService()
