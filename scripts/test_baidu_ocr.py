import os
import asyncio
import base64
from pathlib import Path
import httpx
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

async def test_baidu_ocr(image_path: str):
    api_key = os.getenv("BAIDU_QIANFAN_API_KEY")
    if not api_key:
        print("❌ 错误: 未在 backend/.env 中找到 BAIDU_QIANFAN_API_KEY")
        return

    url = "https://qianfan.baidubce.com/v2/chat/completions"
    
    # 读取图片并转为 Base64
    try:
        with open(image_path, "rb") as f:
            base64_image = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"❌ 错误: 无法读取图片 {image_path}: {e}")
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    # 百度 DeepSeek-OCR 专用 Payload
    payload = {
        "model": "deepseek-ocr",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请将这张图片中的文字和表格完整地转换为 Markdown 格式。"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                    }
                ]
            }
        ]
    }

    print(f"📡 正在发送请求至百度 DeepSeek-OCR (文件: {Path(image_path).name})...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                print("\n✅ [百度提取成功] 结果如下:\n")
                print("-" * 50)
                print(content)
                print("-" * 50)
            else:
                print(f"❌ 请求失败: {response.status_code}")
                print(response.text)
        except Exception as e:
            print(f"❌ 发生异常: {e}")

if __name__ == "__main__":
    # 请确保根目录下有一张名为 test_ocr.png 的图片，或修改下方路径
    test_image = "test_ocr.png"
    if not os.path.exists(test_image):
        # 尝试找一张现有的图片测试
        print(f"⚠️ 未找到 {test_image}，请在根目录准备测试图片。")
    else:
        asyncio.run(test_baidu_ocr(test_image))
