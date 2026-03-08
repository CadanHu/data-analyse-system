
import os
import sys
from pathlib import Path

# 加入项目根目录到 sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from services.vector_store import VectorStore
import asyncio

async def main():
    vs = VectorStore()
    print("🔍 [DEBUG] 正在初始化向量库并检索内容...")
    
    # 我们搜索关键词“港岛区”看看能否命中
    query = "港岛区"
    results = await vs.search(query, top_k=10)
    
    print(f"\n✅ [DEBUG] 搜索关键词: '{query}'")
    print(f"📊 [DEBUG] 找到结果数量: {len(results)}")
    
    if not results:
        print("❌ [DEBUG] 警告：向量库中没有发现任何与 '港岛区' 相关的内容！数据可能未成功索引。")
    
    for i, r in enumerate(results):
        print(f"\n--- 片段 {i+1} (来源: {r['metadata'].get('filename', '未知')}) ---")
        print(f"内容内容预览: {r['content'][:300]}...")
        print(f"元数据: {r['metadata']}")

if __name__ == "__main__":
    asyncio.run(main())
