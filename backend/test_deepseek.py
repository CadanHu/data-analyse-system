"""
DeepSeek API 完整测试脚本
覆盖所有测试用例
"""

import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
BASE_URL = "https://api.deepseek.com/v1"
MODEL = "deepseek-chat"

TEST_MESSAGE = "用一句话介绍一下什么是人工智能"

def print_separator(title=""):
    """打印分隔线"""
    print("\n" + "="*80)
    if title:
        print(f"  {title}")
        print("="*80)

async def test_case_1():
    """Case 1：非流式调用 × 普通模式"""
    print_separator("Case 1：非流式调用 × 普通模式")
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": TEST_MESSAGE}],
                    "stream": False
                }
            )
            response.raise_for_status()
            result = response.json()
        
        print("\n📋 完整 Response 对象:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {e}")

async def test_case_2():
    """Case 2：流式调用 × 普通模式"""
    print_separator("Case 2：流式调用 × 普通模式")
    
    try:
        chunk_count = 0
        full_content = ""
        
        print("\n📊 开始接收流式响应...")
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": TEST_MESSAGE}],
                    "stream": True
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            chunk_count += 1
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                if delta.get("content"):
                                    full_content += delta["content"]
                                    print(delta["content"], end="", flush=True)
                        except json.JSONDecodeError:
                            pass
        
        print(f"\n\n📊 Chunk 总数: {chunk_count}")
        print(f"📋 完整内容: {full_content}")
        
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {e}")

async def test_case_3():
    """Case 3：流式调用 × 思考模式（核心用例）"""
    print_separator("Case 3：流式调用 × 思考模式（核心用例）")
    
    try:
        reasoning_chunk_count = 0
        content_chunk_count = 0
        full_reasoning = ""
        full_content = ""
        phase = "thinking"
        
        print("\n🧠 开始接收思考模式响应...")
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": TEST_MESSAGE}],
                    "stream": True,
                    "thinking": {"type": "enabled"}
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                
                                if delta.get("reasoning_content"):
                                    reasoning_chunk_count += 1
                                    full_reasoning += delta["reasoning_content"]
                                    if phase == "thinking":
                                        print("💭", end="", flush=True)
                                
                                if delta.get("content"):
                                    content_chunk_count += 1
                                    full_content += delta["content"]
                                    if phase == "thinking":
                                        phase = "answering"
                                        print("\n💬", end="", flush=True)
                                    print(delta["content"], end="", flush=True)
                        except json.JSONDecodeError:
                            pass
        
        print(f"\n\n📊 统计:")
        print(f"   - Reasoning chunk 数: {reasoning_chunk_count}")
        print(f"   - Content chunk 数: {content_chunk_count}")
        print(f"\n🧠 完整思考内容:\n{full_reasoning}")
        print(f"\n💬 完整回答内容:\n{full_content}")
        
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {e}")

async def test_case_4():
    """Case 4：多轮对话 × 思考模式"""
    print_separator("Case 4：多轮对话 × 思考模式")
    
    try:
        question1 = "介绍一下什么是人工智能"
        question2 = "它有什么应用场景？"
        
        print(f"\n🗣️ 第一轮问题: {question1}")
        
        answer1 = ""
        reasoning1 = ""
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": question1}],
                    "stream": True,
                    "thinking": {"type": "enabled"}
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                if delta.get("reasoning_content"):
                                    reasoning1 += delta["reasoning_content"]
                                if delta.get("content"):
                                    answer1 += delta["content"]
                        except json.JSONDecodeError:
                            pass
        
        print(f"✅ 第一轮回答: {answer1[:100]}...")
        
        print(f"\n🗣️ 第二轮问题: {question2}")
        
        messages_x = [
            {"role": "user", "content": question1},
            {"role": "assistant", "content": answer1},
            {"role": "user", "content": question2}
        ]
        
        answer_x = ""
        print("\n📝 方式 X（只追加 content）:")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": messages_x,
                    "stream": True,
                    "thinking": {"type": "enabled"}
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                if delta.get("content"):
                                    answer_x += delta["content"]
                                    print(delta["content"], end="", flush=True)
                        except json.JSONDecodeError:
                            pass
        
        print("\n\n" + "-"*80)
        
        combined_content = f"思考：{reasoning1}\n\n回答：{answer1}"
        messages_y = [
            {"role": "user", "content": question1},
            {"role": "assistant", "content": combined_content},
            {"role": "user", "content": question2}
        ]
        
        answer_y = ""
        print("\n📝 方式 Y（追加 reasoning + content）:")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": messages_y,
                    "stream": True,
                    "thinking": {"type": "enabled"}
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                if delta.get("content"):
                                    answer_y += delta["content"]
                                    print(delta["content"], end="", flush=True)
                        except json.JSONDecodeError:
                            pass
        
        print(f"\n\n📊 对比结果:")
        print(f"   方式 X 回答长度: {len(answer_x)}")
        print(f"   方式 Y 回答长度: {len(answer_y)}")
        print(f"   回答是否相同: {answer_x[:50] == answer_y[:50]}...")
        
    except Exception as e:
        print(f"\n❌ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

async def test_case_5():
    """Case 5：异常场景测试"""
    print_separator("Case 5：异常场景测试")
    
    print("\n🔴 测试 1: 无效 API Key")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": "Bearer invalid-key-12345",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": "hi"}],
                    "stream": False
                }
            )
            print(f"   状态码: {response.status_code}")
            print(f"   响应: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")
    except Exception as e:
        print(f"   错误类型: {type(e).__name__}")
        print(f"   错误信息: {e}")
    
    print("\n🔴 测试 2: 空 messages 列表")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [],
                    "stream": False
                }
            )
            print(f"   状态码: {response.status_code}")
            print(f"   响应: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")
    except Exception as e:
        print(f"   错误类型: {type(e).__name__}")
        print(f"   错误信息: {e}")
    
    print("\n🔴 测试 3: max_tokens=1")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": TEST_MESSAGE}],
                    "stream": False,
                    "max_tokens": 1
                }
            )
            print(f"   状态码: {response.status_code}")
            print(f"   响应: {json.dumps(response.json(), ensure_ascii=False, indent=2)[:300]}...")
    except Exception as e:
        print(f"   错误类型: {type(e).__name__}")
        print(f"   错误信息: {e}")

async def main():
    """主函数：按顺序执行所有测试"""
    print("\n" + "="*80)
    print("  DeepSeek API 完整测试套件")
    print("="*80)
    
    if not API_KEY:
        print("\n⚠️  警告：DEEPSEEK_API_KEY 环境变量未设置！")
        print("   请设置环境变量后再运行测试。")
        return
    
    print(f"\n🔑 API Key 已配置: {API_KEY[:10]}...")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"🤖 Model: {MODEL}")
    
    await test_case_1()
    await test_case_2()
    await test_case_3()
    await test_case_4()
    await test_case_5()
    
    print_separator("测试完成！")
    print("\n✅ 所有测试用例已执行完毕。")
    print("📝 请根据测试结果生成 deepseek_api_spec.md 文档。")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
