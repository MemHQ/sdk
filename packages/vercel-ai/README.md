# @memhq/vercel-ai

MemHQ middleware for the Vercel AI SDK. Wraps `streamText` / `generateText` to prepend user memories before the model call and persist the assistant turn after — no changes to your prompt code.

## Install

```bash
npm install @memhq/vercel-ai @memhq/sdk ai
```

## Quickstart

```ts
import { withMemHQ } from "@memhq/vercel-ai";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = await withMemHQ(
  { apiKey: process.env.MEMHQ_API_KEY!, userId: "user_42" },
  (args) =>
    streamText({
      model: openai("gpt-4o-mini"),
      ...args,
    }),
  {
    messages: [{ role: "user", content: "What's my favorite coffee?" }],
  },
);

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

`withMemHQ`:

1. Pulls the latest user message
2. Calls MemHQ search and injects the top results as a system message
3. Hooks `onFinish` to persist the user + assistant turn into MemHQ

## Non-streaming

```ts
import { generateText } from "ai";

const result = await withMemHQ(
  { apiKey: process.env.MEMHQ_API_KEY!, userId: "user_42" },
  (args) => generateText({ model: openai("gpt-4o-mini"), ...args }),
  { messages: [{ role: "user", content: "Suggest a gift for me" }] },
);

console.log(result.text);
```

## Configuration

| Option | Description |
| --- | --- |
| `apiKey` | MemHQ project API key. Falls back to `MEMHQ_API_KEY`. |
| `userId` | External user id. Required. |
| `recallLimit` | Memories prepended per call. Default 5. |
| `searchMode` | `"hybrid"` (default), `"vector"`, or `"lexical"`. |
| `sessionId` | Tagged onto persisted messages as metadata. |
| `baseUrl` | Override the API base. |

## Reference

Full reference: https://docs.memhq.ai/sdks/vercel-ai
