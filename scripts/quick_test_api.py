import requests
import json
import sys

def test_ds_agent():
    url = "http://localhost:8000/api/chat/stream"
    
    # 模拟登录获取 token (假设使用 demo 账号)
    # 注意：如果您的系统开启了强认证，请先确保获取有效 Token
    # 这里我们演示发送包含 enable_data_science_agent 的请求体
    
    payload = {
        "session_id": "test-ds-session-001",
        "question": "分析订单表中销售额(Sales)的分布情况，并检查是否存在异常高额订单。请给出统计摘要。",
        "enable_data_science_agent": True, # 🚀 开启数据科学家模式
        "model_provider": "deepseek",
        "enable_thinking": True
    }
    
    # 注意：由于 /chat/stream 需要登录，这里假设您在开发环境下暂时关闭了鉴权或使用 mock
    # 如果遇到 401，请在 headers 中加入 Authorization: Bearer <your_token>
    headers = {
        "Content-Type": "application/json"
    }

    print(f"📡 正在请求 AI 数据科学家接口: {url}...")
    
    try:
        with requests.post(url, json=payload, headers=headers, stream=True) as r:
            if r.status_code != 200:
                print(f"❌ 请求失败: {r.status_code} - {r.text}")
                return

            for line in r.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith("data: "):
                        event_data = json.loads(decoded_line[6:])
                        event_type = event_data.get("event")
                        content = event_data.get("data", {}).get("content", "")
                        
                        if event_type == "thinking":
                            print(f"🧠 [AI 思考]: {content}")
                        elif event_type == "summary":
                            sys.stdout.write(content)
                            sys.stdout.flush()
                        elif event_type == "done":
                            print("\n\n✅ 分析完成！")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    # 提示用户先启动后端
    print("💡 请确保后端服务已在 localhost:8000 启动")
    test_ds_agent()
