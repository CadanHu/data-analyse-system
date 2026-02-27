import os
from typing import List, Dict, Any, Optional
from pathlib import Path
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

class VectorStore:
    """向量存储服务：负责文档索引与检索"""

    def __init__(self, persist_dir: str = "backend/data/vector_db"):
        self.persist_dir = persist_dir
        # 配置 HuggingFace 镜像，防止连接超时导致启动阻塞
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        
        try:
            print("⏳ [VectorStore] 正在加载嵌入模型...")
            self.embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2",
                model_kwargs={'device': 'cpu'}
            )
            print("✅ [VectorStore] 嵌入模型加载成功")
        except Exception as e:
            print(f"⚠️ [VectorStore] 嵌入模型加载失败 (将影响 RAG 功能): {str(e)}")
            self.embeddings = None

        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100
        )
        self.vector_db: Optional[Chroma] = None

    def initialize(self):
        """初始化或加载现有的向量库"""
        if not self.embeddings:
            print("❌ [VectorStore] 无法初始化向量库：嵌入模型未就绪")
            return

        if not os.path.exists(self.persist_dir):
            os.makedirs(self.persist_dir)
        
        self.vector_db = Chroma(
            persist_directory=self.persist_dir,
            embedding_function=self.embeddings
        )
        print(f"✅ [VectorStore] 向量库已就绪: {self.persist_dir}")

    async def add_text(self, text: str, metadata: Dict[str, Any]):
        """将解析出的文本切片并存入向量库"""
        if not self.vector_db:
            self.initialize()
        
        docs = [Document(page_content=text, metadata=metadata)]
        split_docs = self.text_splitter.split_documents(docs)
        
        self.vector_db.add_documents(split_docs)
        print(f"📥 [VectorStore] 已索引 {len(split_docs)} 个片段，来自文件: {metadata.get('filename')}")
        return True

    async def search(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        """执行相似度检索"""
        if not self.vector_db:
            self.initialize()
        
        results = self.vector_db.similarity_search(query, k=top_k)
        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata
            } for doc in results
        ]

    def delete_all(self):
        """清空向量库（用于测试或重置）"""
        if self.vector_db:
            self.vector_db.delete_collection()
            self.initialize()
