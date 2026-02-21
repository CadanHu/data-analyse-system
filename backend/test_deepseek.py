"""
测试 DeepSeek API 连接
"""
import asyncio
import httpx
import sys
import os

# 确保能导入 config
sys.path.insert(0, os.path.dirname(__file__))
from config import API_KEY, API_BASE_URL, MODEL_NAME

print(f"API Key: {'✓ 已设置' if API_KEY else '✗ 未设置'}")
print(f"API Base URL: {API_BASE_URL}")
print(f"Model: {MODEL_NAME}")
print()

if not API_KEY:
    print("❌ 错误：请设置 DEEPSEEK_API_KEY 环境变量！")
    print()
    print("你可以通过以下方式设置：")
    print("  1. 在 backend/.env 文件中添加：DEEPSEEK_API_KEY=your-key")
    print("  2. 或者在终端中执行：export DEEPSEEK_API_KEY=your-key")
    sys.exit(1)

async def test_deepseek():
    try:
        print("🚀 正在测试 DeepSeek API 连接...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL_NAME,
                    "messages": [
                        {"role": "user", "content": "你好，请回复'连接成功'"}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 100
                }
            )
            print(f"响应状态码: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ API 连接成功！")
                print(f"模型回复: {result['choices'][0]['message']['content']}")
                return True
            else:
                print(f"❌ API 错误: {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ 连接异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    asyncio.run(test_deepseek())
