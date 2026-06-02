"""MemHQ-backed chat memory for LlamaIndex.

Implements the subset of ``llama_index.core.memory.BaseMemory`` that
agents and chat engines actually call: ``get``, ``get_all``, ``put``,
``set``, ``reset``. The base class moves between minor versions of
LlamaIndex; we use ``Any`` and structural calls to stay compatible.
"""

from __future__ import annotations

from typing import Any, List, Optional

from llama_index.core.base.llms.types import ChatMessage, MessageRole
from llama_index.core.memory.types import BaseMemory

from memhq_llamaindex._client import _Transport, add_messages, search


def _role(message: ChatMessage) -> str:
    role = getattr(message, "role", None)
    if isinstance(role, MessageRole):
        role = role.value
    if role in {"user", "assistant", "system", "tool"}:
        return str(role)
    return "user"


def _content(message: ChatMessage) -> str:
    c = getattr(message, "content", "")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        parts = []
        for p in c:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and p.get("type") == "text":
                parts.append(str(p.get("text", "")))
        return "\n".join(parts)
    return str(c or "")


class MemHQMemory(BaseMemory):
    """LlamaIndex chat memory backed by MemHQ.

    Behaves semantically: ``get`` returns the top-k MemHQ memories
    relevant to this session, not the literal transcript. The wedge:
    agents stop having to choose between context-window pressure and
    knowing about past conversations.
    """

    @classmethod
    def class_name(cls) -> str:
        return "MemHQMemory"

    def __init__(
        self,
        *,
        session_id: str,
        user_id: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        recall_limit: int = 10,
    ) -> None:
        super().__init__()
        self._transport = _Transport(api_key=api_key, base_url=base_url)
        self._session_id = session_id
        self._user_id = user_id
        self._recall_limit = recall_limit

    # ── BaseMemory contract ─────────────────────────────────────

    def get(self, input: Optional[str] = None, **kwargs: Any) -> List[ChatMessage]:
        query = input or self._session_id
        results = search(
            self._transport,
            query=query,
            user_id=self._user_id,
            limit=self._recall_limit,
        )
        return [
            ChatMessage(role=MessageRole.SYSTEM, content=r.get("content", ""))
            for r in results
        ]

    def get_all(self) -> List[ChatMessage]:
        # No literal transcript — return the most relevant recent memories.
        return self.get(input=self._session_id)

    def put(self, message: ChatMessage) -> None:
        add_messages(
            self._transport,
            user_id=self._user_id,
            messages=[{"role": _role(message), "content": _content(message)}],
            metadata={"session_id": self._session_id},
        )

    def set(self, messages: List[ChatMessage]) -> None:
        if not messages:
            return
        add_messages(
            self._transport,
            user_id=self._user_id,
            messages=[
                {"role": _role(m), "content": _content(m)} for m in messages
            ],
            metadata={"session_id": self._session_id},
        )

    def reset(self) -> None:
        """No-op. MemHQ does not expose session-scoped delete via the
        hosted API yet. Use the ``memhq`` SDK's ``users.delete`` to
        wipe a user wholesale.
        """
        return None

    @classmethod
    def from_defaults(cls, **kwargs: Any) -> "MemHQMemory":
        return cls(**kwargs)
