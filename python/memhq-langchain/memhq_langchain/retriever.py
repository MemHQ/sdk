"""MemHQ-backed LangChain retriever.

Implements ``langchain_core.retrievers.BaseRetriever`` so it works in
``create_retrieval_chain``, ``MultiQueryRetriever``,
``ContextualCompressionRetriever``, and any agent tool wrapper.
"""

from __future__ import annotations

from typing import Any, List, Optional

from langchain_core.callbacks import (
    AsyncCallbackManagerForRetrieverRun,
    CallbackManagerForRetrieverRun,
)
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

from memhq_langchain._client import _Transport, asearch, search


class MemHQRetriever(BaseRetriever):
    """Retriever backed by MemHQ ``/v1/memhq/search``.

    Set on construction:

    * ``api_key`` — MemHQ key (falls back to ``MEMHQ_API_KEY``)
    * ``user_id`` — required, MemHQ is user-scoped
    * ``limit`` — default 10
    * ``mode`` — ``"hybrid"`` (default), ``"vector"``, or ``"lexical"``
    """

    user_id: str
    limit: int = 10
    mode: str = "hybrid"
    api_key: Optional[str] = None
    base_url: Optional[str] = None

    # Allow the httpx transport as a non-pydantic field.
    model_config = {"arbitrary_types_allowed": True}

    _transport: Any = None  # populated in __init__

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        # Build the transport after pydantic validation so env-var
        # resolution happens once per retriever instance.
        object.__setattr__(
            self,
            "_transport",
            _Transport(api_key=self.api_key, base_url=self.base_url),
        )

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        results = search(
            self._transport,
            query=query,
            user_id=self.user_id,
            limit=self.limit,
            mode=self.mode,
        )
        return [_to_document(r) for r in results]

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: AsyncCallbackManagerForRetrieverRun,
    ) -> List[Document]:
        results = await asearch(
            self._transport,
            query=query,
            user_id=self.user_id,
            limit=self.limit,
            mode=self.mode,
        )
        return [_to_document(r) for r in results]


def _to_document(r: dict) -> Document:
    return Document(
        page_content=r.get("content", ""),
        metadata={
            "memory_id": r.get("id"),
            "score": r.get("score"),
            "confidence": r.get("confidence"),
            "type": r.get("type"),
            "source": "memhq",
        },
    )
