"""阶段 8 MVP — 语义层/指标中心服务 (CRUD only)。

注意：
- metric.expression 当作字符串字面量保存，DSL 解析/翻译留待后续
- AI 同义词匹配暂用 substring，未来换 embedding
- 字段统计 (null_ratio / distinct_count) 由调用方提供，不主动扫表
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy import delete as sa_delete

from .base import v2_db
from .models import (
    DatasourceTableMetaModel, ColumnMetaModel, ColumnSemanticTagModel,
    MetricModel, MetricSynonymModel, MetricLineageModel,
)


def _to_dict(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ---------- datasource_tables_meta ----------

async def list_tables(ds_id: str, schema_name: Optional[str] = None) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        stmt = select(DatasourceTableMetaModel).where(DatasourceTableMetaModel.ds_id == ds_id)
        if schema_name:
            stmt = stmt.where(DatasourceTableMetaModel.schema_name == schema_name)
        res = await s.execute(stmt.order_by(DatasourceTableMetaModel.table_name))
        return [_to_dict(r) for r in res.scalars().all()]


async def upsert_table_meta(
    ds_id: str, schema_name: str, table_name: str,
    row_count_estimate: int = 0, comment: Optional[str] = None,
) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(DatasourceTableMetaModel).where(
                DatasourceTableMetaModel.ds_id == ds_id,
                DatasourceTableMetaModel.schema_name == schema_name,
                DatasourceTableMetaModel.table_name == table_name,
            )
        )
        r = res.scalar_one_or_none()
        if r:
            r.row_count_estimate = row_count_estimate
            r.comment = comment
            r.last_synced_at = datetime.utcnow()
        else:
            r = DatasourceTableMetaModel(
                ds_id=ds_id, schema_name=schema_name, table_name=table_name,
                row_count_estimate=row_count_estimate, comment=comment,
                last_synced_at=datetime.utcnow(), created_at=datetime.utcnow(),
            )
            s.add(r)
        await s.commit()
        return _to_dict(r)


# ---------- column_meta ----------

async def list_columns(ds_id: str, schema_name: str, table_name: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ColumnMetaModel)
            .where(ColumnMetaModel.ds_id == ds_id)
            .where(ColumnMetaModel.schema_name == schema_name)
            .where(ColumnMetaModel.table_name == table_name)
            .order_by(ColumnMetaModel.column_name)
        )
        return [_to_dict(r) for r in res.scalars().all()]


async def upsert_column(
    ds_id: str, schema_name: str, table_name: str, column_name: str,
    dtype: Optional[str] = None, null_ratio: int = 0, distinct_count: int = 0,
    sample_values: Optional[List[Any]] = None, comment: Optional[str] = None,
) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ColumnMetaModel).where(
                ColumnMetaModel.ds_id == ds_id,
                ColumnMetaModel.schema_name == schema_name,
                ColumnMetaModel.table_name == table_name,
                ColumnMetaModel.column_name == column_name,
            )
        )
        c = res.scalar_one_or_none()
        if c:
            c.dtype = dtype; c.null_ratio = null_ratio
            c.distinct_count = distinct_count
            c.sample_values_json = sample_values
            c.comment = comment
        else:
            c = ColumnMetaModel(
                id=str(uuid.uuid4()),
                ds_id=ds_id, schema_name=schema_name,
                table_name=table_name, column_name=column_name,
                dtype=dtype, null_ratio=null_ratio,
                distinct_count=distinct_count,
                sample_values_json=sample_values, comment=comment,
            )
            s.add(c)
        await s.commit()
        return _to_dict(c)


# ---------- column_semantic_tags ----------

async def list_tags(column_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ColumnSemanticTagModel).where(ColumnSemanticTagModel.column_id == column_id)
        )
        return [_to_dict(t) for t in res.scalars().all()]


async def upsert_tag(
    column_id: str, tag_name: str,
    confidence: int = 100, source: str = 'manual', tagged_by: Optional[int] = None,
) -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(ColumnSemanticTagModel).where(
                ColumnSemanticTagModel.column_id == column_id,
                ColumnSemanticTagModel.tag_name == tag_name,
            )
        )
        t = res.scalar_one_or_none()
        if t:
            t.confidence = confidence; t.source = source; t.tagged_by = tagged_by
            t.tagged_at = datetime.utcnow()
        else:
            t = ColumnSemanticTagModel(
                column_id=column_id, tag_name=tag_name,
                confidence=confidence, source=source, tagged_by=tagged_by,
                tagged_at=datetime.utcnow(),
            )
            s.add(t)
        await s.commit()
        return _to_dict(t)


async def remove_tag(column_id: str, tag_name: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(ColumnSemanticTagModel).where(
            ColumnSemanticTagModel.column_id == column_id,
            ColumnSemanticTagModel.tag_name == tag_name,
        ))
        await s.commit()


# ---------- metrics ----------

async def list_metrics(workspace_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(MetricModel)
            .where(MetricModel.workspace_id == workspace_id)
            .order_by(MetricModel.updated_at.desc())
        )
        return [_to_dict(m) for m in res.scalars().all()]


async def get_metric(metric_id: str) -> Optional[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(select(MetricModel).where(MetricModel.id == metric_id))
        m = res.scalar_one_or_none()
        return _to_dict(m) if m else None


async def create_metric(
    workspace_id: str, owner_user_id: int,
    name: str, expression: str,
    biz_definition: Optional[str] = None, unit: Optional[str] = None,
) -> Dict[str, Any]:
    mid = str(uuid.uuid4())
    async with v2_db.async_session() as s:
        m = MetricModel(
            id=mid, workspace_id=workspace_id, owner_user_id=owner_user_id,
            name=name, expression=expression,
            biz_definition=biz_definition, unit=unit,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )
        s.add(m)
        await s.commit()
        return _to_dict(m)


async def update_metric(metric_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ALLOWED = {'name', 'expression', 'biz_definition', 'unit'}
    cleaned = {k: v for k, v in updates.items() if k in ALLOWED}
    if not cleaned:
        return await get_metric(metric_id)
    async with v2_db.async_session() as s:
        res = await s.execute(select(MetricModel).where(MetricModel.id == metric_id))
        m = res.scalar_one_or_none()
        if not m:
            return None
        for k, v in cleaned.items():
            setattr(m, k, v)
        await s.commit()
        return _to_dict(m)


async def delete_metric(metric_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(MetricSynonymModel).where(MetricSynonymModel.metric_id == metric_id))
        await s.execute(sa_delete(MetricLineageModel).where(MetricLineageModel.from_metric_id == metric_id))
        await s.execute(sa_delete(MetricModel).where(MetricModel.id == metric_id))
        await s.commit()


async def search_metrics(workspace_id: str, query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """简单子串匹配 + 同义词 (MVP)。"""
    q = (query or '').strip().lower()
    if not q:
        return []
    async with v2_db.async_session() as s:
        # 1. 名称匹配
        res = await s.execute(select(MetricModel).where(MetricModel.workspace_id == workspace_id))
        all_metrics = list(res.scalars().all())
        # 2. 同义词匹配
        syn_res = await s.execute(select(MetricSynonymModel))
        syn_map: Dict[str, List[str]] = {}
        for syn in syn_res.scalars().all():
            syn_map.setdefault(syn.metric_id, []).append(syn.synonym_text.lower())

        results = []
        for m in all_metrics:
            matched = False
            if q in (m.name or '').lower():
                matched = True
            elif any(q in syn for syn in syn_map.get(m.id, [])):
                matched = True
            elif q in (m.biz_definition or '').lower():
                matched = True
            if matched:
                results.append({**_to_dict(m), 'synonyms_count': len(syn_map.get(m.id, []))})
        return results[:limit]


# ---------- metric_synonyms ----------

async def list_synonyms(metric_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(MetricSynonymModel).where(MetricSynonymModel.metric_id == metric_id)
        )
        return [_to_dict(syn) for syn in res.scalars().all()]


async def add_synonym(metric_id: str, synonym_text: str, weight: int = 100, source: str = 'user') -> Dict[str, Any]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(MetricSynonymModel).where(
                MetricSynonymModel.metric_id == metric_id,
                MetricSynonymModel.synonym_text == synonym_text,
            )
        )
        syn = res.scalar_one_or_none()
        if syn:
            syn.weight = weight; syn.source = source
        else:
            syn = MetricSynonymModel(
                metric_id=metric_id, synonym_text=synonym_text,
                weight=weight, source=source,
                created_at=datetime.utcnow(),
            )
            s.add(syn)
        await s.commit()
        return _to_dict(syn)


async def remove_synonym(metric_id: str, synonym_text: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(MetricSynonymModel).where(
            MetricSynonymModel.metric_id == metric_id,
            MetricSynonymModel.synonym_text == synonym_text,
        ))
        await s.commit()


# ---------- metric_lineage ----------

async def list_lineage(metric_id: str) -> List[Dict[str, Any]]:
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(MetricLineageModel).where(MetricLineageModel.from_metric_id == metric_id)
        )
        return [_to_dict(l) for l in res.scalars().all()]


async def add_lineage(from_metric_id: str, to_type: str, to_id: str, relation: str = 'uses') -> Dict[str, Any]:
    if to_type not in ('metric', 'table_column'):
        raise ValueError("invalid to_type")
    async with v2_db.async_session() as s:
        res = await s.execute(
            select(MetricLineageModel).where(
                MetricLineageModel.from_metric_id == from_metric_id,
                MetricLineageModel.to_type == to_type,
                MetricLineageModel.to_id == to_id,
            )
        )
        l = res.scalar_one_or_none()
        if l:
            l.relation = relation
        else:
            l = MetricLineageModel(
                from_metric_id=from_metric_id,
                to_type=to_type, to_id=to_id, relation=relation,
                created_at=datetime.utcnow(),
            )
            s.add(l)
        await s.commit()
        return _to_dict(l)


async def remove_lineage(from_metric_id: str, to_type: str, to_id: str) -> None:
    async with v2_db.async_session() as s:
        await s.execute(sa_delete(MetricLineageModel).where(
            MetricLineageModel.from_metric_id == from_metric_id,
            MetricLineageModel.to_type == to_type,
            MetricLineageModel.to_id == to_id,
        ))
        await s.commit()
