# MemHQ SDKs & Adapters

Official client libraries for [MemHQ](https://memhq.ai) — hosted memory infrastructure for AI agents.

These are thin, open-source clients over the MemHQ REST API. The MemHQ service itself is a hosted product; sign up at [memhq.ai](https://memhq.ai) to get an API key.

## Packages

### JavaScript / TypeScript (npm)

| Package | Description |
|---|---|
| [`@memhq/sdk`](./packages/sdk) | Core TypeScript SDK — `add`, `search`, `ask` |
| [`@memhq/mcp-server`](./packages/mcp-server) | Model Context Protocol server (stdio + HTTP) |
| [`@memhq/langchain`](./packages/langchain) | LangChain.js chat history + retriever |
| [`@memhq/vercel-ai`](./packages/vercel-ai) | Vercel AI SDK tools |
| [`@memhq/llamaindex`](./packages/llamaindex) | LlamaIndex.TS memory + retriever |

```bash
npm install @memhq/sdk
```

### Python (PyPI)

| Package | Description |
|---|---|
| [`memhq`](./python/memhq) | Core Python SDK |
| [`memhq-langchain`](./python/memhq-langchain) | LangChain (Python) integration |
| [`memhq-llamaindex`](./python/memhq-llamaindex) | LlamaIndex (Python) integration |

```bash
pip install memhq
```

## Quickstart

```ts
import { MemHQ } from "@memhq/sdk";

const memhq = new MemHQ({ apiKey: process.env.MEMHQ_API_KEY });

await memhq.add({ messages: [{ role: "user", content: "I prefer dark roast coffee" }], userId: "u1" });
const results = await memhq.search({ query: "coffee preference", userId: "u1" });
const answer = await memhq.ask({ question: "What coffee do I like?", userId: "u1" });
```

Full docs: [memhq.ai/docs](https://memhq.ai/docs)

## License

Apache-2.0. See [LICENSE](./LICENSE).
