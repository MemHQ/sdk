"""Asynchronous MemHQ client — mirror of :class:`memhq.MemoryClient`.

Use this when your application is async (FastAPI, aiohttp servers,
asyncio-based agents). The API surface is identical; every method is
``async``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import httpx

from memhq._http import (
    build_headers,
    raise_for_status,
    resolve_config,
)
from memhq.types import (
    AddResult,
    AskResult,
    SearchResult,
)


class _AsyncUsersAPI:
    def __init__(self, client: "AsyncMemoryClient") -> None:
        self._client = client

    async def get(self, user_id: str) -> Dict[str, Any]:
        resolved = await self._client._resolve_internal_user_id(user_id)
        return await self._client._request("GET", f"/v1/users/{resolved}")

    async def delete(self, user_id: str) -> Dict[str, Any]:
        resolved = await self._client._resolve_internal_user_id(user_id)
        return await self._client._request("DELETE", f"/v1/users/{resolved}")

    async def list(self) -> List[Dict[str, Any]]:
        resp = await self._client._request("GET", "/v1/users")
        return resp.get("users", [])


class AsyncMemoryClient:
    """Async drop-in for :class:`MemoryClient`.

    Use as an async context manager so the underlying connection pool
    is closed cleanly::

        async with AsyncMemoryClient(api_key="...") as client:
            await client.add(...)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ) -> None:
        self._api_key, self._base_url = resolve_config(api_key, base_url)
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=build_headers(self._api_key),
            timeout=timeout,
        )
        self.users = _AsyncUsersAPI(self)

    # ── public methods ──────────────────────────────────────────

    async def add(
        self,
        messages: Sequence[Dict[str, Any]],
        *,
        user_id: str,
        group_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AddResult:
        body: Dict[str, Any] = {
            "user_id": user_id,
            "messages": list(messages),
        }
        if group_id is not None:
            body["group_id"] = group_id
        if metadata is not None:
            body["metadata"] = metadata
        return AddResult.from_dict(await self._request("POST", "/v1/memhq/add", json=body))

    async def search(
        self,
        query: str,
        *,
        user_id: Optional[str] = None,
        group_ids: Optional[Sequence[str]] = None,
        limit: int = 10,
        mode: str = "hybrid",
    ) -> SearchResult:
        body: Dict[str, Any] = {"query": query, "limit": limit, "mode": mode}
        if user_id is not None:
            body["user_id"] = user_id
        if group_ids:
            body["group_ids"] = list(group_ids)
        return SearchResult.from_dict(await self._request("POST", "/v1/memhq/search", json=body))

    async def ask(
        self,
        question: str,
        *,
        user_id: Optional[str] = None,
        group_ids: Optional[Sequence[str]] = None,
        limit: int = 8,
    ) -> AskResult:
        body: Dict[str, Any] = {"question": question, "limit": limit}
        if user_id is not None:
            body["user_id"] = user_id
        if group_ids:
            body["group_ids"] = list(group_ids)
        return AskResult.from_dict(await self._request("POST", "/v1/memhq/ask", json=body))

    # ── lifecycle ─────────────────────────────────────────────

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncMemoryClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    # ── internals ─────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        response = await self._client.request(method, path, json=json)
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise_for_status(response.status_code, body)
        return body if isinstance(body, dict) else {}

    async def _resolve_internal_user_id(self, external_or_internal: str) -> str:
        users = (await self._request("GET", "/v1/users")).get("users", [])
        for u in users:
            if u.get("externalId") == external_or_internal or u.get("id") == external_or_internal:
                return str(u["id"])
        return external_or_internal
