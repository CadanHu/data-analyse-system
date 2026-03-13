import pandas as pd
import asyncio
import json
from backend.agents.advanced_data_agent import AdvancedDataAgent

async def test_agent_flow():
    # 1. 模拟一个包含趋势、离群值和分类的数据集
    data = {
        'Date': pd.date_range(start='2024-01-01', periods=12, freq='ME'),
        'Region': ['East', 'West', 'East', 'South', 'West', 'North'] * 2,
        'Sales': [100, 150, 120, 2500, 180, 200, 110, 160, 130, 2800, 190, 210], # 2500 & 2800 are anomalies
        'Cost': [80, 100, 90, 500, 120, 150, 85, 110, 95, 600, 130, 160]
    }
    df = pd.DataFrame(data)
    
    print("🚀 [Test] 启动 AI Data Agent 全链路测试...")
    agent = AdvancedDataAgent()
    
    question = "分析各地区的销售表现，找出异常点，并给出一个包含销售额趋势的可视化建议。"
    
    async for event in agent.process_analysis_flow(df, question):
        event_type = event.get("event")
        data = event.get("data", {})
        
        if event_type == "thinking":
            print(f"🧠 [AI 思考]: {data.get('content')}")
        elif event_type == "chart_ready":
            print(f"📊 [可视化生成]: {json.dumps(data.get('option'), ensure_ascii=False)[:100]}...")
        elif event_type == "summary":
            print(f"💡 [洞察报告]:\n{data.get('content')}")
        elif event_type == "error":
            print(f"❌ [错误]: {data.get('message')}")
        elif event_type == "done":
            print("\n✅ [测试完成] 全链路闭环成功。")

if __name__ == "__main__":
    asyncio.run(test_agent_flow())
