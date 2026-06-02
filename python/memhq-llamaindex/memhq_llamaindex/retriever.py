"""MemHQ-backed LlamaIndex retriever.

Implements ``llama_index.core.retrievers.BaseRetriever`` so it plugs
into ``RetrieverQueryEngine``, ``RouterQueryEngine``, agent tool
factories, etc.
"""

from __future__ import annotations

from typing import List, Optional

from llama_index.core.callbacks import CallbackManager
from llama_index.core.retrievers import BaseRetriever
from llama_index.core.schema import NodeWithScore, QueryBundle, TextNode

from memhq_llamaindex._client import _Transport, asearch, search


class MemHQRetriever(BaseRetriever):
    """Retriever backed by MemHQ ``/v1/memhq/search``."""

    def __init__(
        self,
        *,
        user_id: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        limit: int = 10,
        mode: str = "hybrid",
        callback_manager: Optional[CallbackManager] = None,
    ) -> None:
        super().__init__(callback_manager=callback_manager)
        self._transport = _Transport(api_key=api_key, base_url=base_url)
        self._user_id = user_id
        self._limit = limit
        self._mode = mode

    def _retrieve(self, query_bundle: QueryBundle) -> List[NodeWithScore]:
        results = search(
            self._transport,
            query=query_bundle.query_str,
            user_id=self._user_id,
            limit=self._limit,
            mode=self._mode,
        )
        return [_to_node(r) for r in results]

    async def _aretrieve(self, query_bundle: QueryBundle) -> List[NodeWithScore]:
        results = await asearch(
            self._transport,
            query=query_bundle.query_str,
            user_id=self._user_id,
            limit=self._limit,
            mode=self._mode,
        )
        return [_to_node(r) for r in results]


def _to_node(r: dict) -> NodeWithScore:
    node = TextNode(
        id_=r.get("id", ""),
        text=r.get("content", ""),
        metadata={
            "memory_id": r.get("id"),
            "confidence": r.get("confidence"),
            "type": r.get("type"),
            "source": "memhq",
        },
    )
    return NodeWithScore(node=node, score=float(r.get("score", 0.0)))
