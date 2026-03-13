import requests
import json
import sys

def get_token():
    login_url = "http://localhost:8000/api/auth/login"
    try:
        r = requests.post(login_url, json={"username": "demo@example.com", "password": "password123"})
        if r.status_code == 200:
            return r.json().get("access_token")
    except:
        pass
    return None

def test_external_data_analysis():
    token = get_token()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # 1. 外部 Agent 的独有数据 (模拟一份市场调研数据)
    my_unique_data = [
        {"Brand": "Our Brand", "MarketShare": 25, "Growth": 15, "CSAT": 4.5},
        {"Brand": "Competitor A", "MarketShare": 30, "Growth": -5, "CSAT": 3.8},
        {"Brand": "Competitor B", "MarketShare": 20, "Growth": 8, "CSAT": 4.2},
        {"Brand": "Competitor C", "MarketShare": 15, "Growth": 2, "CSAT": 4.0},
        {"Brand": "New Entrant", "MarketShare": 10, "Growth": 45, "CSAT": 4.8},
    ]

    # 2. 构造请求
    url = "http://localhost:8000/api/chat/stream"
    payload = {
        "session_id": "external-agent-session-999",
        "question": "基于我提供给你的这份【外部竞品数据】，分析我们的市场地位，找出增长最快的对手，并画一张气泡图展示份额与满意的度的关系。",
        "enable_data_science_agent": True,
        "external_data": my_unique_data, # 🚀 关键：携带外部独有数据
        "model_provider": "deepseek",
        "enable_thinking": True
    }

    print(f"📡 外部 Agent 正在发起“自带数据”分析请求...")
    
    try:
        with requests.post(url, json=payload, headers=headers, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    if decoded.startswith("data: "):
                        event = json.loads(decoded[6:])
                        event_type = event.get("event")
                        data = event.get("data", {})
                        
                        if event_type == "summary":
                            sys.stdout.write(data.get("content", ""))
                            sys.stdout.flush()
                        elif event_type == "plot_ready":
                            print(f"\n🖼️ [数据产出] 成功捕获到了基于外部数据生成的图表！")
                        elif event_type == "done":
                            print("\n\n✅ 外部数据分析闭环完成。")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    test_external_data_analysis()
