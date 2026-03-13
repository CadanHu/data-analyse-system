import requests
import json
import sys

def get_token():
    """尝试登录或获取 token"""
    login_url = "http://localhost:8000/api/auth/login"
    try:
        # UserLogin 模型使用 username 字段接收邮箱
        r = requests.post(login_url, json={"username": "demo@example.com", "password": "password123"})
        if r.status_code == 200:
            return r.json().get("access_token")
        else:
            print(f"❌ Login failed: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"❌ Login error: {e}")
    return None

def test_ds_agent_with_auth():
    token = get_token()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        print(f"🔑 已获取 Token: {token[:10]}...")
    else:
        print("⚠️ 未能登录，尝试匿名请求 (如果接口允许)...")

    url = "http://localhost:8000/api/chat/stream"
    
    # 1. 首先创建一个会话
    try:
        session_res = requests.post(
            "http://localhost:8000/api/sessions", 
            json={"title": "DS Agent Test"},
            headers=headers
        )
        session_id = session_res.json().get("id")
        print(f"📂 创建测试会话: {session_id}")
    except:
        session_id = "test-session-manual"

    payload = {
        "session_id": session_id,
        "question": "分析当前库中主要表的销售趋势，找出异常数据点，并给出专业建议。",
        "enable_data_science_agent": True,
        "model_provider": "deepseek",
        "enable_thinking": True
    }
    
    headers["Content-Type"] = "application/json"

    print(f"📡 正在以数据科学家模式请求接口...")
    
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
                        data = event_data.get("data", {})
                        
                        print(f"\n📡 [Event: {event_type}]")
                        
                        if event_type == "thinking":
                            print(f"🧠 {data.get('content')}")
                        elif event_type == "summary":
                            print(f"💡 {data.get('content')}")
                        elif event_type == "plot_ready":
                            print(f"🖼️ [Image Received]")
                        elif event_type == "chart_ready":
                            print(f"📊 [Chart Data Received]")
                        elif event_type == "error":
                            print(f"❌ 发生错误: {data.get('message')}")
                        elif event_type == "done":
                            print("\n✅ 分析完成！")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    test_ds_agent_with_auth()
