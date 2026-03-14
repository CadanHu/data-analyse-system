"""
PDF 报告生成服务 - Playwright 无头浏览器版
核心逻辑：先让 Chromium 执行 JS 渲染 ECharts，等图表加载完毕后再打印 PDF
"""
import asyncio
import re
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
from utils.logger import logger

# 强制绝对路径
BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "outputs"
if not OUTPUT_DIR.exists():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class PDFService:
    """
    离线 PDF 报告生成服务 (Playwright 无头浏览器版)
    使用 Chromium headless 来执行 JS，确保 ECharts 图表能正确渲染进 PDF
    """

    def _inject_print_styles(self, html: str) -> str:
        """
        在原始 HTML 的 <head> 里注入打印专用样式，
        不破坏任何原有样式，只做补丁和分页控制。
        """
        print_css = """
        <style id="datapulse-print-patch">
        @page {
            size: A4;
            margin: 1.2cm;
        }
        @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { background: #fff !important; }
            script, button, .no-print { display: none !important; }

            /* 图表容器：给定固定高度，防止 chromium 打印时缩成 0 */
            div[id^="chart"] {
                page-break-inside: avoid;
                min-height: 380px;
            }
            .section, section {
                page-break-inside: avoid;
            }
            table {
                page-break-inside: auto;
            }
            tr { page-break-inside: avoid; }
        }
        </style>
        """

        # 如果有 </head>，在其前面插入；如果没有，加到最前面
        if "</head>" in html:
            html = html.replace("</head>", f"{print_css}</head>", 1)
        else:
            html = print_css + html
        return html

    async def generate_report_pdf(self, report_data: Dict[str, Any]) -> Optional[str]:
        """
        使用 Playwright 无头 Chromium 渲染 HTML（包含 JS/ECharts），然后打印 PDF。
        """
        title = report_data.get("title", "Analysis Report")
        html_content = report_data.get("html", "")

        if not html_content:
            logger.error("❌ [PDF] html 内容为空，无法生成报告")
            return None

        # 注入打印样式
        html_with_styles = self._inject_print_styles(html_content)

        # 将 HTML 写入临时文件，让 Playwright 通过 file:// 访问（CDN JS 脚本需要网络）
        # 先试一试直接用 string content 方式
        filename = f"Analytical_Report_{datetime.now().strftime('%Y%j_%H%M%S_%f')}.pdf"
        output_path = OUTPUT_DIR / filename

        logger.info(f"🚀 [PDF-Playwright] 开始无头渲染: {filename}")
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # 设置视口宽度为 A4 等效像素（794px @ 96dpi）
                await page.set_viewport_size({"width": 1200, "height": 900})

                # 使用 set_content 加载 HTML；同时允许网络加载 CDN（ECharts）
                await page.set_content(html_with_styles, wait_until="domcontentloaded", timeout=30000)

                # 等待 ECharts 渲染完成：检测所有 canvas 都有宽度，最多等 10s
                try:
                    await page.wait_for_function(
                        """() => {
                            const canvases = document.querySelectorAll('canvas');
                            if (canvases.length === 0) return true;  // 没有 canvas，直接通过
                            return Array.from(canvases).every(c => c.offsetWidth > 0);
                        }""",
                        timeout=10000
                    )
                    logger.info("✅ [PDF-Playwright] ECharts canvas 检测通过，等待额外渲染帧...")
                    # 额外等待 1.5 秒确保动画帧绘制完毕
                    await asyncio.sleep(1.5)
                except Exception:
                    logger.warning("⚠️ [PDF-Playwright] canvas 等待超时，直接打印（可能图表未完全渲染）")
                    await asyncio.sleep(2.0)

                # 打印 PDF
                await page.pdf(
                    path=str(output_path),
                    format="A4",
                    print_background=True,
                    margin={
                        "top": "1.2cm",
                        "bottom": "1.2cm",
                        "left": "1.2cm",
                        "right": "1.2cm"
                    }
                )
                await browser.close()

            logger.info(f"✅ [PDF-Playwright] PDF 生成成功: {output_path} ({output_path.stat().st_size // 1024} KB)")
            return str(output_path)

        except Exception as e:
            import traceback
            logger.error(f"❌ [PDF-Playwright] 渲染失败: {str(e)}")
            logger.error(traceback.format_exc())
            # 降级到 WeasyPrint（仅静态内容）
            logger.warning("⚠️ [PDF] 降级到 WeasyPrint（无 JS 渲染）...")
            return await self._fallback_weasyprint(html_with_styles, output_path)

    async def _fallback_weasyprint(self, html: str, output_path: Path) -> Optional[str]:
        """WeasyPrint 降级方案（图表为占位框）"""
        try:
            from weasyprint import HTML
            import concurrent.futures

            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                await loop.run_in_executor(
                    executor,
                    lambda: HTML(string=html).write_pdf(target=str(output_path))
                )
            logger.info(f"✅ [PDF-WeasyPrint] 降级 PDF 已生成: {output_path}")
            return str(output_path)
        except Exception as e:
            logger.error(f"❌ [PDF-WeasyPrint] 降级也失败了: {str(e)}")
            return None


# 单例
pdf_service = PDFService()
