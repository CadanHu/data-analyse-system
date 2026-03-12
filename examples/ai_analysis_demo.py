import pandas as pd
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from ai_analysis import analyze_dataset

def run_demo():
    print("✨ AI-Assisted Data Analysis Demo")
    
    # 1. Load sample dataset (Creating a mock one for demonstration)
    data = {
        'Product': ['A', 'B', 'A', 'C', 'B', 'A', 'D', 'C'],
        'Sales': [120, 340, 150, 890, 430, 180, 50, 720],
        'Cost': [80, 200, 100, 600, 300, 110, 40, 500],
        'Region': ['North', 'South', 'North', 'East', 'South', 'North', 'West', 'East']
    }
    df = pd.DataFrame(data)
    df['Profit'] = df['Sales'] - df['Cost']
    
    print("📊 Dataset Sample:")
    print(df.head())
    print("\n🤖 Asking AI for insights...")
    
    # 2. Run AI Analysis
    insight = analyze_dataset(df)
    
    print("\n💡 AI Insights:")
    print("-" * 50)
    print(insight)
    print("-" * 50)

if __name__ == "__main__":
    run_demo()
