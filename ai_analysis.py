import pandas as pd
from backend.services.llm_factory import llm_factory
from backend.config import ModelProvider

def analyze_dataset(df: pd.DataFrame, provider: str = ModelProvider.DEEPSEEK):
    """
    AI-assisted data analysis tool:
    Analyze the dataset summary and provide insights using LLM.
    """
    # 1. Generate statistical summary
    summary = df.describe(include='all').to_string()
    info_buf = pd.io.common.StringIO()
    df.info(buf=info_buf)
    df_info = info_buf.getvalue()

    # 2. Prepare the prompt
    prompt = f"""
    You are a professional data scientist. Analyze the following dataset summary and provide deep insights:

    [Dataset Info]
    {df_info}

    [Statistical Summary]
    {summary}

    Please provide:
    - Key trends and patterns
    - Potential anomalies or data quality issues
    - Strategic recommendations based on the data
    
    Format the output in clear Markdown.
    """

    # 3. Call AI via LLMFactory (Using synchronous-like wrapper for simplicity in CLI tools)
    import asyncio
    
    async def _get_ai_insight():
        llm = llm_factory.get_langchain_model(provider=provider, temperature=0.2)
        response = await llm.ainvoke(prompt)
        return response.content

    try:
        # Run the async call in a synchronous context for tool-like usage
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If we are in an environment with a running loop (like FastAPI)
            import nest_asyncio
            nest_asyncio.apply()
        
        return asyncio.run(_get_ai_insight())
    except Exception as e:
        return f"Error during AI analysis: {str(e)}"

if __name__ == "__main__":
    # Quick test with dummy data
    data = {
        'Sales': [100, 150, 200, 250, 300, 1000], # 1000 is an anomaly
        'Region': ['East', 'West', 'East', 'West', 'East', 'West'],
        'Date': pd.date_range(start='2024-01-01', periods=6)
    }
    test_df = pd.DataFrame(data)
    print("🚀 Running AI Analysis Demo...")
    print(analyze_dataset(test_df))
