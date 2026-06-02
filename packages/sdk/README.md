# @memhq/sdk — TypeScript SDK for MemHQ

The official TypeScript / JavaScript client for [MemHQ](https://memhq.ai),
a drop-in memory layer for AI agents. Same shape as Mem0, with a built-in
synthesis pass (`ask()`) for cited answers. Works in Node 18+, Deno, Bun,
edge runtimes, and browsers.

## Install

```bash
npm install @memhq/sdk
# or
pnpm add @memhq/sdk
# or
yarn add @memhq/sdk
```

## Quickstart

```ts
import { MemoryClient } from "@memhq/sdk";

const client = new MemoryClient({ apiKey: process.env.MEMHQ_API_KEY! });

// 1. Add — auto-creates the user + default thread
await client.add({
  messages: [{ role: "user", content: "I'm a vegetarian, allergic to nuts." }],
  userId: "user_123",
});

// 2. Search — hybrid retrieval (BM25 + vector + graph)
const results = await client.search({
  query: "dietary restrictions",
  userId: "user_123",
});
for (const memory of results.results) {
  console.log(memory.score, memory.content);
}

// 3. Ask — synthesized answer with citations
const answer = await client.ask({
  question: "What should I avoid eating?",
  userId: "user_123",
});
console.log(answer.answer);
for (const cit of answer.citations) {
  console.log(" •", cit.content);
}
```

## Configuration

| Env var          | Default                  | Notes                                |
| ---------------- | ------------------------ | ------------------------------------ |
| `MEMHQ_API_KEY`  | _(required)_             | Get one from the dashboard.          |
| `MEMHQ_BASE_URL` | `https://api.memhq.ai`   | Override for self-host or local dev. |

```ts
// Self-hosted MemoryOS or local development
const client = new MemoryClient({
  apiKey: "...",
  baseUrl: "http://localhost:3000",
});
```

## Reference

### `client.add({ messages, userId, groupId?, metadata? }): Promise<AddResult>`

Ingest one or more messages into the user's memory graph. Extraction runs
asynchronously on the server.

### `client.search({ query, userId?, groupIds?, limit?, mode? }): Promise<SearchResult>`

Hybrid search across the user's graph plus any shared group graphs.

### `client.ask({ question, userId?, groupIds?, limit? }): Promise<AskResult>`

Retrieve, rerank, and synthesize a cited answer.

### `client.users.get(userId)`, `client.users.delete(userId)`, `client.users.list()`

User management. `userId` accepts the external id you passed to `add()`.

## License

Apache-2.0.
