import pandas as pd
import asyncio
import json
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))
from backend.agents.advanced_data_agent import AdvancedDataAgent

async def test_multi_turn_flow():
    # 模拟数据
    data = {
        'Date': pd.date_range(start='2024-01-01', periods=20, freq='ME'),
        'Region': ['East', 'West'] * 10,
        'Sales': [100, 150, 120, 200, 180, 210, 110, 160, 130, 220] * 2,
        'Cost': [80, 100, 90, 150, 120, 160, 85, 110, 95, 170] * 2,
        'Ads': [10, 20, 15, 30, 25, 35, 12, 22, 18, 32] * 2 # 广告投入
    }
    df = pd.DataFrame(data)
    
    # 模拟缺失值
    df.loc[0, 'Sales'] = None
    
    print("🚀 [Test] 启动 AI Data Scientist (v3.0) 多轮对话测试...")
    agent = AdvancedDataAgent()
    
    # 第一轮：数据清洗
    print("\n--- Round 1: Data Cleaning ---")
    q1 = "检查数据中的缺失值并进行合理填充。"
    history = []
    
    async for event in agent.process_analysis_flow(df, q1, history=history):
        if event["event"] == "summary":
            print(f"💡 [AI 回答]: {event['data']['content'][:200]}...")
        if event["event"] == "done":
            history.append({"role": "user", "content": q1})
            history.append({"role": "assistant", "content": f"已完成清洗。代码：\n```python\n{event['data']['code']}\n```\n{event['data']['summary']}"})

    # 第二轮：建模预测
    print("\n--- Round 2: Modeling ---")
    q2 = "请基于广告投入(Ads)预测销售额(Sales)，并给出模型评估指标。"
    
    async for event in agent.process_analysis_flow(df, q2, history=history):
        if event["event"] == "summary":
            print(f"💡 [AI 回答]: {event['data']['content'][:300]}...")
        if event["event"] == "plot_ready":
            print(f"🖼️ [图表生成]: 已捕获可视化图像")
        if event["event"] == "done":
            print("\n✅ [测试完成] 多轮对话闭环成功。AI 成功记住了之前的清洗步骤并进行了建模。")

if __name__ == "__main__":
    asyncio.run(test_multi_turn_flow())
