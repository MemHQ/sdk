"""MemHQ — the Mem0-style memory layer for AI agents.

Quick start::

    from memhq import MemoryClient

    client = MemoryClient(api_key="mem_...")
    client.add(
        messages=[{"role": "user", "content": "I love pizza"}],
        user_id="user_123",
    )
    results = client.search("food preferences", user_id="user_123")
    answer = client.ask("What does the user like to eat?", user_id="user_123")

The async equivalent lives at :class:`memhq.AsyncMemoryClient`.
"""

from memhq.client import MemoryClient
from memhq.async_client import AsyncMemoryClient
from memhq.types import (
    Memory,
    SearchResult,
    AskResult,
    Citation,
    AddResult,
    MemHQError,
    AuthError,
    NotFoundError,
    RateLimitError,
)

__all__ = [
    "MemoryClient",
    "AsyncMemoryClient",
    "Memory",
    "SearchResult",
    "AskResult",
    "Citation",
    "AddResult",
    "MemHQError",
    "AuthError",
    "NotFoundError",
    "RateLimitError",
]

__version__ = "0.1.0"
