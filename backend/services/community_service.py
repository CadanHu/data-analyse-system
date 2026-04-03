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
1. title: 标题，不超过15字
2. summary: 摘要，80-150字，概括核心内容、主要实体及关键关系
3. key_findings: 3-5条关键发现（数组）
4. impact_score: 1-10的重要性评分（整数）
5. central_entities: 最核心的3-5个实体名（数组）

仅输出标准的 JSON 格式，不要有任何其他解释性文字：
{{
  "title": "...",
  "summary": "...",
  "key_findings": ["...", "...", "..."],
  "impact_score": 8,
  "central_entities": ["实体A", "实体B", "实体C"]
}}"""


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
    主入口：Leiden 社区检测 + 多层级 LLM 摘要，返回生成的社区数量（底层）。
    """
    try:
        import networkx as nx
        import igraph as ig
        import leidenalg
    except ImportError:
        logger.warning("[Community] 缺少必要的库 (networkx, igraph, leidenalg)")
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

    # ── 2. Leiden 多层级社区检测 ──────────────────────────────────
    logger.info(f"[Community] 🔍 运行 Leiden 多层级检测...")
    # 转换 networkx 到 igraph
    ig_graph = ig.Graph.from_networkx(G)

    # 定义层级：(level, resolution_parameter)
    # resolution 越高，社区越小（精细）；越低，社区越大（粗粒度）
    LEVELS = [
        (0, 1.0),   # 精细层
        (1, 0.5),   # 中层
        (2, 0.1),   # 粗粒度
    ]

    total_created = 0

    # ── 3. 清理旧社区数据 ─────────────────────────────────────────
    logger.info(f"[Community] 🗑 清理旧社区数据...")
    await knowledge_db.delete_communities(doc_id, user_id)

    for level, resolution in LEVELS:
        logger.info(f"[Community] 🛰 计算 L{level} 社区 (resolution={resolution})...")
        try:
            partition_obj = leidenalg.find_partition(
                ig_graph,
                leidenalg.CPMVertexPartition,  # 使用 CPM 支持 resolution 参数
                resolution_parameter=resolution,
                seed=42
            )
            # 映射回节点名称
            # igraph 节点有 _nx_name 属性存储原 networkx 节点名
            partition: Dict[int, List[str]] = {}
            for comm_id, member_indices in enumerate(partition_obj):
                node_names = [ig_graph.vs[i]["_nx_name"] for i in member_indices]
                if node_names:
                    partition[comm_id] = node_names

            if not partition:
                continue

            num_comms = len(partition)
            sizes = sorted([len(v) for v in partition.values()], reverse=True)
            logger.info(f"[Community] ✔ L{level} 完成: {num_comms} 个社区 (最大={sizes[0]})")

            # 摘要并保存该层级
            level_count = await _summarize_and_save_level(
                doc_id, user_id, level, partition, edge_labels,
                llm_url, llm_key, llm_model
            )
            if level == 0:
                total_created = level_count

        except Exception as e:
            logger.error(f"[Community] ❌ L{level} 检测失败: {e}")

    # ── 4. PageRank 实体重要性评分 (保持不变) ────────────────────
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

    return total_created


async def _summarize_and_save_level(
    doc_id: str,
    user_id: int,
    level: int,
    comm_nodes: Dict[int, List[str]],
    edge_labels: Dict[Tuple[str, str], List[str]],
    llm_url: str,
    llm_key: str,
    llm_model: str,
) -> int:
    """内部工具：为某一层的社区生成摘要并存入 DB"""
    from database.knowledge_db import knowledge_db

    logger.info(f"[Community] 📝 开始为 L{level} 的 {len(comm_nodes)} 个社区生成摘要...")
    community_records = []
    # 限制每层最多处理的社区数量，防止 token 爆炸（对于 L2 粗粒度通常很少，L0 精细层可能较多）
    max_comms = 20 if level > 0 else 50
    sorted_comms = sorted(comm_nodes.items(), key=lambda x: -len(x[1]))[:max_comms]
    total = len(sorted_comms)

    async with httpx.AsyncClient(timeout=40.0) as client:
        for idx, (comm_id, node_texts) in enumerate(sorted_comms, start=1):
            node_set = set(node_texts)
            internal_rels: List[str] = []
            for (src, tgt), labels in edge_labels.items():
                if src in node_set and tgt in node_set:
                    for lbl in labels:
                        internal_rels.append(f"  - {src} --[{lbl}]--> {tgt}")
                    if len(internal_rels) >= 30: break

            entities_str = "、".join(node_texts[:40])
            relations_str = "\n".join(internal_rels) if internal_rels else "（无内部关系）"

            # 默认值
            res_data = {
                "title": f"L{level} 社区 {comm_id}",
                "summary": f"包含 {len(node_texts)} 个实体：{entities_str[:150]}",
                "key_findings": [],
                "impact_score": 5,
                "central_entities": node_texts[:3]
            }

            try:
                prompt = _SUMMARY_PROMPT.format(entities=entities_str, relations=relations_str)
                resp = await client.post(
                    llm_url,
                    headers={"Authorization": f"Bearer {llm_key}", "Content-Type": "application/json"},
                    json={
                        "model": llm_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                    },
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"]
                match = re.search(r'\{[\s\S]*?\}', raw)
                if match:
                    parsed = json.loads(match.group(0))
                    for key in res_data:
                        if key in parsed: res_data[key] = parsed[key]
                logger.info(f"[Community] ✔ L{level} [{idx}/{total}] 摘要成功: 「{res_data['title']}」")
            except Exception as e:
                logger.warning(f"[Community] ⚠ L{level} [{idx}/{total}] 摘要失败: {e}")

            community_records.append({
                "community_id": comm_id,
                **res_data,
                "entity_texts": node_texts,
                "size": len(node_texts),
            })

    await knowledge_db.save_communities(doc_id, user_id, community_records, level=level)
    return len(community_records)
