import asyncio
import os
import sys
from pathlib import Path

# 将 backend 加入路径
sys.path.append(str(Path(__file__).parent.parent))

from services.document_processor import DocumentProcessor
from services.vector_store import VectorStore

async def test_rag_flow():
    print("🚀 [Test] 开始 RAG 全流程测试...")
    
    # 1. 模拟一个临时 TXT 文件
    test_file = Path("test_knowledge.txt")
    with open(test_file, "w", encoding="utf-8") as f:
        f.write("数据分析系统的核心架构包括 FastAPI 后端和 React 前端。它支持 iOS 和 Android。")

    # 2. 解析测试
    print("🔍 [Test] 步骤 1: 文档解析")
    text = DocumentProcessor.process_document(test_file)
    assert "FastAPI" in text
    print("✅ 解析成功")

    # 3. 向量化索引测试
    print("📥 [Test] 步骤 2: 向量化索引")
    vs = VectorStore(persist_dir="backend/data/test_vector_db")
    await vs.add_text(text, metadata={"filename": "test_knowledge.txt"})
    print("✅ 索引成功")

    # 4. 检索测试
    print("🔎 [Test] 步骤 3: 相似度检索")
    results = await vs.search("系统支持哪些移动端平台？")
    assert len(results) > 0
    assert "Android" in results[0]["content"]
    print(f"✅ 检索成功，匹配内容: {results[0]['content'][:50]}...")

    # 5. 清理
    os.remove(test_file)
    print("🎉 [Test] RAG 流程全部通过！")

if __name__ == "__main__":
    asyncio.run(test_rag_flow())
