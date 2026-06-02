"""Shared httpx transport for the LlamaIndex adapter.

Hand-rolled (rather than importing the ``memhq`` package) so the
adapter installs cleanly for users who only want the LlamaIndex
surface. Mirrors the official SDK request shape.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Sequence

import httpx

DEFAULT_BASE_URL = "https://api.memhq.ai"
USER_AGENT = "memhq-llamaindex-python/0.1.0"


def _resolve(api_key: Optional[str], base_url: Optional[str]) -> tuple[str, str]:
    key = api_key or os.environ.get("MEMHQ_API_KEY")
    if not key:
        raise ValueError(
            "MemHQ API key not provided. Pass api_key=... or set MEMHQ_API_KEY."
        )
    url = (base_url or os.environ.get("MEMHQ_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    return key, url


class _Transport:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ) -> None:
        self._api_key, self._base_url = _resolve(api_key, base_url)
        self._headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        self._timeout = timeout

    def post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        with httpx.Client(
            base_url=self._base_url, headers=self._headers, timeout=self._timeout
        ) as c:
            resp = c.post(path, json=body)
            resp.raise_for_status()
            return resp.json()

    async def apost(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=self._timeout
        ) as c:
            resp = await c.post(path, json=body)
            resp.raise_for_status()
            return resp.json()


def add_messages(
    transport: _Transport,
    *,
    user_id: str,
    messages: Sequence[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {"user_id": user_id, "messages": list(messages)}
    if metadata:
        body["metadata"] = metadata
    return transport.post("/v1/memhq/add", body)


def search(
    transport: _Transport,
    *,
    query: str,
    user_id: str,
    limit: int = 10,
    mode: str = "hybrid",
) -> List[Dict[str, Any]]:
    body = {"query": query, "user_id": user_id, "limit": limit, "mode": mode}
    resp = transport.post("/v1/memhq/search", body)
    return list(resp.get("results", []))


async def asearch(
    transport: _Transport,
    *,
    query: str,
    user_id: str,
    limit: int = 10,
    mode: str = "hybrid",
) -> List[Dict[str, Any]]:
    body = {"query": query, "user_id": user_id, "limit": limit, "mode": mode}
    resp = await transport.apost("/v1/memhq/search", body)
    return list(resp.get("results", []))
