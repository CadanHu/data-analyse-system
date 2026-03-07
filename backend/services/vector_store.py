import os
import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from config import DATA_DIR

class VectorStore:
    """向量存储服务 (优化单例与延迟加载版)"""
    _instance = None
    _embeddings = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(VectorStore, cls).__new__(cls)
        return cls._instance

    def __init__(self, persist_dir: str = None):
        # 避免重复初始化
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        if persist_dir is None:
            self.persist_dir = str(DATA_DIR / "vector_db")
        else:
            self.persist_dir = persist_dir
            
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100
        )
        self.vector_db: Optional[Chroma] = None
        self._initialized = True

    def _get_embeddings(self):
        """延迟加载嵌入模型，仅在真正需要时加载一次"""
        if VectorStore._embeddings is None:
            try:
                print("⏳ [VectorStore] 正在加载嵌入模型 (仅首次使用执行)...")
                VectorStore._embeddings = HuggingFaceEmbeddings(
                    model_name="sentence-transformers/all-MiniLM-L6-v2",
                    model_kwargs={'device': 'cpu'},
                    encode_kwargs={'normalize_embeddings': True}
                )
                print("✅ [VectorStore] 嵌入模型加载成功")
            except Exception as e:
                print(f"❌ [VectorStore] 嵌入模型加载失败: {str(e)}")
                raise e
        return VectorStore._embeddings

    def initialize(self):
        """初始化向量库"""
        if self.vector_db:
            return
            
        embeddings = self._get_embeddings()
        if not os.path.exists(self.persist_dir):
            os.makedirs(self.persist_dir)
        
        self.vector_db = Chroma(
            persist_directory=self.persist_dir,
            embedding_function=embeddings
        )
        print(f"✅ [VectorStore] 向量库已就绪: {self.persist_dir}")

    async def add_text(self, text: str, metadata: Dict[str, Any], session_id: str = None):
        """将解析出的文本切片并存入向量库"""
        # 强制在执行器中初始化，防止阻塞
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        
        if session_id:
            metadata["session_id"] = session_id
            
        docs = [Document(page_content=text, metadata=metadata)]
        split_docs = self.text_splitter.split_documents(docs)
        
        # Chroma 的 add_documents 通常也是同步的，放入执行器
        await loop.run_in_executor(None, self.vector_db.add_documents, split_docs)
        print(f"📥 [VectorStore] 已索引 {len(split_docs)} 个片段 (会话: {session_id})")
        return True

    async def search(self, query: str, top_k: int = 4, session_id: str = None) -> List[Dict[str, Any]]:
        """执行相似度检索"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        
        filter_dict = {"session_id": session_id} if session_id else None
        
        # 相似度检索
        results = await loop.run_in_executor(
            None, 
            lambda: self.vector_db.similarity_search(query, k=top_k, filter=filter_dict)
        )
        
        return [{"content": doc.page_content, "metadata": doc.metadata} for doc in results]

    def delete_all(self):
        """清空向量库"""
        if self.vector_db:
            self.vector_db.delete_collection()
            self.vector_db = None
            print("🗑️ [VectorStore] 向量库已清空")

# 创建全局唯一的实例
vector_store = VectorStore()
