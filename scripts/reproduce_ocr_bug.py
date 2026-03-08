import os
import asyncio
import sys
from pathlib import Path
import traceback
from dotenv import load_dotenv

# 1. 环境准备：添加后端路径到 Python 搜索路径
BACKEND_DIR = Path("/Users/huyitao/trae/data-analyse-system/backend")
sys.path.append(str(BACKEND_DIR))

# 加载环境变量 (含百度 API Key)
load_dotenv(BACKEND_DIR / ".env")

async def reproduce_upload_issue():
    print("🚀 [Debug] 开始模拟文件预处理流程...")
    
    # 指向用户提供的测试图片
    test_image_path = Path("/Users/huyitao/trae/data-analyse-system/test_ocr.png")
    
    if not test_image_path.exists():
        print(f"❌ 错误: 找不到测试图片 {test_image_path}")
        return

    from services.document_processor import DocumentProcessor
    from utils.logger import logger

    try:
        print(f"📡 [Debug] 准备调用解析器 (高精度模式: True)...")
        # 模拟前端上传触发的调用
        content = await DocumentProcessor.process_document(
            test_image_path,
            engine="light",
            use_high_precision=True
        )
        
        print("\n✅ [Debug] 解析成功！内容片段预览:")
        print("-" * 30)
        print(content[:500] if content else "内容为空")
        print("-" * 30)
        
    except Exception as e:
        print("\n❌ [Debug] 捕获到解析异常!")
        print("-" * 30)
        traceback.print_exc()
        print("-" * 30)

if __name__ == "__main__":
    asyncio.run(reproduce_upload_issue())
