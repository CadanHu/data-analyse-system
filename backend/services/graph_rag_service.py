"""
GraphRAG 服务：从用户问题中提取实体，查询知识图谱，返回可注入 Prompt 的上下文字符串。
仅供 Web 端 RAG 模式使用，移动端有独立通道。
"""
import json
import re
import logging
import asyncio
from typing import List, Dict, Any, Optional

from database.knowledge_db import knowledge_db
from services.llm_factory import llm_factory
from config import DEFAULT_PROVIDER

logger = logging.getLogger(__name__)

# 问题过短或实体提取失败时的 fallback：直接用 jieba 分词取名词
def _jieba_extract(text: str) -> List[str]:
    try:
        import jieba.posseg as pseg
        words = pseg.cut(text)
        # 取名词（n）、专名（nr/ns/nt/nz）、英文（eng）
        return [w.word for w, f in words if f.startswith('n') or f == 'eng' if len(w.word) > 1]
    except Exception:
        # jieba 未安装时，用简单正则取 2+ 字的词
        return re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]{2,}', text)[:8]


class GraphRAGService:
    """
    主入口：search()
    流程：
      1. extract_entities_from_question() → 从问题中提取实体名列表
      2. knowledge_db.multi_hop_traverse()  → BFS 遍历图谱
      3. _format_context()                  → 格式化为可注入 Prompt 的字符串
    """

    async def extract_entities_from_question(
        self,
        question: str,
        history: str,
        provider: str = None,
        model_name: str = None,
    ) -> List[str]:
        """
        用轻量 LLM 调用从问题中抽取实体名。
        失败时 fallback 到 jieba 分词。
        """
        provider = provider or DEFAULT_PROVIDER
        context = f"对话历史（最近）：\n{history[-300:]}\n\n" if history else ""
        prompt = (
            f"{context}请从下面的问题中抽取出人名、机构名、产品名、地名等关键实体。\n"
            f"只输出 JSON 数组，例如：[\"阿里巴巴\", \"马云\", \"杭州\"]。不要输出任何其他内容。\n\n"
            f"问题：{question}"
        )
        try:
            llm = llm_factory.get_langchain_model(
                provider=provider,
                model_name=model_name,
                temperature=0.0,
            )
            from langchain_core.messages import HumanMessage
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            raw = response.content
            if isinstance(raw, list):
                raw = "".join(
                    p.get("text", "") for p in raw
                    if isinstance(p, dict) and p.get("type") == "text"
                )
            match = re.search(r'\[.*?\]', raw, re.DOTALL)
            if match:
                entities = json.loads(match.group(0))
                if isinstance(entities, list) and entities:
                    return [str(e).strip() for e in entities if e]
        except Exception as e:
            logger.debug(f"[GraphRAG] LLM 实体提取失败，使用 jieba fallback: {e}")

        return _jieba_extract(question)

    async def search(
        self,
        question: str,
        history: str,
        user_id: int,
        provider: str = None,
        model_name: str = None,
    ) -> str:
        """
        主入口：返回可直接注入 Prompt 的图谱上下文字符串。
        若图谱中没有相关数据，返回空字符串（不影响原有流程）。
        """
        try:
            logger.info(f"[GraphRAG] 🔍 本地搜索: user={user_id}")
            entities = await self.extract_entities_from_question(
                question, history, provider, model_name
            )
            if not entities:
                logger.info("[GraphRAG] 未提取到实体，跳过图谱检索")
                return ""

            logger.info(f"[GraphRAG] 提取到实体: {entities}")
            # 1. BFS 关系遍历
            graph_data = await knowledge_db.multi_hop_traverse(
                start_texts=entities,
                user_id=user_id,
                hops=2,
            )

            # 2. 社区摘要增强 (Phase 4)
            community_context = ""
            try:
                # 查找这些实体属于哪些 L0 (精细) 社区
                communities = await knowledge_db.get_communities_for_entities(
                    entities=graph_data["entities"],
                    user_id=user_id,
                    level=0
                )
                if communities:
                    lines = ["相关社区背景："]
                    for c in communities[:3]:  # 最多取前 3 个相关社区
                        lines.append(f"- {c['title']}: {c['summary']}")
                    community_context = "\n".join(lines)
            except Exception as ce:
                logger.warning(f"[GraphRAG] 社区增强检索失败: {ce}")

            rel_count = len(graph_data["relations"])
            entity_count = len(graph_data["entities"])
            if not rel_count and not community_context:
                logger.info("[GraphRAG] 图谱遍历未找到相关数据")
                return ""

            logger.info(f"[GraphRAG] ✔ 遍历完成: {entity_count} 实体, {rel_count} 关系, {bool(community_context)} 社区背景")
            return self._format_context(entities, graph_data, community_context)
        except Exception as e:
            logger.warning(f"[GraphRAG] search 异常（跳过图谱注入）: {e}")
            return ""

    async def global_search(
        self,
        user_id: int,
        doc_id: Optional[str] = None,
        top_k: int = 8,
    ) -> str:
        """
        全局搜索：从 knowledge_communities 取社区摘要，格式化为可注入 Prompt 的字符串。
        用于向后兼容，仅提供上下文注入。
        """
        try:
            logger.info(f"[GraphRAG] 🌐 全局搜索 (上下文模式): user={user_id}, doc={doc_id or '全部'}")
            # 优先取 L2 粗粒度社区，如果没有则取 L0
            communities = await knowledge_db.get_communities(user_id, doc_id=doc_id, level=2)
            if not communities:
                communities = await knowledge_db.get_communities(user_id, doc_id=doc_id, level=0)

            if not communities:
                logger.info("[GraphRAG] 全局搜索: 暂无社区摘要数据")
                return ""

            top_communities = communities[:top_k]
            logger.info(f"[GraphRAG] ✔ 全局搜索命中 {len(top_communities)}/{len(communities)} 个社区")

            lines = ["【知识图谱社区摘要】"]
            for c in top_communities:
                lines.append(f"\n▌ {c['title']}（涉及 {c['size']} 个实体）")
                lines.append(c["summary"])

            return "\n".join(lines)
        except Exception as e:
            logger.warning(f"[GraphRAG] global_search 异常: {e}")
            return ""

    async def global_search_mapreduce(
        self,
        question: str,
        user_id: int,
        level: int = 2,
        doc_id: Optional[str] = None,
        provider: str = None,
        model_name: str = None,
    ) -> str:
        """
        Map-Reduce 全局搜索 (Phase 3)：
        1. Map: 并发让 LLM 根据每个社区摘要回答问题。
        2. Reduce: 汇总所有局部答案，生成最终全局答案。
        直接返回答案字符串。
        """
        try:
            logger.info(f"[GraphRAG] 🌍 Map-Reduce 全局搜索: level={level}, user={user_id}")
            communities = await knowledge_db.get_communities(user_id, doc_id=doc_id, level=level)
            if not communities:
                # Fallback to level 0
                communities = await knowledge_db.get_communities(user_id, doc_id=doc_id, level=0)

            if not communities:
                return "暂无知识图谱社区数据，无法进行全局分析。"

            # 限制社区数量，避免费用过高
            communities = communities[:10]
            logger.info(f"[GraphRAG] Map 阶段: 正在分析 {len(communities)} 个社区...")

            from langchain_core.messages import HumanMessage
            llm = llm_factory.get_langchain_model(
                provider=provider, model_name=model_name, temperature=0.0
            )

            # --- Step 1: Map (并发) ---
            semaphore = asyncio.Semaphore(5)  # 限制并发数

            async def map_community(comm: Dict) -> str:
                async with semaphore:
                    prompt = (
                        f"你是一个分析专家。请根据以下提供的社区报告，回答用户提出的问题。\n"
                        f"如果报告中没有相关信息，请简要说明。\n\n"
                        f"【社区报告：{comm['title']}】\n"
                        f"摘要：{comm['summary']}\n"
                        f"关键发现：{', '.join(comm.get('key_findings', []))}\n\n"
                        f"用户问题：{question}\n\n"
                        f"请提供针对该社区的局部分析回答："
                    )
                    try:
                        resp = await llm.ainvoke([HumanMessage(content=prompt)])
                        return f"### 社区: {comm['title']}\n{resp.content}"
                    except Exception as e:
                        return f"### 社区: {comm['title']}\n(分析失败: {e})"

            tasks = [map_community(c) for c in communities]
            partial_answers = await asyncio.gather(*tasks)

            # --- Step 2: Reduce ---
            logger.info("[GraphRAG] Reduce 阶段: 汇总结果...")
            all_partials = "\n\n---\n\n".join(partial_answers)
            reduce_prompt = (
                f"你是一个资深分析师。以下是对多个知识社区针对同一个问题的局部分析报告。\n"
                f"请你综合这些局部分析，给出一个完整、系统、有深度的最终回答。\n\n"
                f"用户问题：{question}\n\n"
                f"【局部分析汇总】\n"
                f"{all_partials}\n\n"
                f"请给出最终综合回答："
            )

            final_resp = await llm.ainvoke([HumanMessage(content=reduce_prompt)])
            logger.info("[GraphRAG] ✔ Map-Reduce 全局搜索完成")
            return str(final_resp.content)

        except Exception as e:
            logger.error(f"[GraphRAG] global_search_mapreduce 异常: {e}")
            return f"全局搜索执行失败: {e}"

    def _format_context(self, query_entities: List[str], graph_data: Dict, community_context: str = "") -> str:
        """
        将图谱数据格式化为 Prompt 友好的文本段落。
        """
        lines = ["【知识图谱上下文】"]
        lines.append(f"查询实体：{', '.join(query_entities)}")

        if community_context:
            lines.append(f"\n{community_context}")

        relations = graph_data.get("relations", [])
        if relations:
            lines.append("\n关系链：")
            for rel in relations[:30]:  # 最多注入 30 条，避免 token 过多
                src = rel.get("source", "")
                rtype = rel.get("relation", "")
                tgt = rel.get("target", "")
                lines.append(f"  - {src} --[{rtype}]--> {tgt}")

        return "\n".join(lines)


# 全局单例
graph_rag_service = GraphRAGService()
