# memhq-llamaindex

MemHQ adapter for LlamaIndex (Python). Drop-in chat memory and retriever backed by the MemHQ hosted API. Sync and async both supported.

## Install

```bash
pip install memhq-llamaindex
```

## Quickstart — Chat memory

```python
import os
from llama_index.llms.openai import OpenAI
from llama_index.core.agent import ReActAgent

from memhq_llamaindex import MemHQMemory

memory = MemHQMemory(
    api_key=os.environ["MEMHQ_API_KEY"],
    session_id="conv_42",
    user_id="user_42",
)

agent = ReActAgent.from_tools(
    tools=[],
    llm=OpenAI(model="gpt-4o-mini"),
    memory=memory,
)

reply = agent.chat("What's my favorite coffee order?")
```

## Quickstart — Retriever

```python
from llama_index.core.query_engine import RetrieverQueryEngine
from memhq_llamaindex import MemHQRetriever

retriever = MemHQRetriever(
    api_key=os.environ["MEMHQ_API_KEY"],
    user_id="user_42",
    limit=8,
)

engine = RetrieverQueryEngine.from_args(retriever)
answer = engine.query("Summarize pricing discussion")
```

## Configuration

| Argument | Description |
| --- | --- |
| `api_key` | MemHQ project API key. Falls back to `MEMHQ_API_KEY`. |
| `user_id` | External user id. Required. |
| `session_id` | Thread anchor for the memory adapter. |
| `recall_limit` | Memories surfaced per memory read. Default 10. |
| `limit` | Memories returned per retriever query. Default 10. |
| `mode` | `"hybrid"` (default), `"vector"`, or `"lexical"`. |
| `base_url` | Override the API base. |

## Reference

Full reference: https://docs.memhq.ai/sdks/llamaindex-py
