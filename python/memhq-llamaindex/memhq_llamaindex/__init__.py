"""MemHQ adapter for LlamaIndex.

Two integrations:

* :class:`MemHQMemory` — implements ``llama_index.core.memory.BaseMemory``.
  Plug into ``ReActAgent``, ``OpenAIAgent``, or any chat engine that
  accepts a memory.
* :class:`MemHQRetriever` — implements
  ``llama_index.core.retrievers.BaseRetriever``. Plug into
  ``RetrieverQueryEngine`` and friends.
"""

from memhq_llamaindex.memory import MemHQMemory
from memhq_llamaindex.retriever import MemHQRetriever

__all__ = ["MemHQMemory", "MemHQRetriever"]

__version__ = "0.1.0"
