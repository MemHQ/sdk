# @memhq/llamaindex

MemHQ adapter for LlamaIndex.js. Drop-in chat memory and retriever backed by MemHQ.

## Install

```bash
npm install @memhq/llamaindex @memhq/sdk llamaindex
```

## Quickstart — Chat memory

```ts
import { OpenAIAgent } from "llamaindex";
import { MemHQChatMemory } from "@memhq/llamaindex";

const memory = new MemHQChatMemory({
  apiKey: process.env.MEMHQ_API_KEY!,
  sessionId: "conv_42",
  userId: "user_42",
});

const agent = new OpenAIAgent({
  tools: [],
  memory,
});

const reply = await agent.chat({ message: "What's my favorite coffee?" });
```

## Quickstart — Retriever

```ts
import { RetrieverQueryEngine } from "llamaindex";
import { MemHQRetriever } from "@memhq/llamaindex";

const retriever = new MemHQRetriever({
  apiKey: process.env.MEMHQ_API_KEY!,
  userId: "user_42",
  limit: 8,
});

const engine = new RetrieverQueryEngine(retriever);
const answer = await engine.query({ query: "Summarize pricing discussion" });
```

## Configuration

| Option | Description |
| --- | --- |
| `apiKey` | MemHQ project API key. Falls back to `MEMHQ_API_KEY`. |
| `userId` | External user id. Required. |
| `sessionId` | Thread anchor for the memory adapter. |
| `recallLimit` | Memories surfaced per memory read. Default 10. |
| `limit` | Memories returned per retriever query. Default 10. |
| `mode` | `"hybrid"` (default), `"vector"`, or `"lexical"`. |
| `baseUrl` | Override the API base. |

## Reference

Full reference: https://docs.memhq.ai/sdks/llamaindex-js
