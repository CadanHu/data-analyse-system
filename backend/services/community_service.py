"""
社区检测与摘要服务 (Phase 1 GraphRAG)

流程：
  1. 接收已提取的图数据（实体 + 关系）
  2. 用 networkx + python-louvain 做 Louvain 社区检测
  3. 对每个社区调用 LLM 生成标题和摘要
  4. 结果存入 knowledge_communities 表
"""
import re
import json
import logging
import httpx
from typing import Dict, List, Any, Tuple

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = """\
你是知识图谱分析专家。以下是从文档中提取的一个实体社区，包含相互关联的实体和关系。

实体：{entities}

内部关系：
{relations}

请分析核心主题，生成：
1. 标题：不超过15字
2. 摘要：80-150字，概括核心内容、主要实体及关键关系

仅输出 JSON，不要有任何其他文字：
{{"title": "...", "summary": "..."}}"""


async def detect_and_summarize_communities(
    doc_id: str,
    user_id: int,
    entities: List[Dict],   # [{id, text, type, description}, ...]  id 为 'e1'/'e2' 形式
    relations: List[Dict],  # [{id, source (gid), target (gid), label}, ...]
    llm_url: str,
    llm_key: str,
    llm_model: str,
) -> int:
    """
    主入口：社区检测 + LLM 摘要，返回生成的社区数量。
    失败时静默跳过，不影响主流程。
    """
    try:
        import networkx as nx
    except ImportError:
        logger.warning("[Community] 缺少 networkx，请执行: pip install networkx")
        return 0

    try:
        import community as community_louvain
    except ImportError:
        logger.warning("[Community] 缺少 python-louvain，请执行: pip install python-louvain")
        return 0

    from database.knowledge_db import knowledge_db

    logger.info(f"[Community] 🚀 开始社区检测: doc={doc_id}, 实体={len(entities)}, 关系={len(relations)}")

    if len(entities) < 3:
        logger.info(f"[Community] ⏭ 实体数 {len(entities)} 不足 3 个，跳过")
        return 0

    # ── 1. 构建 networkx 无向图 ──────────────────────────────────
    logger.info(f"[Community] 📐 构建图结构...")
    id_to_text: Dict[str, str] = {e["id"]: e["text"] for e in entities}

    G = nx.Graph()
    for e in entities:
        G.add_node(e["text"], entity_type=e.get("type", "Other"))

    edge_labels: Dict[Tuple[str, str], List[str]] = {}
    for r in relations:
        src = id_to_text.get(r["source"], r["source"])
        tgt = id_to_text.get(r["target"], r["target"])
        label = r.get("label", "")
        if not src or not tgt or src == tgt:
            continue
        G.add_edge(src, tgt)
        key = (src, tgt) if src <= tgt else (tgt, src)
        edge_labels.setdefault(key, []).append(label)

    logger.info(f"[Community] 图构建完成: {G.number_of_nodes()} 节点, {G.number_of_edges()} 边")

    if G.number_of_edges() == 0:
        logger.info("[Community] ⏭ 图中无有效边，跳过社区检测")
        return 0

    # ── 2. Louvain 社区检测 ───────────────────────────────────────
    logger.info(f"[Community] 🔍 运行 Louvain 社区检测...")
    partition: Dict[str, int] = community_louvain.best_partition(G)

    comm_nodes: Dict[int, List[str]] = {}
    for node_text, comm_id in partition.items():
        comm_nodes.setdefault(comm_id, []).append(node_text)

    sizes = sorted([len(v) for v in comm_nodes.values()], reverse=True)
    logger.info(
        f"[Community] ✔ Louvain 完成: {len(comm_nodes)} 个社区 "
        f"(最大={sizes[0] if sizes else 0}, 最小={sizes[-1] if sizes else 0}, 中位={sizes[len(sizes)//2] if sizes else 0})"
    )

    # ── 2b. PageRank 实体重要性评分 ──────────────────────────────
    logger.info(f"[Community] 📊 计算 PageRank 实体重要性...")
    try:
        pagerank_scores: Dict[str, float] = nx.pagerank(G, alpha=0.85)
        top3 = sorted(pagerank_scores.items(), key=lambda x: -x[1])[:3]
        top3_str = ", ".join(f"{t}({s:.4f})" for t, s in top3)
        logger.info(f"[Community] ✔ PageRank 完成, 最重要实体: {top3_str}")
        await knowledge_db.save_entity_pagerank(doc_id, user_id, pagerank_scores)
        logger.info(f"[Community] ✔ PageRank 分值已写入 DB ({len(pagerank_scores)} 个实体)")
    except Exception as pr_err:
        logger.warning(f"[Community] ⚠ PageRank 计算失败: {pr_err}")

    # ── 3. 清理旧社区数据 ─────────────────────────────────────────
    logger.info(f"[Community] 🗑 清理旧社区数据...")
    await knowledge_db.delete_communities(doc_id, user_id)

    # ── 4. 逐社区生成摘要并保存 ──────────────────────────────────
    logger.info(f"[Community] 📝 开始为 {len(comm_nodes)} 个社区生成 LLM 摘要...")
    community_records = []
    sorted_comms = sorted(comm_nodes.items(), key=lambda x: -len(x[1]))
    total = len(sorted_comms)

    async with httpx.AsyncClient(timeout=30.0) as client:
        for idx, (comm_id, node_texts) in enumerate(sorted_comms, start=1):
            node_set = set(node_texts)

            internal_rels: List[str] = []
            for (src, tgt), labels in edge_labels.items():
                if src in node_set and tgt in node_set:
                    for lbl in labels:
                        internal_rels.append(f"  - {src} --[{lbl}]--> {tgt}")
                    if len(internal_rels) >= 30:
                        break

            entities_str = "、".join(node_texts[:40])
            relations_str = "\n".join(internal_rels) if internal_rels else "（无内部关系）"

            title = f"主题群 {comm_id + 1}"
            summary = f"包含 {len(node_texts)} 个实体：{entities_str[:150]}"

            logger.info(
                f"[Community] ⏳ [{idx}/{total}] 生成社区摘要: "
                f"实体数={len(node_texts)}, 内部关系={len(internal_rels)}"
            )
            try:
                prompt = _SUMMARY_PROMPT.format(
                    entities=entities_str,
                    relations=relations_str,
                )
                resp = await client.post(
                    llm_url,
                    headers={
                        "Authorization": f"Bearer {llm_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": llm_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 300,
                    },
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"]
                match = re.search(r'\{[\s\S]*?\}', raw)
                if match:
                    parsed = json.loads(match.group(0))
                    title = parsed.get("title") or title
                    summary = parsed.get("summary") or summary
                logger.info(f"[Community] ✔ [{idx}/{total}] 摘要生成成功: 「{title}」")
            except Exception as llm_err:
                logger.warning(f"[Community] ⚠ [{idx}/{total}] 摘要生成失败，使用默认摘要: {llm_err}")

            community_records.append({
                "community_id": comm_id,
                "title": title,
                "summary": summary,
                "entity_texts": node_texts,
                "size": len(node_texts),
            })

    logger.info(f"[Community] 💾 保存 {len(community_records)} 个社区到 DB...")
    await knowledge_db.save_communities(doc_id, user_id, community_records)
    logger.info(f"[Community] ✅ 全部完成: {len(community_records)} 个社区 (doc: {doc_id})")
    return len(community_records)
