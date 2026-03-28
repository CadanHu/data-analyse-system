"""
GraphRAG 服务：从用户问题中提取实体，查询知识图谱，返回可注入 Prompt 的上下文字符串。
仅供 Web 端 RAG 模式使用，移动端有独立通道。
"""
import json
import re
import logging
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
            graph_data = await knowledge_db.multi_hop_traverse(
                start_texts=entities,
                user_id=user_id,
                hops=2,
            )
            rel_count = len(graph_data["relations"])
            entity_count = len(graph_data["entities"])
            if not rel_count:
                logger.info("[GraphRAG] 图谱遍历未找到相关关系")
                return ""

            logger.info(f"[GraphRAG] ✔ 遍历完成: {entity_count} 实体, {rel_count} 关系")
            return self._format_context(entities, graph_data)
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
        用于宏观问题（"整体讲了什么"、"主要有哪些关系"等）。
        """
        try:
            logger.info(f"[GraphRAG] 🌐 全局搜索: user={user_id}, doc={doc_id or '全部'}")
            communities = await knowledge_db.get_communities(user_id, doc_id=doc_id)
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

    def _format_context(self, query_entities: List[str], graph_data: Dict) -> str:
        """
        将图谱数据格式化为 Prompt 友好的文本段落。
        示例输出：
          【知识图谱上下文】
          查询实体：阿里巴巴、马云
          关系链：
          - 阿里巴巴 --[创始人]--> 马云
          - 阿里巴巴 --[供应商]--> 菜鸟网络
        """
        lines = ["【知识图谱上下文】"]
        lines.append(f"查询实体：{', '.join(query_entities)}")

        relations = graph_data.get("relations", [])
        if relations:
            lines.append("关系链：")
            for rel in relations[:30]:  # 最多注入 30 条，避免 token 过多
                src = rel.get("source", "")
                rtype = rel.get("relation", "")
                tgt = rel.get("target", "")
                lines.append(f"  - {src} --[{rtype}]--> {tgt}")

        return "\n".join(lines)


# 全局单例
graph_rag_service = GraphRAGService()
