
import os
import httpx
import json
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# 加载环境变量
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / "backend" / ".env")

async def test_baidu_ocr_standard_url():
    api_key = os.getenv("BAIDU_QIANFAN_API_KEY")
    # 🚀 使用您提供的公网 URL
    test_url = "https://designewspaper.wordpress.com/wp-content/uploads/2014/09/simple-table-1.png"
    
    api_endpoint = "https://qianfan.baidubce.com/v2/chat/completions"
    
    # 🚀 严格复刻文档示例 JSON
    payload = {
        "model": "deepseek-ocr",
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
                        "image_url": {
                            "url": test_url
                        }
                    }
                ]
            }
        ]
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    print(f"📡 正在发起请求至: {api_endpoint}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(api_endpoint, headers=headers, json=payload)
            print(f"📊 HTTP 状态码: {response.status_code}")
            
            result = response.json()
            print(f"📡 原始响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
            
            if response.status_code == 200:
                usage = result.get("usage", {})
                p_tokens = usage.get("prompt_tokens", 0)
                print(f"\n📊 [审计结果]")
                print(f"📊 Prompt Tokens: {p_tokens}")
                if p_tokens > 100:
                    print("✅ [成功] 百度终于识别到了图片 URL！")
                else:
                    print("❌ [失败] Token 依然很低，图片依然没被模型看见。")
            
        except Exception as e:
            print(f"❌ 异常: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_baidu_ocr_standard_url())
