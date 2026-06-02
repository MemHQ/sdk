"""MemHQ adapter for LangChain.

Two integrations:

* :class:`MemHQChatMessageHistory` — drop-in chat history. Wire into
  ``RunnableWithMessageHistory`` or any chain that takes a
  :class:`langchain_core.chat_history.BaseChatMessageHistory`.
* :class:`MemHQRetriever` — drop-in retriever. Plug into
  :func:`langchain.chains.retrieval.create_retrieval_chain`,
  ``MultiQueryRetriever``, ``ContextualCompressionRetriever``, etc.

Quick start::

    from memhq_langchain import MemHQChatMessageHistory

    history = MemHQChatMessageHistory(
        api_key="mem_...",
        session_id="conv_42",
        user_id="user_42",
    )
"""

from memhq_langchain.message_history import MemHQChatMessageHistory
from memhq_langchain.retriever import MemHQRetriever

__all__ = ["MemHQChatMessageHistory", "MemHQRetriever"]

__version__ = "0.1.0"
