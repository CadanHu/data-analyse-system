"""
知识图谱数据模型 (PostgreSQL 专用，支持 JSONB)
"""
import os
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, text, Index
from sqlalchemy.dialects.postgresql import JSONB  # PostgreSQL 特有的 JSONB 类型
from sqlalchemy.future import select

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
    source_text = Column(Text, nullable=False, index=True) # 起始实体
    target_text = Column(Text, nullable=False, index=True) # 目标实体
    relation_type = Column(String(100), index=True)       # 关系类型
    attributes = Column(JSONB, default={})                # 关系属性
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_rel_src_target', 'source_text', 'target_text'),
    )

class KnowledgeDatabase:
    """PostgreSQL 知识库管理器"""
    
    def __init__(self):
        # 使用 asyncpg 驱动连接 PostgreSQL
        self.url = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{PG_DB}"
        self.engine = create_async_engine(
            self.url,
            echo=False,
            pool_size=10,
            max_overflow=20
        )
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def init_db(self):
        """初始化表结构"""
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print(f"✅ PostgreSQL 知识库初始化完成: {PG_DB}")
        except Exception as e:
            print(f"❌ PostgreSQL 初始化失败 (请检查数据库 {PG_DB} 是否已创建): {str(e)}")

    async def save_knowledge(self, doc_id: str, knowledge: List[Dict[str, Any]]):
        """保存抽取的知识点 (带去重逻辑)"""
        async with self.async_session() as session:
            count_added = 0
            for item in knowledge:
                k_class = item.get("class")
                k_text = item.get("text")
                k_attrs = item.get("attributes", {})
                
                if k_class == "relationship":
                    # 关系去重：源、目标、类型和 doc_id 同时匹配
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
                    existing = result.scalar_one_or_none()
                    
                    if not existing:
                        new_rel = KnowledgeRelationshipModel(
                            id=str(uuid.uuid4()),
                            doc_id=doc_id,
                            source_text=src,
                            target_text=tgt,
                            relation_type=r_type,
                            attributes=k_attrs,
                            created_at=datetime.utcnow()
                        )
                        session.add(new_rel)
                        count_added += 1
                else:
                    # 实体去重：文本、类别和 doc_id 同时匹配
                    stmt = select(KnowledgeEntityModel).where(
                        KnowledgeEntityModel.doc_id == doc_id,
                        KnowledgeEntityModel.entity_text == k_text,
                        KnowledgeEntityModel.entity_class == k_class
                    )
                    result = await session.execute(stmt)
                    existing = result.scalar_one_or_none()
                    
                    if not existing:
                        new_entity = KnowledgeEntityModel(
                            id=str(uuid.uuid4()),
                            doc_id=doc_id,
                            entity_class=k_class,
                            entity_text=k_text,
                            attributes=k_attrs,
                            created_at=datetime.utcnow()
                        )
                        session.add(new_entity)
                        count_added += 1
            
            await session.commit()
            print(f"💾 已持久化 {count_added} 条新知识点到 PostgreSQL (跳过了重复项)")

# 全局实例
knowledge_db = KnowledgeDatabase()
