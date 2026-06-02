# memhq-langchain

MemHQ adapter for LangChain (Python). Drop-in chat message history and retriever backed by the MemHQ hosted API. Sync and async both supported via `httpx`.

## Install

```bash
pip install memhq-langchain
```

## Quickstart — Chat history

```python
import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory

from memhq_langchain import MemHQChatMessageHistory

model = ChatOpenAI(model="gpt-4o-mini")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You have access to the user's memory."),
    MessagesPlaceholder("history"),
    ("human", "{input}"),
])

chain = RunnableWithMessageHistory(
    prompt | model,
    lambda session_id: MemHQChatMessageHistory(
        api_key=os.environ["MEMHQ_API_KEY"],
        session_id=session_id,
        user_id="user_42",
    ),
    input_messages_key="input",
    history_messages_key="history",
)

reply = chain.invoke(
    {"input": "What's my favorite coffee order?"},
    config={"configurable": {"session_id": "conv_42"}},
)
```

## Quickstart — Retriever

```python
from memhq_langchain import MemHQRetriever

retriever = MemHQRetriever(
    api_key=os.environ["MEMHQ_API_KEY"],
    user_id="user_42",
    limit=8,
)

docs = retriever.invoke("pricing discussions")
```

## Configuration

| Argument | Description |
| --- | --- |
| `api_key` | MemHQ project API key. Falls back to `MEMHQ_API_KEY`. |
| `user_id` | External user id. Required. |
| `session_id` | Thread anchor for the history adapter. |
| `recall_limit` | Memories surfaced per history read. Default 10. |
| `limit` | Memories returned per retriever query. Default 10. |
| `mode` | `"hybrid"` (default), `"vector"`, or `"lexical"`. |
| `base_url` | Override the API base. |

## Reference

Full reference: https://docs.memhq.ai/sdks/langchain-py
