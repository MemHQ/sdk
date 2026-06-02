"""Shared HTTP helpers for the sync and async clients.

Both clients build the same request shape (URL, headers, JSON body) and
classify errors the same way. We factor that out here so behavior stays
in lockstep.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional, Tuple

from memhq.types import (
    AuthError,
    MemHQError,
    NotFoundError,
    RateLimitError,
)


DEFAULT_BASE_URL = "https://api.memhq.ai"
USER_AGENT = "memhq-python/0.1.0"


def resolve_config(
    api_key: Optional[str],
    base_url: Optional[str],
) -> Tuple[str, str]:
    """Resolve api_key + base_url, falling back to env vars.

    Raises ``ValueError`` if no key is configured.
    """
    key = api_key or os.environ.get("MEMHQ_API_KEY")
    if not key:
        raise ValueError(
            "MemHQ API key not provided. Pass api_key= or set MEMHQ_API_KEY."
        )
    url = base_url or os.environ.get("MEMHQ_BASE_URL") or DEFAULT_BASE_URL
    return key, url.rstrip("/")


def build_headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }


def raise_for_status(status_code: int, body: Any) -> None:
    """Map an HTTP error to the appropriate MemHQ exception.

    ``body`` is the parsed JSON if available, otherwise the raw text.
    """
    if 200 <= status_code < 300:
        return

    if isinstance(body, dict):
        message = str(body.get("error") or body.get("message") or "MemHQ request failed")
        code = body.get("code")
    else:
        message = str(body) if body else f"MemHQ request failed (status {status_code})"
        code = None

    kwargs: Dict[str, Any] = {
        "status_code": status_code,
        "code": code,
        "body": body if isinstance(body, dict) else {"raw": body},
    }

    if status_code == 401 or status_code == 403:
        raise AuthError(message, **kwargs)
    if status_code == 404:
        raise NotFoundError(message, **kwargs)
    if status_code == 429:
        raise RateLimitError(message, **kwargs)
    raise MemHQError(message, **kwargs)
