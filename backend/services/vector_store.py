import os
import re
import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from config import DATA_DIR


class SemanticChunkSplitter:
    """
    语义感知切分器：
    - Markdown: 按标题层级切分，chunk metadata 携带 header_path
    - 纯文本: 按段落（双换行）切分
    - 每个 chunk 头部附加上一个 chunk 的末尾 overlap_chars 字，保证跨 chunk 上下文连贯
    """
    _HEADER_RE = re.compile(r"^#{1,6}\s", re.MULTILINE)

    def __init__(self, chunk_size: int = 800, overlap_chars: int = 200):
        self.chunk_size = chunk_size
        self.overlap_chars = overlap_chars

    def _is_markdown(self, text: str) -> bool:
        return bool(self._HEADER_RE.search(text))

    def _split_markdown(self, text: str) -> List[tuple]:
        """按 Markdown 标题层级切分，返回 [(content, header_path), ...]"""
        lines = text.splitlines(keepends=True)
        header_re = re.compile(r"^(#+)\s+(.+)")
        cut_points = [{"line": 0, "path": ""}]
        stack = []
        for i, line in enumerate(lines):
            m = header_re.match(line)
            if m:
                level, title = len(m.group(1)), m.group(2).strip()
                while stack and stack[-1][0] >= level:
                    stack.pop()
                stack.append((level, title))
                cut_points.append({"line": i, "path": " > ".join(t for _, t in stack)})
        cut_points.append({"line": len(lines), "path": None})

        raw = []
        for i in range(len(cut_points) - 1):
            s, e = cut_points[i]["line"], cut_points[i + 1]["line"]
            content = "".join(lines[s:e]).strip()
            if content:
                raw.append((content, cut_points[i]["path"]))
        return raw

    def _split_paragraphs(self, text: str) -> List[tuple]:
        """按段落（双换行）切分纯文本，返回 [(content, ""), ...]"""
        paras = re.split(r"\n{2,}", text.strip())
        return [(p.strip(), "") for p in paras if p.strip()]

    def _merge_small_chunks(self, raw: List[tuple]) -> List[tuple]:
        """合并过短的相邻片段，直到接近 chunk_size"""
        merged, buf_c, buf_p = [], "", ""
        for content, path in raw:
            if len(buf_c) + len(content) < self.chunk_size:
                buf_c = (buf_c + "\n\n" + content).strip()
                buf_p = buf_p or path
            else:
                if buf_c:
                    merged.append((buf_c, buf_p))
                buf_c, buf_p = content, path
        if buf_c:
            merged.append((buf_c, buf_p))
        return merged

    def _extract_tables_and_slide(self, content: str, path: str) -> List[tuple]:
        """抽出表格，把表格原样保留，普通文本超过 chunk_size 则进行滑窗"""
        html_table_re = re.compile(r"<table\b[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL)
        md_table_re = re.compile(r"(?:^[ \t]*\|.*\|[ \t]*$\n?){2,}", re.MULTILINE)

        matches = []
        for m in html_table_re.finditer(content):
            matches.append({"start": m.start(), "end": m.end(), "text": m.group(0)})
        for m in md_table_re.finditer(content):
            start = m.start()
            end = m.end()
            if not any(ext["start"] < end and start < ext["end"] for ext in matches):
                matches.append({"start": start, "end": end, "text": m.group(0)})

        matches.sort(key=lambda x: x["start"])

        blocks = []
        last_end = 0
        for m in matches:
            if m["start"] > last_end:
                blocks.append({"type": "text", "content": content[last_end:m["start"]]})
            blocks.append({"type": "table", "content": m["text"]})
            last_end = m["end"]
        if last_end < len(content):
            blocks.append({"type": "text", "content": content[last_end:]})

        flat = []
        for block in blocks:
            if block["type"] == "table":
                flat.append((block["content"], path))
            else:
                text_part = block["content"].strip()
                if not text_part:
                    continue
                start = 0
                while start < len(text_part):
                    sub = text_part[start:start + self.chunk_size].strip()
                    if len(sub) > 20:
                        flat.append((sub, path))
                    start += self.chunk_size - self.overlap_chars
        return flat

    def split(self, text: str, base_metadata: Dict[str, Any]) -> List[Document]:
        """切分文本，返回带结构元数据和上下文衔接的 Document 列表"""
        # 1. 替换表格为占位符，防止 _split_paragraphs 破坏表格
        tables_store = []
        def repl(m):
            tables_store.append(m.group(0))
            return f"\n\n__TABLE_{len(tables_store)-1}__\n\n"

        html_table_re = re.compile(r"<table\b[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL)
        md_table_re = re.compile(r"(?:^[ \t]*\|.*\|[ \t]*$\n?){2,}", re.MULTILINE)
        temp_text = html_table_re.sub(repl, text)
        temp_text = md_table_re.sub(repl, temp_text)

        # 2. 按 Markdown 标题或段落做初步切分、合并
        raw = self._split_markdown(temp_text) if self._is_markdown(temp_text) else self._split_paragraphs(temp_text)
        merged = self._merge_small_chunks(raw)

        # 3. 还原表格，并对超长文本做带表格保护的滑窗切割
        flat = []
        for content, path in merged:
            for i, tbl in enumerate(tables_store):
                content = content.replace(f"__TABLE_{i}__", tbl)
            
            if len(content) <= self.chunk_size:
                flat.append((content, path))
            else:
                flat.extend(self._extract_tables_and_slide(content, path))

        docs = []
        for i, (content, path) in enumerate(flat):
            # 在当前 chunk 头部附加上一个 chunk 的尾部，保证上下文连贯
            if i > 0:
                prev_tail = flat[i - 1][0][-self.overlap_chars:]
                content = f"[上文衔接]\n{prev_tail}\n\n[正文]\n{content}"

            meta = {**base_metadata, "chunk_index": i, "chunk_total": len(flat)}
            if path:
                meta["header_path"] = path
            docs.append(Document(page_content=content, metadata=meta))
        return docs


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

        self.chunk_splitter = SemanticChunkSplitter(chunk_size=800, overlap_chars=200)
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

    async def add_text(self, text: str, metadata: Dict[str, Any], session_id: str = None, user_id = None, sync_to_mobile: bool = True, skip_split: bool = False):
        """将解析出的文本切片并存入向量库 (带幂等性检查)

        Args:
            sync_to_mobile: 是否立即写入手机同步表。对需要等待后续步骤（如知识图谱抽取）
                            完成后再同步的场景，传 False，由调用方在所有步骤完成后
                            调用 session_db.insert_chunks_for_sync_batch() 批量写入。
            skip_split: 若为 True，则跳过切片过程，直接将整个 text 作为一个文档存入。
        """
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
                    return [] if not sync_to_mobile else True

        if skip_split:
            meta = {**metadata}
            if "chunk_index" not in meta:
                meta["chunk_index"] = 0
            if "chunk_total" not in meta:
                meta["chunk_total"] = 1
            split_docs = [Document(page_content=text, metadata=meta)]
        else:
            split_docs = self.chunk_splitter.split(text, metadata)

        await loop.run_in_executor(None, self.vector_db.add_documents, split_docs)
        print(f"📥 [VectorStore] 已索引 {len(split_docs)} 个片段 (会话: {session_id}, 用户: {user_id})")

        # 同步相同片段到 KnowledgeSyncChunkModel，供手机 pull
        # sync_to_mobile=False 时跳过，由调用方在所有处理步骤完成后统一写入
        if sync_to_mobile and user_id is not None and session_id:
            try:
                from database.session_db import session_db as _session_db
                filename = metadata.get("filename", "unknown")
                uid = int(user_id)
                chunks_data = [
                    {
                        "id": f"srv_{uid}_{filename}_{doc.metadata.get('chunk_index', 0)}",
                        "user_id": uid,
                        "session_id": session_id,
                        "doc_name": filename,
                        "chunk_index": doc.metadata.get("chunk_index", 0),
                        "content": doc.page_content,
                        "metadata": None,
                    }
                    for doc in split_docs
                ]
                await _session_db.insert_chunks_for_sync_batch(chunks_data)
                print(f"📱 [VectorStore] {len(split_docs)} 个片段已写入同步表，手机可 pull")
            except Exception as _e:
                print(f"⚠️ [VectorStore] 同步表写入失败（不影响 RAG）: {_e}")

        return split_docs if not sync_to_mobile else True

    async def search(self, query: str, top_k: int = 4, session_id: str = None, user_id = None) -> List[Dict[str, Any]]:
        """
        执行相似度检索 + 多因子重排，支持按 user_id / session_id 过滤。

        检索策略：
          1. Chroma 初检取 top_k × 2 条候选（多取以留重排余量）
          2. Reranker 按 vec / bm25 / recency / session 四因子加权重排
          3. 返回前 top_k 条，每条附带 scores 字段（调试用）
        """
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)

        filter_dict = self._build_where(session_id=session_id, user_id=user_id)
        fetch_k = top_k * 2  # 多取候选给重排器

        try:
            raw = await loop.run_in_executor(
                None,
                lambda: self.vector_db.similarity_search_with_relevance_scores(
                    query, k=fetch_k, filter=filter_dict
                ),
            )
            candidates = [
                {"content": doc.page_content, "metadata": doc.metadata, "vec_score": float(score)}
                for doc, score in raw
            ]
        except Exception:
            # 部分 Chroma 版本不支持 with_relevance_scores，降级为无 score 模式
            raw_docs = await loop.run_in_executor(
                None,
                lambda: self.vector_db.similarity_search(query, k=fetch_k, filter=filter_dict),
            )
            candidates = [
                {"content": doc.page_content, "metadata": doc.metadata, "vec_score": 1.0}
                for doc in raw_docs
            ]

        if not candidates:
            return []

        from services.reranker import get_reranker
        ranked = get_reranker().rerank(
            query=query,
            candidates=candidates,
            current_session_id=session_id,
        )
        return ranked[:top_k]

    async def list_chunks(
        self,
        session_id: str = None,
        user_id=None,
        limit: int = None,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """返回RAG片段，可按 user_id / session_id 过滤，支持分页"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            where = self._build_where(session_id=session_id, user_id=user_id)

            # 先只取 ID 列表来计算总数（轻量）
            id_results = await loop.run_in_executor(
                None,
                lambda: collection.get(where=where, include=[])
            )
            total = len(id_results.get("ids", []))

            # 再取分页数据
            get_kwargs: Dict[str, Any] = {"where": where, "include": ["documents", "metadatas"]}
            if limit is not None:
                get_kwargs["limit"] = limit
                get_kwargs["offset"] = offset

            results = await loop.run_in_executor(
                None,
                lambda: collection.get(**get_kwargs)
            )
            ids = results.get("ids", [])
            documents = results.get("documents", [])
            metadatas = results.get("metadatas", [])
            chunks = [
                {"id": ids[i], "content": documents[i] if i < len(documents) else "", "metadata": metadatas[i] if i < len(metadatas) else {}}
                for i in range(len(ids))
            ]
            return {"chunks": chunks, "total": total}
        except Exception as e:
            print(f"❌ [VectorStore] list_chunks 失败: {e}")
            return {"chunks": [], "total": 0}

    async def list_doc_names(self, session_id: str = None, user_id=None) -> List[str]:
        """仅返回去重后的文档名列表，只拉 metadatas 不拉 documents，比 list_chunks 轻量"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            where = self._build_where(session_id=session_id, user_id=user_id)
            results = await loop.run_in_executor(
                None,
                lambda: collection.get(where=where, include=["metadatas"])
            )
            metadatas = results.get("metadatas", []) or []
            seen: set = set()
            for m in metadatas:
                if m and m.get("filename"):
                    seen.add(m["filename"])
            return sorted(seen)
        except Exception as e:
            print(f"❌ [VectorStore] list_doc_names 失败: {e}")
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

    async def delete_by_doc(self, filename: str, session_id: str = None) -> int:
        """删除某文档的全部RAG片段，返回删除数量"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.initialize)
        try:
            collection = self.vector_db._collection
            conditions = [{"filename": filename}]
            if session_id:
                conditions.append({"session_id": session_id})
            where = conditions[0] if len(conditions) == 1 else {"$and": conditions}
            results = await loop.run_in_executor(
                None,
                lambda: collection.get(where=where, include=[])
            )
            ids = results.get("ids", [])
            if ids:
                await loop.run_in_executor(None, lambda: collection.delete(ids=ids))
            print(f"🗑️ [VectorStore] 按文档删除: {filename} → {len(ids)} 片段")
            return len(ids)
        except Exception as e:
            print(f"❌ [VectorStore] delete_by_doc 失败: {e}")
            return 0

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
