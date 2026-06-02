"""Typed dataclasses for MemHQ SDK responses.

We use stdlib `dataclasses` rather than pydantic to keep the SDK
dependency-light. The server is the source of truth for validation —
the SDK just deserializes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ─────────────────────────────────────────────
# Result types
# ─────────────────────────────────────────────


@dataclass
class Memory:
    """A single memory record returned from MemHQ."""

    id: str
    content: str
    type: str
    score: Optional[float] = None
    confidence: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Memory":
        return cls(
            id=str(d.get("id", "")),
            content=str(d.get("content", "")),
            type=str(d.get("type", "")),
            score=d.get("score"),
            confidence=d.get("confidence"),
            raw=d,
        )


@dataclass
class SearchResult:
    """Result of a :meth:`MemoryClient.search` call.

    Iterating over a ``SearchResult`` yields :class:`Memory` items, so
    ``for memory in client.search(...)`` works as expected.
    """

    results: List[Memory]
    total: int
    query: str
    latency_ms: Optional[int] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def __iter__(self):
        return iter(self.results)

    def __len__(self) -> int:
        return len(self.results)

    def __getitem__(self, idx: int) -> Memory:
        return self.results[idx]

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "SearchResult":
        return cls(
            results=[Memory.from_dict(r) for r in d.get("results", [])],
            total=int(d.get("total", 0)),
            query=str(d.get("query", "")),
            latency_ms=d.get("latency_ms"),
            raw=d,
        )


@dataclass
class Citation:
    """A single citation backing an answer from :meth:`MemoryClient.ask`."""

    id: str
    content: str
    type: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Citation":
        return cls(
            id=str(d.get("id", "")),
            content=str(d.get("content", "")),
            type=d.get("type"),
        )


@dataclass
class AskResult:
    """Synthesized answer with citations."""

    answer: str
    citations: List[Citation]
    question_mode: Optional[str] = None
    refused: bool = False
    latency_ms: Optional[int] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    # Alias for ergonomic access — `answer.text` reads more naturally
    # than `answer.answer` in conversational code.
    @property
    def text(self) -> str:
        return self.answer

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "AskResult":
        return cls(
            answer=str(d.get("answer", "")),
            citations=[Citation.from_dict(c) for c in d.get("citations", [])],
            question_mode=d.get("question_mode"),
            refused=bool(d.get("refused", False)),
            latency_ms=d.get("latency_ms"),
            raw=d,
        )


@dataclass
class AddResult:
    """Result of :meth:`MemoryClient.add` — pointers, not the extracted memories.

    Extraction is asynchronous on the server. Use :meth:`MemoryClient.search`
    or poll :attr:`thread_id` for status once the queue has run.
    """

    user_id: str
    thread_id: str
    memories_queued: int
    messages_stored: int
    internal_user_id: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "AddResult":
        return cls(
            user_id=str(d.get("user_id", "")),
            thread_id=str(d.get("thread_id", "")),
            memories_queued=int(d.get("memories_queued", 0)),
            messages_stored=int(d.get("messages_stored", 0)),
            internal_user_id=d.get("internal_user_id"),
            raw=d,
        )


# ─────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────


class MemHQError(Exception):
    """Base class for all MemHQ SDK errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        code: Optional[str] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.body = body or {}


class AuthError(MemHQError):
    """401 — invalid or missing API key."""


class NotFoundError(MemHQError):
    """404 — the requested resource doesn't exist in this project."""


class RateLimitError(MemHQError):
    """429 — quota or rate limit exceeded."""
