"""
知识图谱数据模型 (PostgreSQL 专用，支持 JSONB)
"""
import os
import uuid
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, text, Index
from sqlalchemy.dialects.postgresql import JSONB  # PostgreSQL 特有的 JSONB 类型
from sqlalchemy.future import select
from sqlalchemy import func

# 从环境变量获取配置
PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
PG_PORT = int(os.getenv("POSTGRES_PORT", 5432))
PG_USER = os.getenv("POSTGRES_USER", "postgres")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "postgres")
PG_DB = os.getenv("POSTGRES_DB", "knowledge_base")

Base = declarative_base()

class KnowledgeEntityModel(Base):
    """知识实体表"""
    __tablename__ = 'knowledge_entities'

    id = Column(String(64), primary_key=True)
    doc_id = Column(String(255), nullable=True, index=True) # 来源文档 ID 或文件名
    user_id = Column(Integer, nullable=True, index=True)   # 所属用户
    entity_class = Column(String(100), index=True)        # 实体类别 (Person, Org, etc.)
    entity_text = Column(Text, nullable=False, index=True) # 实体名称/文本
    attributes = Column(JSONB, default={})                 # 动态属性
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_entity_text_class', 'entity_text', 'entity_class'),
    )

class KnowledgeRelationshipModel(Base):
    """知识关系表"""
    __tablename__ = 'knowledge_relationships'

    id = Column(String(64), primary_key=True)
    doc_id = Column(String(255), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)   # 所属用户
    source_text = Column(Text, nullable=False, index=True) # 起始实体
    target_text = Column(Text, nullable=False, index=True) # 目标实体
    relation_type = Column(String(100), index=True)       # 关系类型
    attributes = Column(JSONB, default={})                # 关系属性
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_rel_src_target', 'source_text', 'target_text'),
    )

class KnowledgeCommunityModel(Base):
    """知识图谱社区表（Louvain 检测结果）"""
    __tablename__ = 'knowledge_communities'

    id = Column(String(64), primary_key=True)
    doc_id = Column(String(255), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    community_id = Column(Integer, nullable=False)      # Louvain 分配的社区编号
    title = Column(Text, nullable=True)                 # LLM 生成的社区标题
    summary = Column(Text, nullable=True)               # LLM 生成的社区摘要
    entity_texts = Column(JSONB, default=[])            # 社区内实体名列表
    size = Column(Integer, default=0)                   # 社区实体数量
    level = Column(Integer, default=0, index=True)      # 0=精细, 1=中层, 2=粗粒度
    key_findings = Column(JSONB, default=[])            # 关键发现
    impact_score = Column(Integer, default=0)           # 影响分数
    central_entities = Column(JSONB, default=[])        # 核心实体
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_community_doc_user', 'doc_id', 'user_id'),
        Index('idx_community_level', 'user_id', 'level'),
    )


class KGFailedChunkModel(Base):
    """知识图谱抽取失败的文本块，供后续补跑"""
    __tablename__ = 'kg_failed_chunks'

    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    filename = Column(Text, nullable=False)
    chunk_idx = Column(Integer, nullable=False)   # 块在原文中的序号（0-based）
    total_chunks = Column(Integer, nullable=False) # 原文总块数
    chunk_text = Column(Text, nullable=False)
    status = Column(String(20), default='pending', index=True)  # pending / done
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_failed_chunk_user_file', 'user_id', 'filename'),
    )


