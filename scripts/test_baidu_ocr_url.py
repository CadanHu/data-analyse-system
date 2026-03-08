
import os
import httpx
import json
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# 加载环境变量
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / "backend" / ".env")

async def test_ocr_with_url():
    api_key = os.getenv("BAIDU_QIANFAN_API_KEY")
    if not api_key:
        print("❌ 错误: 未在 backend/.env 中找到 BAIDU_QIANFAN_API_KEY")
        return

    api_url = "https://qianfan.baidubce.com/v2/chat/completions"
    image_url = "https://designewspaper.wordpress.com/wp-content/uploads/2014/09/simple-table-1.png"
    
    print(f"📡 正在测试公网 URL: {image_url}")
    
    payload = {
        "model": "deepseek-ocr",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请将图片中的表格完整地转换为 Markdown。直接输出结果，不要解释。"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url
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
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(api_url, headers=headers, json=payload)
            result = response.json()
            
            print("\n✅ [API 响应结果] -----------------------------")
            print(f"📊 HTTP 状态码: {response.status_code}")
            
            if response.status_code == 200:
                usage = result.get("usage", {})
                print(f"📊 提示词 Token (Prompt): {usage.get('prompt_tokens')}")
                print(f"📊 回答 Token (Completion): {usage.get('completion_tokens')}")
                
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                print(f"\n📄 解析内容:\n{content}")
            else:
                print(f"❌ 错误响应: {json.dumps(result, ensure_ascii=False)}")
            print("----------------------------------------------")
            
        except Exception as e:
            print(f"❌ 发生异常: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_ocr_with_url())
