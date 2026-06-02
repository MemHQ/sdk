# memhq — Python SDK for MemHQ

The official Python client for [MemHQ](https://memhq.ai), a drop-in memory
layer for AI agents. Same shape as Mem0, with a built-in synthesis pass
(`ask()`) for cited answers.

## Install

```bash
pip install memhq
```

## Quickstart

```python
import os
from memhq import MemoryClient

client = MemoryClient(api_key=os.environ["MEMHQ_API_KEY"])

# 1. Add — auto-creates the user + default thread
client.add(
    messages=[{"role": "user", "content": "I'm a vegetarian, allergic to nuts."}],
    user_id="user_123",
)

# 2. Search — hybrid retrieval (BM25 + vector + graph)
results = client.search("dietary restrictions", user_id="user_123")
for memory in results:
    print(memory.score, memory.content)

# 3. Ask — synthesized answer with citations
answer = client.ask("What should I avoid eating?", user_id="user_123")
print(answer.text)
for cit in answer.citations:
    print(" •", cit.content)
```

## Async

```python
import asyncio
from memhq import AsyncMemoryClient

async def main():
    async with AsyncMemoryClient() as client:  # picks up MEMHQ_API_KEY
        await client.add(
            messages=[{"role": "user", "content": "I live in Brooklyn"}],
            user_id="user_123",
        )
        result = await client.ask("Where does the user live?", user_id="user_123")
        print(result.text)

asyncio.run(main())
```

## Configuration

| Env var          | Default                  | Notes                                |
| ---------------- | ------------------------ | ------------------------------------ |
| `MEMHQ_API_KEY`  | _(required)_             | Get one from the dashboard.          |
| `MEMHQ_BASE_URL` | `https://api.memhq.ai`   | Override for self-host or local dev. |

```python
# Self-hosted MemoryOS or local development
client = MemoryClient(api_key="...", base_url="http://localhost:3000")
```

## Reference

### `client.add(messages, *, user_id, group_id=None, metadata=None) -> AddResult`

Ingest one or more messages into the user's memory graph. Extraction runs
asynchronously on the server — typically completes in under three seconds.

### `client.search(query, *, user_id=None, group_ids=None, limit=10) -> SearchResult`

Hybrid search across the user's graph plus any shared group graphs. Returns
an iterable `SearchResult`; each element is a `Memory(id, content, type, score)`.

### `client.ask(question, *, user_id=None, group_ids=None, limit=8) -> AskResult`

Retrieve, rerank, and synthesize a cited answer. Returns an `AskResult` with
`answer` (alias: `text`) and a list of `Citation(id, content)`.

### `client.users.get(user_id)`, `client.users.delete(user_id)`, `client.users.list()`

User management. `user_id` accepts the external id you passed to `add()`.

## License

Apache-2.0.
