# @memhq/langchain

MemHQ adapter for LangChain.js. Gives any chain, agent, or RAG pipeline a persistent, user-scoped memory layer in two lines. Implements `BaseListChatMessageHistory` and `BaseRetriever`.

## Install

```bash
npm install @memhq/langchain @memhq/sdk @langchain/core
```

## Quickstart — Chat history

```ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { MemHQMessageHistory } from "@memhq/langchain";

const model = new ChatOpenAI({ model: "gpt-4o-mini" });
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You have access to the user's memory."],
  new MessagesPlaceholder("history"),
  ["human", "{input}"],
]);

const chain = new RunnableWithMessageHistory({
  runnable: prompt.pipe(model),
  getMessageHistory: (sessionId) =>
    new MemHQMessageHistory({
      apiKey: process.env.MEMHQ_API_KEY!,
      sessionId,
      userId: "user_42",
    }),
  inputMessagesKey: "input",
  historyMessagesKey: "history",
});

const reply = await chain.invoke(
  { input: "What's my favorite coffee order?" },
  { configurable: { sessionId: "conv_42" } },
);
```

## Quickstart — Retriever

```ts
import { MemHQRetriever } from "@memhq/langchain";
import { createRetrievalChain } from "langchain/chains/retrieval";

const retriever = new MemHQRetriever({
  apiKey: process.env.MEMHQ_API_KEY!,
  userId: "user_42",
  limit: 8,
});

const ragChain = await createRetrievalChain({
  retriever,
  combineDocsChain: yourCombineChain,
});

const result = await ragChain.invoke({ input: "Summarize what we discussed about pricing." });
```

## Configuration

| Option | Description |
| --- | --- |
| `apiKey` | MemHQ project API key. Falls back to `MEMHQ_API_KEY`. |
| `userId` | External user id. Required. |
| `sessionId` | Used as the thread anchor in MemHQ. |
| `recallLimit` | Memories surfaced per history read. Default 10. |
| `limit` | Memories returned per retriever query. Default 10. |
| `mode` | `"hybrid"` (default), `"vector"`, or `"lexical"`. |
| `baseUrl` | Override the API base. |

## Reference

Full reference: https://docs.memhq.ai/sdks/langchain-js
