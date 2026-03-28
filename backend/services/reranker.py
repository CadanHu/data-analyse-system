"""
多因子重排器 (Multi-factor Reranker)

对 Chroma 初检结果做加权融合重排，替代单一向量相似度排序。

4 个因子：
  vec      (0.50) — 向量余弦相似度（Chroma 原始分数归一化）
  bm25     (0.30) — 关键词匹配（TF-IDF 近似，sklearn 已有，零新依赖）
  recency  (0.10) — 时间新鲜度（metadata.uploaded_at 指数衰减，半衰期 30 天）
  session  (0.10) — 当前会话优先（metadata.session_id 与查询会话匹配则加权）

调用方：vector_store.VectorStore.search()
"""

from __future__ import annotations
import time
import math
from typing import List, Dict, Optional

import numpy as np

# ─── 默认权重（各因子之和应为 1.0）────────────────────────────────────────────
DEFAULT_WEIGHTS = {
    "vec":     0.50,
    "bm25":    0.30,
    "recency": 0.10,
    "session": 0.10,
}

# recency 衰减半衰期（秒），30 天
_RECENCY_HALF_LIFE_SECS = 30 * 24 * 3600


class Reranker:
    """
    多因子重排器。无状态，可作为全局单例使用。

    用法：
        reranker = Reranker()
        ranked = reranker.rerank(query, candidates, current_session_id="xxx")
    """

    def rerank(
        self,
        query: str,
        candidates: List[Dict],
        current_session_id: Optional[str] = None,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Dict]:
        """
        对候选结果多因子重排。

        Args:
            query: 用户查询文本
            candidates: Chroma 初检结果，每条格式：
                {"content": str, "metadata": dict, "vec_score": float}
            current_session_id: 当前会话 ID（用于 session_boost 因子）
            weights: 可选，覆盖默认权重

        Returns:
            按 final_score 降序排列的 candidates，
            每条附加 "final_score" 和 "scores" 字段（调试用）
        """
        if not candidates:
            return []

        w = {**DEFAULT_WEIGHTS, **(weights or {})}

        vec_scores     = self._normalize([c.get("vec_score", 0.0) for c in candidates])
        bm25_scores    = self._score_bm25(query, candidates)
        recency_scores = self._score_recency(candidates)
        session_scores = self._score_session(candidates, current_session_id)

        results = []
        for i, c in enumerate(candidates):
            final = (
                w["vec"]     * vec_scores[i]
                + w["bm25"]    * bm25_scores[i]
                + w["recency"] * recency_scores[i]
                + w["session"] * session_scores[i]
            )
            results.append({
                **c,
                "final_score": round(final, 4),
                "scores": {
                    "vec":     round(vec_scores[i], 4),
                    "bm25":    round(bm25_scores[i], 4),
                    "recency": round(recency_scores[i], 4),
                    "session": round(session_scores[i], 4),
                },
            })

        results.sort(key=lambda x: x["final_score"], reverse=True)
        return results

    # ─── 因子计算 ──────────────────────────────────────────────────────────────

    def _score_bm25(self, query: str, candidates: List[Dict]) -> List[float]:
        """
        用 TF-IDF + 余弦相似度近似 BM25 关键词匹配分。
        全部候选文本（含 query）作为语料，计算 query 与每条的余弦相似度。
        若 sklearn 未安装或语料为空，降级返回全 0.5（中性）。
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity

            texts = [c["content"] for c in candidates]
            if not any(texts):
                return [0.5] * len(candidates)

            corpus = [query] + texts
            vectorizer = TfidfVectorizer(
                analyzer="char_wb",   # 字符级 n-gram，对中文无需分词
                ngram_range=(2, 4),
                min_df=1,
                sublinear_tf=True,
            )
            tfidf_matrix = vectorizer.fit_transform(corpus)
            # query 是第 0 行，candidates 从第 1 行开始
            sims = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
            return self._normalize(sims.tolist())

        except Exception as e:
            print(f"⚠️ [Reranker] BM25 计算失败，降级为 0.5: {e}")
            return [0.5] * len(candidates)

    def _score_recency(self, candidates: List[Dict]) -> List[float]:
        """
        基于 metadata["uploaded_at"]（Unix timestamp 字符串）的时间衰减分。
        衰减函数：score = exp(-λ × Δt)，λ = ln(2) / half_life
        无 uploaded_at 字段时得 0.5（中性，不影响其他因子）。
        """
        now = time.time()
        lam = math.log(2) / _RECENCY_HALF_LIFE_SECS
        scores = []
        for c in candidates:
            uploaded_at = c.get("metadata", {}).get("uploaded_at")
            if uploaded_at:
                try:
                    delta = max(0.0, now - float(uploaded_at))
                    scores.append(math.exp(-lam * delta))
                except (ValueError, TypeError):
                    scores.append(0.5)
            else:
                scores.append(0.5)
        return scores   # 已在 [0,1] 范围内，无需再归一化

    def _score_session(
        self,
        candidates: List[Dict],
        current_session_id: Optional[str],
    ) -> List[float]:
        """
        当前会话文档优先：metadata["session_id"] 与 current_session_id 匹配得 1.0，否则 0.0。
        global 模式（current_session_id=None）时全部得 0.0，session 因子失效。
        """
        if not current_session_id:
            return [0.0] * len(candidates)
        return [
            1.0 if c.get("metadata", {}).get("session_id") == current_session_id else 0.0
            for c in candidates
        ]

    # ─── 工具方法 ──────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(scores: List[float]) -> List[float]:
        """
        Min-max 归一化到 [0, 1]。
        若全部值相同（包括全 0），返回全 0.5（中性）。
        """
        if not scores:
            return []
        arr = np.array(scores, dtype=float)
        mn, mx = arr.min(), arr.max()
        if mx - mn < 1e-9:
            return [0.5] * len(scores)
        return ((arr - mn) / (mx - mn)).tolist()


# 全局单例
_reranker: Optional[Reranker] = None


def get_reranker() -> Reranker:
    global _reranker
    if _reranker is None:
        _reranker = Reranker()
    return _reranker
