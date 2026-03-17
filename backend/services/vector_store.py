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

    def _build_where(self, session_id: str = None, user_id = None) -> Optional[Dict]:
        """构建 Chroma where 过滤条件，支持 user_id 和/或 session_id"""
        conditions = []
        if user_id is not None:
            conditions.append({"user_id": str(user_id)})
        if session_id is not None:
            conditions.append({"session_id": session_id})
        if len(conditions) == 0:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    async def add_text(self, text: str, metadata: Dict[str, Any], session_id: str = None, user_id = None):
        """将解析出的文本切片并存入向量库 (带幂等性检查)"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)

        if session_id:
            metadata["session_id"] = session_id
        if user_id is not None:
            metadata["user_id"] = str(user_id)

        # 幂等检查：先搜一下是否已经存过
        if session_id:
            existing = await self.search(text[:100], top_k=1, session_id=session_id, user_id=user_id)
            for r in existing:
                if r['content'].strip() == text.strip():
                    print(f"⚠️ [VectorStore] 检测到内容完全一致，跳过重复索引: {metadata.get('filename')}")
                    return True

        docs = [Document(page_content=text, metadata=metadata)]
        split_docs = self.text_splitter.split_documents(docs)

        await loop.run_in_executor(None, self.vector_db.add_documents, split_docs)
        print(f"📥 [VectorStore] 已索引 {len(split_docs)} 个片段 (会话: {session_id}, 用户: {user_id})")
        return True

    async def search(self, query: str, top_k: int = 4, session_id: str = None, user_id = None) -> List[Dict[str, Any]]:
        """执行相似度检索，支持按 user_id / session_id 过滤"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)

        filter_dict = self._build_where(session_id=session_id, user_id=user_id)

        results = await loop.run_in_executor(
            None,
            lambda: self.vector_db.similarity_search(query, k=top_k, filter=filter_dict)
        )

        return [{"content": doc.page_content, "metadata": doc.metadata} for doc in results]

    async def list_chunks(self, session_id: str = None, user_id = None) -> List[Dict[str, Any]]:
        """返回RAG片段，可按 user_id / session_id 过滤"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            where = self._build_where(session_id=session_id, user_id=user_id)
            results = await loop.run_in_executor(
                None,
                lambda: collection.get(where=where, include=["documents", "metadatas"])
            )
            ids = results.get("ids", [])
            documents = results.get("documents", [])
            metadatas = results.get("metadatas", [])
            return [
                {"id": ids[i], "content": documents[i] if i < len(documents) else "", "metadata": metadatas[i] if i < len(metadatas) else {}}
                for i in range(len(ids))
            ]
        except Exception as e:
            print(f"❌ [VectorStore] list_chunks 失败: {e}")
            return []

    async def delete_chunk(self, chunk_id: str) -> bool:
        """删除单个RAG片段"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            await loop.run_in_executor(None, lambda: collection.delete(ids=[chunk_id]))
            return True
        except Exception as e:
            print(f"❌ [VectorStore] delete_chunk 失败: {e}")
            return False

    async def deduplicate(self, session_id: Optional[str] = None, user_id = None, similarity_threshold: float = 0.85) -> Dict[str, Any]:
        """对RAG内容去重（基于文本相似度 SequenceMatcher），支持 user_id / session_id 过滤"""
        from difflib import SequenceMatcher
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            where = self._build_where(session_id=session_id, user_id=user_id)
            results = await loop.run_in_executor(
                None,
                lambda: collection.get(where=where, include=["documents", "metadatas"])
            )
            ids = results.get("ids", [])
            documents = results.get("documents", [])
            if len(ids) < 2:
                return {"removed": 0, "remaining": len(ids), "total_before": len(ids)}

            to_delete: set = set()
            for i in range(len(ids)):
                if ids[i] in to_delete:
                    continue
                for j in range(i + 1, len(ids)):
                    if ids[j] in to_delete:
                        continue
                    sim = SequenceMatcher(None, documents[i], documents[j]).ratio()
                    if sim >= similarity_threshold:
                        # 保留较长的片段
                        if len(documents[j]) <= len(documents[i]):
                            to_delete.add(ids[j])
                        else:
                            to_delete.add(ids[i])
                            break

            if to_delete:
                delete_list = list(to_delete)
                await loop.run_in_executor(None, lambda: collection.delete(ids=delete_list))
                print(f"🧹 [VectorStore] 去重完成: 删除 {len(to_delete)} 个重复片段 (会话: {session_id})")

            return {"removed": len(to_delete), "remaining": len(ids) - len(to_delete), "total_before": len(ids)}
        except Exception as e:
            print(f"❌ [VectorStore] deduplicate 失败: {e}")
            raise e

    def delete_all(self):
        """清空向量库"""
        if self.vector_db:
            self.vector_db.delete_collection()
            self.vector_db = None
            print("🗑️ [VectorStore] 向量库已清空")

# 创建全局唯一的实例
vector_store = VectorStore()