class KnowledgeDatabase:
    """PostgreSQL 知识库管理器"""

    def __init__(self):
        # 使用 asyncpg 驱动连接 PostgreSQL
        self.url = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{PG_DB}"
        self.engine = create_async_engine(
            self.url,
            echo=False,
            pool_size=20,
            max_overflow=40,
            pool_timeout=60,
            pool_pre_ping=True
        )
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def init_db(self):
        """初始化表结构，并确保 user_id 列存在（兼容旧表）"""
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # 对旧表做兼容性迁移：ADD COLUMN IF NOT EXISTS 是 PostgreSQL 原生语法
                await conn.execute(text(
                    "ALTER TABLE knowledge_entities ADD COLUMN IF NOT EXISTS user_id INTEGER"
                ))
                await conn.execute(text(
                    "ALTER TABLE knowledge_relationships ADD COLUMN IF NOT EXISTS user_id INTEGER"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_entity_user_id ON knowledge_entities(user_id)"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_rel_user_id ON knowledge_relationships(user_id)"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_community_doc_user ON knowledge_communities(doc_id, user_id)"
                ))
                # 迁移：为 knowledge_communities 增加新字段
                await conn.execute(text(
                    "ALTER TABLE knowledge_communities ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0"
                ))
                await conn.execute(text(
                    "ALTER TABLE knowledge_communities ADD COLUMN IF NOT EXISTS key_findings JSONB DEFAULT '[]'::jsonb"
                ))
                await conn.execute(text(
                    "ALTER TABLE knowledge_communities ADD COLUMN IF NOT EXISTS impact_score INTEGER DEFAULT 0"
                ))
                await conn.execute(text(
                    "ALTER TABLE knowledge_communities ADD COLUMN IF NOT EXISTS central_entities JSONB DEFAULT '[]'::jsonb"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_community_level ON knowledge_communities(user_id, level)"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_community_entity_texts ON knowledge_communities USING GIN (entity_texts)"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_failed_chunk_user_file ON kg_failed_chunks(user_id, filename)"
                ))
            print(f"✅ PostgreSQL 知识库初始化完成: {PG_DB}")
        except Exception as e:
            print(f"❌ PostgreSQL 初始化失败 (请检查数据库 {PG_DB} 是否已创建): {str(e)}")

    async def save_knowledge(self, doc_id: str, knowledge: List[Dict[str, Any]], user_id: int = None):
        """保存抽取的知识点 (带去重逻辑与强制提交)"""
        if not knowledge:
            print("⚠️ [PostgreSQL] 收到空知识点列表，跳过保存")
            return

        async with self.async_session() as session:
            count_added = 0
            try:
                print(f"📡 [PostgreSQL] 准备保存 {len(knowledge)} 条知识点，来源: {doc_id}")
                for item in knowledge:
                    k_class = item.get("class")
                    k_text = item.get("text")
                    k_attrs = item.get("attributes", {})

                    if not k_class or not k_text:
                        continue

                    if k_class == "relationship":
                        # 关系去重
                        src = k_attrs.get("source", "")
                        tgt = k_attrs.get("target", "")
                        r_type = k_attrs.get("type", "unknown")

                        stmt = select(KnowledgeRelationshipModel).where(
                            KnowledgeRelationshipModel.doc_id == doc_id,
                            KnowledgeRelationshipModel.source_text == src,
                            KnowledgeRelationshipModel.target_text == tgt,
                            KnowledgeRelationshipModel.relation_type == r_type
                        )
                        result = await session.execute(stmt)
                        if not result.scalar_one_or_none():
                            new_rel = KnowledgeRelationshipModel(
                                id=str(uuid.uuid4()),
                                doc_id=doc_id,
                                user_id=user_id,
                                source_text=src,
                                target_text=tgt,
                                relation_type=r_type,
                                attributes=k_attrs,
                                created_at=datetime.utcnow()
                            )
                            session.add(new_rel)
                            count_added += 1
                    else:
                        # 实体去重
                        stmt = select(KnowledgeEntityModel).where(
                            KnowledgeEntityModel.doc_id == doc_id,
                            KnowledgeEntityModel.entity_text == k_text,
                            KnowledgeEntityModel.entity_class == k_class
                        )
                        result = await session.execute(stmt)
                        if not result.scalar_one_or_none():
                            new_entity = KnowledgeEntityModel(
                                id=str(uuid.uuid4()),
                                doc_id=doc_id,
                                user_id=user_id,
                                entity_class=k_class,
                                entity_text=k_text,
                                attributes=k_attrs,
                                created_at=datetime.utcnow()
                            )
                            session.add(new_entity)
                            count_added += 1

                await session.commit()
                print(f"✅ [PostgreSQL] 成功入库 {count_added} 条记录 (跳过重复项)")
            except Exception as e:
                await session.rollback()
                print(f"❌ [PostgreSQL] 保存失败: {str(e)}")

    # ──────────────────────────────────────────────────────────────
    # 图谱检索方法（GraphRAG 使用）
    # ──────────────────────────────────────────────────────────────

    async def find_entities(
        self, texts: List[str], user_id: int, fuzzy: bool = True
    ) -> List[Dict]:
        """
        按实体名精确匹配；若精确未命中则做 LIKE 模糊匹配。
        返回: [{"id", "text", "type", "description"}, ...]
        """
        if not texts:
            return []
        results: List[Dict] = []
        seen_ids: set = set()

        async with self.async_session() as session:
            for raw_text in texts[:10]:  # 最多处理 10 个输入实体
                raw_text = raw_text.strip()
                if not raw_text:
                    continue

                # 精确匹配
                stmt = select(KnowledgeEntityModel).where(
                    KnowledgeEntityModel.user_id == user_id,
                    KnowledgeEntityModel.entity_text == raw_text
                ).limit(5)
                rows = (await session.execute(stmt)).scalars().all()

                # 精确未命中时，模糊匹配
                if not rows and fuzzy:
                    stmt = select(KnowledgeEntityModel).where(
                        KnowledgeEntityModel.user_id == user_id,
                        KnowledgeEntityModel.entity_text.ilike(f"%{raw_text}%")
                    ).limit(5)
                    rows = (await session.execute(stmt)).scalars().all()

                for r in rows:
                    if r.id not in seen_ids:
                        seen_ids.add(r.id)
                        results.append({
                            "id": r.id,
                            "text": r.entity_text,
                            "type": r.entity_class,
                            "description": (r.attributes or {}).get("description", ""),
                        })

        return results

    async def find_relations_for_entities(
        self, entity_texts: List[str], user_id: int
    ) -> List[Dict]:
        """
        查询 source 或 target 命中给定实体名的所有关系。
        返回: [{"source", "relation", "target"}, ...]
        """
        if not entity_texts:
            return []
        results: List[Dict] = []
        seen_keys: set = set()

        async with self.async_session() as session:
            for et in entity_texts[:20]:
                et = et.strip()
                if not et:
                    continue
                stmt = select(KnowledgeRelationshipModel).where(
                    KnowledgeRelationshipModel.user_id == user_id,
                    (
                        (KnowledgeRelationshipModel.source_text == et) |
                        (KnowledgeRelationshipModel.target_text == et)
                    )
                ).limit(20)
                rows = (await session.execute(stmt)).scalars().all()
                for r in rows:
                    key = (r.source_text, r.relation_type, r.target_text)
                    if key not in seen_keys:
                        seen_keys.add(key)
                        results.append({
                            "source": r.source_text,
                            "relation": r.relation_type,
                            "target": r.target_text,
                        })

        return results

    async def multi_hop_traverse(
        self, start_texts: List[str], user_id: int, hops: int = 2
    ) -> Dict[str, Any]:
        """
        从起始实体出发，BFS 多跳遍历关系图。
        返回: {"entities": [str, ...], "relations": [{"source","relation","target"}, ...]}
        限制：每跳最多扩展 30 条关系，总关系上限 80 条，防止 context 爆炸。
        frontier 按 PageRank 降序排列，优先展开高重要性节点。
        """
        # 预取 PageRank 分值（一次 DB 查询，用于 frontier 排序）
        pagerank: Dict[str, float] = {}
        try:
            pagerank = await self.get_entity_pagerank(user_id)
            if pagerank:
                logger.info(f"[KnowledgeDB] PageRank 已加载: {len(pagerank)} 个实体的分值")
        except Exception:
            pass  # PageRank 不可用时退化为原始 BFS

        visited: set = set(t.strip() for t in start_texts if t.strip())
        frontier: List[str] = list(visited)
        all_relations: List[Dict] = []
        seen_rel_keys: set = set()

        logger.info(
            f"[KnowledgeDB] BFS 遍历开始: 起始实体={list(visited)}, "
            f"最大跳数={hops}, PageRank={'已启用' if pagerank else '不可用'}"
        )

        for hop in range(hops):
            if not frontier or len(all_relations) >= 80:
                break
            logger.info(f"[KnowledgeDB] 第 {hop+1}/{hops} 跳: 展开 {len(frontier)} 个节点 {frontier[:5]}")
            rels = await self.find_relations_for_entities(frontier, user_id)
            new_entities: set = set()
            for rel in rels:
                key = (rel["source"], rel["relation"], rel["target"])
                if key in seen_rel_keys:
                    continue
                seen_rel_keys.add(key)
                all_relations.append(rel)
                for side in (rel["source"], rel["target"]):
                    if side not in visited:
                        visited.add(side)
                        new_entities.add(side)
            # 按 PageRank 降序，优先展开重要节点，最多取前 20 个
            frontier = sorted(
                new_entities,
                key=lambda t: pagerank.get(t, 0.0),
                reverse=True,
            )[:20]
            logger.info(
                f"[KnowledgeDB] 第 {hop+1} 跳结果: 新发现实体 {len(new_entities)} 个, "
                f"累计关系 {len(all_relations)} 条, 下一跳 frontier={len(frontier)} 个"
            )

        logger.info(
            f"[KnowledgeDB] ✔ BFS 遍历完成: 共访问 {len(visited)} 个实体, "
            f"找到 {len(all_relations)} 条关系"
        )
        return {
            "entities": list(visited),
            "relations": all_relations[:80],
        }

    async def delete_by_doc(self, doc_id: str, user_id: int = None):
        """删除指定文档的知识图谱数据（实体+关系）"""
        async with self.async_session() as session:
            try:
                if user_id is not None:
                    await session.execute(
                        text("DELETE FROM knowledge_entities WHERE doc_id = :doc_id AND user_id = :uid"),
                        {"doc_id": doc_id, "uid": user_id}
                    )
                    await session.execute(
                        text("DELETE FROM knowledge_relationships WHERE doc_id = :doc_id AND user_id = :uid"),
                        {"doc_id": doc_id, "uid": user_id}
                    )
                else:
                    await session.execute(
                        text("DELETE FROM knowledge_entities WHERE doc_id = :doc_id"),
                        {"doc_id": doc_id}
                    )
                    await session.execute(
                        text("DELETE FROM knowledge_relationships WHERE doc_id = :doc_id"),
                        {"doc_id": doc_id}
                    )
                await session.commit()
                print(f"🗑️ [KnowledgeDB] 已删除文档 {doc_id} 的知识图谱数据")
            except Exception as e:
                await session.rollback()
                print(f"❌ delete_by_doc 失败: {e}")

    async def delete_all(self):
        """清空所有知识点数据"""
        async with self.async_session() as session:
            try:
                await session.execute(text("TRUNCATE TABLE knowledge_entities CASCADE"))
                await session.execute(text("TRUNCATE TABLE knowledge_relationships CASCADE"))
                await session.commit()
                print("✅ 已成功清空 PostgreSQL 中的所有知识点数据")
            except Exception as e:
                await session.rollback()
                print(f"❌ 清空 PostgreSQL 数据失败: {str(e)}")

    # ──────────────────────────────────────────────────────────────
    # 完整图谱管理 API
    # ──────────────────────────────────────────────────────────────

    async def get_full_graph(
        self, user_id: int, doc_id: Optional[str] = None, limit: int = 1000
    ) -> Dict[str, Any]:
        """获取用户的完整知识图谱（实体 + 关系），可按文档过滤"""
        async with self.async_session() as session:
            # 实体查询
            entity_stmt = select(KnowledgeEntityModel).where(
                KnowledgeEntityModel.user_id == user_id
            )
            if doc_id:
                entity_stmt = entity_stmt.where(KnowledgeEntityModel.doc_id == doc_id)
            entity_stmt = entity_stmt.limit(limit)
            entities = (await session.execute(entity_stmt)).scalars().all()

            # 关系查询
            rel_stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.user_id == user_id
            )
            if doc_id:
                rel_stmt = rel_stmt.where(KnowledgeRelationshipModel.doc_id == doc_id)
            rel_stmt = rel_stmt.limit(limit)
            relations = (await session.execute(rel_stmt)).scalars().all()

        return {
            "entities": [
                {
                    "id": e.id,
                    "text": e.entity_text,
                    "type": e.entity_class,
                    "doc_id": e.doc_id,
                    "description": (e.attributes or {}).get("description", ""),
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in entities
            ],
            "relations": [
                {
                    "id": r.id,
                    "source": r.source_text,
                    "target": r.target_text,
                    "label": r.relation_type,
                    "doc_id": r.doc_id,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in relations
            ],
        }

    async def search_graph(
        self, query: str, user_id: int, limit: int = 20,
        entity_class: Optional[str] = None, doc_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """全文搜索实体名和关系类型，支持按类型和文档过滤"""
        q = query.strip()
        if not q:
            return {"entities": [], "relations": []}
        async with self.async_session() as session:
            entity_stmt = select(KnowledgeEntityModel).where(
                KnowledgeEntityModel.user_id == user_id,
                KnowledgeEntityModel.entity_text.ilike(f"%{q}%")
            )
            if entity_class:
                entity_stmt = entity_stmt.where(
                    KnowledgeEntityModel.entity_class.ilike(entity_class)
                )
            if doc_id:
                entity_stmt = entity_stmt.where(KnowledgeEntityModel.doc_id == doc_id)
            entity_stmt = entity_stmt.limit(limit)
            entities = (await session.execute(entity_stmt)).scalars().all()

            rel_stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.user_id == user_id,
                (
                    KnowledgeRelationshipModel.source_text.ilike(f"%{q}%") |
                    KnowledgeRelationshipModel.target_text.ilike(f"%{q}%") |
                    KnowledgeRelationshipModel.relation_type.ilike(f"%{q}%")
                )
            )
            if doc_id:
                rel_stmt = rel_stmt.where(KnowledgeRelationshipModel.doc_id == doc_id)
            rel_stmt = rel_stmt.limit(limit)
            relations = (await session.execute(rel_stmt)).scalars().all()

        return {
            "entities": [
                {"id": e.id, "text": e.entity_text, "type": e.entity_class,
                 "doc_id": e.doc_id, "description": (e.attributes or {}).get("description", "")}
                for e in entities
            ],
            "relations": [
                {"id": r.id, "source": r.source_text, "target": r.target_text,
                 "label": r.relation_type, "doc_id": r.doc_id}
                for r in relations
            ],
        }

    async def get_neighbors(
        self, entity_text: str, user_id: int, limit: int = 50
    ) -> Dict[str, Any]:
        """获取指定实体的直接邻居（所有 1 跳关系及其另一端的实体）"""
        q = entity_text.strip()
        async with self.async_session() as session:
            rel_stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.user_id == user_id,
                (
                    KnowledgeRelationshipModel.source_text.ilike(q) |
                    KnowledgeRelationshipModel.target_text.ilike(q)
                )
            ).limit(limit)
            relations = (await session.execute(rel_stmt)).scalars().all()

        neighbor_texts = set()
        for r in relations:
            if r.source_text.lower() != q.lower():
                neighbor_texts.add(r.source_text)
            if r.target_text.lower() != q.lower():
                neighbor_texts.add(r.target_text)

        return {
            "entity": entity_text,
            "neighbor_count": len(neighbor_texts),
            "neighbors": list(neighbor_texts),
            "relations": [
                {"id": r.id, "source": r.source_text, "target": r.target_text,
                 "label": r.relation_type, "doc_id": r.doc_id}
                for r in relations
            ],
        }

    async def create_entity(
        self, user_id: int, text: str, entity_class: str,
        doc_id: Optional[str] = None, description: str = ""
    ) -> Dict[str, Any]:
        """手动创建实体"""
        async with self.async_session() as session:
            entity = KnowledgeEntityModel(
                id=str(uuid.uuid4()),
                doc_id=doc_id or "manual",
                user_id=user_id,
                entity_class=entity_class,
                entity_text=text,
                attributes={"description": description},
                created_at=datetime.utcnow(),
            )
            session.add(entity)
            await session.commit()
            return {
                "id": entity.id,
                "text": entity.entity_text,
                "type": entity.entity_class,
                "doc_id": entity.doc_id,
                "description": description,
            }

    async def update_entity(
        self, entity_id: str, user_id: int,
        text: Optional[str] = None,
        entity_class: Optional[str] = None,
        description: Optional[str] = None,
    ) -> bool:
        """更新实体属性"""
        async with self.async_session() as session:
            stmt = select(KnowledgeEntityModel).where(
                KnowledgeEntityModel.id == entity_id,
                KnowledgeEntityModel.user_id == user_id,
            )
            entity = (await session.execute(stmt)).scalar_one_or_none()
            if not entity:
                return False
            if text is not None:
                entity.entity_text = text
            if entity_class is not None:
                entity.entity_class = entity_class
            if description is not None:
                attrs = dict(entity.attributes or {})
                attrs["description"] = description
                entity.attributes = attrs
            await session.commit()
            return True

    async def delete_entity_by_id(self, entity_id: str, user_id: int) -> bool:
        """删除单个实体"""
        async with self.async_session() as session:
            stmt = select(KnowledgeEntityModel).where(
                KnowledgeEntityModel.id == entity_id,
                KnowledgeEntityModel.user_id == user_id,
            )
            entity = (await session.execute(stmt)).scalar_one_or_none()
            if not entity:
                return False
            await session.delete(entity)
            await session.commit()
            return True

    async def create_relationship(
        self, user_id: int, source_text: str, target_text: str,
        relation_type: str, doc_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """手动创建关系"""
        async with self.async_session() as session:
            rel = KnowledgeRelationshipModel(
                id=str(uuid.uuid4()),
                doc_id=doc_id or "manual",
                user_id=user_id,
                source_text=source_text,
                target_text=target_text,
                relation_type=relation_type,
                attributes={},
                created_at=datetime.utcnow(),
            )
            session.add(rel)
            await session.commit()
            return {
                "id": rel.id,
                "source": rel.source_text,
                "target": rel.target_text,
                "label": rel.relation_type,
                "doc_id": rel.doc_id,
            }

    async def update_relationship(
        self, rel_id: str, user_id: int,
        source_text: Optional[str] = None,
        target_text: Optional[str] = None,
        relation_type: Optional[str] = None,
    ) -> bool:
        """更新关系属性"""
        async with self.async_session() as session:
            stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.id == rel_id,
                KnowledgeRelationshipModel.user_id == user_id,
            )
            rel = (await session.execute(stmt)).scalar_one_or_none()
            if not rel:
                return False
            if source_text is not None:
                rel.source_text = source_text
            if target_text is not None:
                rel.target_text = target_text
            if relation_type is not None:
                rel.relation_type = relation_type
            await session.commit()
            return True

    async def delete_relationship_by_id(self, rel_id: str, user_id: int) -> bool:
        """删除单条关系"""
        async with self.async_session() as session:
            stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.id == rel_id,
                KnowledgeRelationshipModel.user_id == user_id,
            )
            rel = (await session.execute(stmt)).scalar_one_or_none()
            if not rel:
                return False
            await session.delete(rel)
            await session.commit()
            return True

    async def get_stats(self, user_id: int) -> Dict[str, Any]:
        """获取知识图谱统计信息"""
        async with self.async_session() as session:
            total_entities = (await session.execute(
                select(func.count()).select_from(KnowledgeEntityModel).where(
                    KnowledgeEntityModel.user_id == user_id)
            )).scalar() or 0

            type_counts = (await session.execute(
                select(KnowledgeEntityModel.entity_class, func.count().label("cnt"))
                .where(KnowledgeEntityModel.user_id == user_id)
                .group_by(KnowledgeEntityModel.entity_class)
            )).all()

            total_relations = (await session.execute(
                select(func.count()).select_from(KnowledgeRelationshipModel).where(
                    KnowledgeRelationshipModel.user_id == user_id)
            )).scalar() or 0

            rel_type_counts = (await session.execute(
                select(KnowledgeRelationshipModel.relation_type, func.count().label("cnt"))
                .where(KnowledgeRelationshipModel.user_id == user_id)
                .group_by(KnowledgeRelationshipModel.relation_type)
                .order_by(func.count().desc())
                .limit(10)
            )).all()

            doc_counts = (await session.execute(
                select(func.count(func.distinct(KnowledgeEntityModel.doc_id)))
                .where(KnowledgeEntityModel.user_id == user_id)
                .where(KnowledgeEntityModel.doc_id.isnot(None))
            )).scalar() or 0

        return {
            "total_entities": total_entities,
            "total_relations": total_relations,
            "total_docs": doc_counts,
            "entity_type_counts": {t: c for t, c in type_counts if t},
            "top_relation_types": [{"type": t, "count": c} for t, c in rel_type_counts if t],
        }

    async def find_path(
        self, source_text: str, target_text: str, user_id: int, max_hops: int = 5
    ) -> Optional[List[Dict]]:
        """BFS 最短路径查找，返回路径节点+关系序列，未找到则返回 None"""
        from collections import deque

        async with self.async_session() as session:
            stmt = select(KnowledgeRelationshipModel).where(
                KnowledgeRelationshipModel.user_id == user_id
            ).limit(3000)
            relations = (await session.execute(stmt)).scalars().all()

        # 构建邻接表（无向）
        adj: Dict[str, List] = {}
        for r in relations:
            adj.setdefault(r.source_text, []).append(
                (r.target_text, r.relation_type, r.id))
            adj.setdefault(r.target_text, []).append(
                (r.source_text, r.relation_type, r.id))

        if source_text not in adj:
            return None

        # BFS
        visited: Dict[str, Optional[tuple]] = {source_text: None}
        queue: deque = deque([(source_text, [])])

        while queue:
            node, path = queue.popleft()
            if node == target_text:
                return path
            if len(path) >= max_hops:
                continue
            for neighbor, rel_type, rel_id in adj.get(node, []):
                if neighbor not in visited:
                    visited[neighbor] = (node, rel_type)
                    new_path = path + [
                        {"from": node, "relation": rel_type, "to": neighbor}
                    ]
                    queue.append((neighbor, new_path))

        return None

    async def list_docs(self, user_id: int) -> List[Dict[str, Any]]:
        """列出用户知识图谱中的所有文档及其实体/关系计数"""
        async with self.async_session() as session:
            entity_docs = (await session.execute(
                select(KnowledgeEntityModel.doc_id, func.count().label("entity_count"))
                .where(KnowledgeEntityModel.user_id == user_id)
                .where(KnowledgeEntityModel.doc_id.isnot(None))
                .group_by(KnowledgeEntityModel.doc_id)
                .order_by(func.count().desc())
            )).all()

            rel_docs = (await session.execute(
                select(KnowledgeRelationshipModel.doc_id, func.count().label("rel_count"))
                .where(KnowledgeRelationshipModel.user_id == user_id)
                .where(KnowledgeRelationshipModel.doc_id.isnot(None))
                .group_by(KnowledgeRelationshipModel.doc_id)
            )).all()

        rel_by_doc = {d: c for d, c in rel_docs}
        return [
            {
                "doc_id": doc_id,
                "entity_count": ec,
                "relation_count": rel_by_doc.get(doc_id, 0),
            }
            for doc_id, ec in entity_docs
        ]

    # ──────────────────────────────────────────────────────────────
    # PageRank 实体重要性 (Phase 2 GraphRAG)
    # ──────────────────────────────────────────────────────────────

    async def save_entity_pagerank(
        self, doc_id: str, user_id: int, scores: Dict[str, float]
    ) -> None:
        """
        批量将 PageRank 分值写入实体 attributes JSONB。
        使用 PostgreSQL 原生 jsonb_set 避免全量 ORM 查询。
        """
        if not scores:
            return
        async with self.async_session() as session:
            try:
                for entity_text, score in scores.items():
                    await session.execute(
                        text(
                            "UPDATE knowledge_entities "
                            "SET attributes = jsonb_set(COALESCE(attributes, '{}'), '{pagerank}', CAST(:score AS jsonb)) "
                            "WHERE doc_id = :doc_id AND user_id = :user_id AND entity_text = :text"
                        ),
                        {
                            "doc_id": doc_id,
                            "user_id": user_id,
                            "text": entity_text,
                            "score": str(round(score, 6)),
                        },
                    )
                await session.commit()
            except Exception as e:
                await session.rollback()
                print(f"❌ save_entity_pagerank 失败: {e}")

    async def get_entity_pagerank(self, user_id: int) -> Dict[str, float]:
        """
        获取该用户所有实体的 PageRank 分值。
        返回: {entity_text: score}
        """
        async with self.async_session() as session:
            rows = (await session.execute(
                text(
                    "SELECT entity_text, (attributes->>'pagerank')::float "
                    "FROM knowledge_entities "
                    "WHERE user_id = :uid AND attributes ? 'pagerank'"
                ),
                {"uid": user_id},
            )).all()
        return {text: (score or 0.0) for text, score in rows}

    # ──────────────────────────────────────────────────────────────
    # 社区管理 (Phase 1 GraphRAG)
    # ──────────────────────────────────────────────────────────────

    async def save_communities(
        self,
        doc_id: str,
        user_id: int,
        communities: List[Dict[str, Any]],
        level: int = 0
    ) -> None:
        """
        批量保存社区检测结果。
        communities 格式: [{community_id, title, summary, entity_texts, size, key_findings, impact_score, central_entities}, ...]
        """
        if not communities:
            return
        async with self.async_session() as session:
            try:
                for c in communities:
                    record = KnowledgeCommunityModel(
                        id=str(uuid.uuid4()),
                        doc_id=doc_id,
                        user_id=user_id,
                        community_id=c["community_id"],
                        title=c.get("title", ""),
                        summary=c.get("summary", ""),
                        entity_texts=c.get("entity_texts", []),
                        size=c.get("size", 0),
                        level=level,
                        key_findings=c.get("key_findings", []),
                        impact_score=c.get("impact_score", 0),
                        central_entities=c.get("central_entities", []),
                        created_at=datetime.utcnow(),
                    )
                    session.add(record)
                await session.commit()
                print(f"✅ [KnowledgeDB] 保存 {len(communities)} 个 L{level} 社区 (doc: {doc_id})")
            except Exception as e:
                await session.rollback()
                print(f"❌ [KnowledgeDB] 社区保存失败: {e}")

    async def get_communities(
        self,
        user_id: int,
        doc_id: Optional[str] = None,
        level: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """获取社区列表，可按文档过滤，按社区大小降序。"""
        async with self.async_session() as session:
            stmt = select(KnowledgeCommunityModel).where(
                KnowledgeCommunityModel.user_id == user_id
            )
            if doc_id:
                stmt = stmt.where(KnowledgeCommunityModel.doc_id == doc_id)
            if level is not None:
                stmt = stmt.where(KnowledgeCommunityModel.level == level)
            stmt = stmt.order_by(KnowledgeCommunityModel.size.desc())
            rows = (await session.execute(stmt)).scalars().all()

        return [
            {
                "id": r.id,
                "doc_id": r.doc_id,
                "community_id": r.community_id,
                "title": r.title,
                "summary": r.summary,
                "entity_texts": r.entity_texts or [],
                "size": r.size,
                "level": r.level,
                "key_findings": r.key_findings or [],
                "impact_score": r.impact_score or 0,
                "central_entities": r.central_entities or [],
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def get_communities_for_entities(
        self, entities: List[str], user_id: int, level: int = 0
    ) -> List[Dict[str, Any]]:
        """
        查找包含给定实体的社区报告。
        使用 PostgreSQL 的 JSONB ?| 操作符（是否包含数组中的任意一个值）。
        """
        if not entities:
            return []
        async with self.async_session() as session:
            try:
                # 注意：SQLAlchemy 2.0 中使用 JSONB 的特定操作可能需要 text() 或特定 comparator
                # 这里使用原始 SQL 保证兼容性
                sql = text(
                    "SELECT * FROM knowledge_communities "
                    "WHERE user_id = :uid AND level = :lvl "
                    "AND entity_texts ?| :entities "
                    "ORDER BY size DESC LIMIT 10"
                )
                result = await session.execute(sql, {"uid": user_id, "lvl": level, "entities": entities})
                rows = result.mappings().all()
                return [dict(r) for r in rows]
            except Exception as e:
                logger.warning(f"get_communities_for_entities 失败: {e}")
                return []

    async def delete_communities(self, doc_id: str, user_id: int, level: Optional[int] = None) -> None:
        """删除指定文档的所有社区（重新抽取时清理旧数据）。"""
        async with self.async_session() as session:
            try:
                sql = "DELETE FROM knowledge_communities WHERE doc_id = :doc_id AND user_id = :uid"
                params = {"doc_id": doc_id, "uid": user_id}
                if level is not None:
                    sql += " AND level = :lvl"
                    params["lvl"] = level
                await session.execute(text(sql), params)
                await session.commit()
            except Exception as e:
                await session.rollback()
                print(f"❌ delete_communities 失败: {e}")


    async def save_failed_chunk(
        self, user_id: int, filename: str, chunk_idx: int, total_chunks: int, chunk_text: str
    ) -> None:
        """保存抽取失败的文本块，供后续补跑。"""
        async with self.async_session() as session:
            try:
                record = KGFailedChunkModel(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    filename=filename,
                    chunk_idx=chunk_idx,
                    total_chunks=total_chunks,
                    chunk_text=chunk_text,
                    status='pending',
                )
                session.add(record)
                await session.commit()
            except Exception as e:
                await session.rollback()
                print(f"❌ save_failed_chunk 失败: {e}")

    async def get_failed_chunks(self, user_id: int, filename: str = None) -> List[Dict[str, Any]]:
        """查询待补跑的失败块。"""
        async with self.async_session() as session:
            try:
                sql = "SELECT * FROM kg_failed_chunks WHERE user_id = :uid AND status = 'pending'"
                params: Dict[str, Any] = {"uid": user_id}
                if filename:
                    sql += " AND filename = :filename"
                    params["filename"] = filename
                sql += " ORDER BY created_at ASC"
                result = await session.execute(text(sql), params)
                rows = result.mappings().all()
                return [dict(r) for r in rows]
            except Exception as e:
                print(f"❌ get_failed_chunks 失败: {e}")
                return []

    async def mark_failed_chunk_done(self, chunk_id: str) -> None:
        """将失败块标记为已完成（补跑成功后调用）。"""
        async with self.async_session() as session:
            try:
                await session.execute(
                    text("UPDATE kg_failed_chunks SET status = 'done' WHERE id = :id"),
                    {"id": chunk_id},
                )
                await session.commit()
            except Exception as e:
                await session.rollback()
                print(f"❌ mark_failed_chunk_done 失败: {e}")


# 全局实例
knowledge_db = KnowledgeDatabase()
