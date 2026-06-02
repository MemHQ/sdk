"""Synchronous MemHQ client.

The public surface is intentionally tight — three methods (``add``,
``search``, ``ask``) plus a ``users`` namespace for management. This
mirrors the Mem0 SDK shape so existing integrations port with minimal
diff.
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


class _UsersAPI:
    """Sub-namespace for user management. Accessed via ``client.users``."""

    def __init__(self, client: "MemoryClient") -> None:
        self._client = client

    def get(self, user_id: str) -> Dict[str, Any]:
        """Fetch a user by external id (the id you passed to ``add``)."""
        # The /v1/users API is keyed by *internal* id. We resolve the
        # external id by listing — fine for typical fleet sizes; if you
        # have >100k users, call /v1/users directly.
        resolved = self._client._resolve_internal_user_id(user_id)
        return self._client._request("GET", f"/v1/users/{resolved}")

    def delete(self, user_id: str) -> Dict[str, Any]:
        """Delete a user and cascade their graph, threads, and memories."""
        resolved = self._client._resolve_internal_user_id(user_id)
        return self._client._request("DELETE", f"/v1/users/{resolved}")

    def list(self) -> List[Dict[str, Any]]:
        """List all users in the project."""
        resp = self._client._request("GET", "/v1/users")
        return resp.get("users", [])


class MemoryClient:
    """The synchronous MemHQ memory client.

    Parameters
    ----------
    api_key:
        Your MemHQ API key. Falls back to the ``MEMHQ_API_KEY`` env var.
    base_url:
        The API base URL. Defaults to ``https://api.memhq.ai``. For
        self-host or local dev, pass ``http://localhost:3000``.
    timeout:
        Per-request timeout in seconds. Defaults to 60.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ) -> None:
        self._api_key, self._base_url = resolve_config(api_key, base_url)
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=build_headers(self._api_key),
            timeout=timeout,
        )
        self.users = _UsersAPI(self)

    # ── public methods ──────────────────────────────────────────

    def add(
        self,
        messages: Sequence[Dict[str, Any]],
        *,
        user_id: str,
        group_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AddResult:
        """Ingest messages into the user's memory graph.

        ``messages`` is a list of ``{"role": "user"|"assistant"|..., "content": "..."}``
        dicts. Only ``user`` role messages get extracted into memories;
        the others are stored for thread rendering but not indexed.

        Returns immediately — extraction is async. Use :meth:`search`
        once the queue has had a moment to run (typically <3s).
        """
        body: Dict[str, Any] = {
            "user_id": user_id,
            "messages": list(messages),
        }
        if group_id is not None:
            body["group_id"] = group_id
        if metadata is not None:
            body["metadata"] = metadata
        return AddResult.from_dict(self._request("POST", "/v1/memhq/add", json=body))

    def search(
        self,
        query: str,
        *,
        user_id: Optional[str] = None,
        group_ids: Optional[Sequence[str]] = None,
        limit: int = 10,
        mode: str = "hybrid",
    ) -> SearchResult:
        """Search the user's memory (and optionally shared group graphs).

        The hybrid retriever runs BM25 + vector + light graph traversal
        in a single SQL query, then reranks. Returns up to ``limit`` results
        ordered by relevance.
        """
        body: Dict[str, Any] = {"query": query, "limit": limit, "mode": mode}
        if user_id is not None:
            body["user_id"] = user_id
        if group_ids:
            body["group_ids"] = list(group_ids)
        return SearchResult.from_dict(self._request("POST", "/v1/memhq/search", json=body))

    def ask(
        self,
        question: str,
        *,
        user_id: Optional[str] = None,
        group_ids: Optional[Sequence[str]] = None,
        limit: int = 8,
    ) -> AskResult:
        """Ask a question over the user's memory and get a cited answer.

        This is the MemHQ wedge — Mem0 doesn't have a synthesis pass.
        We retrieve, rerank, and synthesize via an LLM, returning the
        answer plus the memories that backed it.
        """
        body: Dict[str, Any] = {"question": question, "limit": limit}
        if user_id is not None:
            body["user_id"] = user_id
        if group_ids:
            body["group_ids"] = list(group_ids)
        return AskResult.from_dict(self._request("POST", "/v1/memhq/ask", json=body))

    # ── lifecycle ─────────────────────────────────────────────

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._client.close()

    def __enter__(self) -> "MemoryClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    # ── internals ─────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        response = self._client.request(method, path, json=json)
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise_for_status(response.status_code, body)
        return body if isinstance(body, dict) else {}

    def _resolve_internal_user_id(self, external_or_internal: str) -> str:
        """Map an external user id to the internal id for /v1/users/:id paths.

        Performs a list-and-filter — acceptable for small projects. Power
        users should call the v1/users API directly with internal ids.
        """
        users = self._request("GET", "/v1/users").get("users", [])
        for u in users:
            if u.get("externalId") == external_or_internal or u.get("id") == external_or_internal:
                return str(u["id"])
        # If we couldn't find it, let the downstream request 404 — the
        # server's error message is more useful than ours.
        return external_or_internal
