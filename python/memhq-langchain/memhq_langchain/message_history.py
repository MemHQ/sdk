"""MemHQ-backed chat message history.

Implements ``langchain_core.chat_history.BaseChatMessageHistory`` so the
adapter slots into ``RunnableWithMessageHistory`` and any chain that
expects a chat history object. Reads return the top-k memories most
relevant to the session, shaped as LangChain messages.
"""

from __future__ import annotations

from typing import List, Optional

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from memhq_langchain._client import _Transport, add_messages, search


def _role(message: BaseMessage) -> str:
    if isinstance(message, HumanMessage):
        return "user"
    if isinstance(message, AIMessage):
        return "assistant"
    if isinstance(message, SystemMessage):
        return "system"
    if isinstance(message, ToolMessage):
        return "tool"
    return "user"


def _stringify(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return "\n".join(p for p in parts if p)
    return str(content)


class MemHQChatMessageHistory(BaseChatMessageHistory):
    """LangChain chat history backed by MemHQ.

    Parameters
    ----------
    api_key:
        MemHQ API key. Falls back to ``MEMHQ_API_KEY``.
    session_id:
        Session identifier used as the MemHQ thread anchor.
    user_id:
        External user id. Required — MemHQ is user-scoped.
    base_url:
        Override the API base URL.
    recall_limit:
        How many memories to surface on each history read. Default 10.
    """

    def __init__(
        self,
        *,
        session_id: str,
        user_id: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        recall_limit: int = 10,
    ) -> None:
        self._transport = _Transport(api_key=api_key, base_url=base_url)
        self._session_id = session_id
        self._user_id = user_id
        self._recall_limit = recall_limit

    @property
    def messages(self) -> List[BaseMessage]:  # type: ignore[override]
        """Return relevant memories shaped as messages.

        Note: semantic, not chronological. The MemHQ wedge is that
        recall is reranked by relevance — agents don't need to hold
        the full transcript.
        """
        results = search(
            self._transport,
            query=self._session_id,
            user_id=self._user_id,
            limit=self._recall_limit,
        )
        return [SystemMessage(content=r.get("content", "")) for r in results]

    def add_message(self, message: BaseMessage) -> None:
        add_messages(
            self._transport,
            user_id=self._user_id,
            messages=[{"role": _role(message), "content": _stringify(message.content)}],
            metadata={"session_id": self._session_id},
        )

    def add_messages(self, messages: List[BaseMessage]) -> None:  # type: ignore[override]
        if not messages:
            return
        add_messages(
            self._transport,
            user_id=self._user_id,
            messages=[
                {"role": _role(m), "content": _stringify(m.content)} for m in messages
            ],
            metadata={"session_id": self._session_id},
        )

    def clear(self) -> None:
        """No-op. MemHQ does not expose session-scoped delete via the
        hosted API yet. To wipe a user wholesale, use the official
        ``memhq`` SDK's ``users.delete`` method.
        """
        return None
