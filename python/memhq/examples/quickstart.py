"""End-to-end quickstart for the MemHQ Python SDK.

Run with::

    export MEMHQ_API_KEY=mem_...
    export MEMHQ_BASE_URL=http://localhost:3000   # for local dev
    python examples/quickstart.py
"""

from __future__ import annotations

import os
import time

from memhq import MemoryClient


def main() -> None:
    client = MemoryClient(
        api_key=os.environ["MEMHQ_API_KEY"],
        base_url=os.environ.get("MEMHQ_BASE_URL"),
    )

    user_id = "demo_user_001"

    print("→ Adding a few memories…")
    result = client.add(
        messages=[
            {"role": "user", "content": "Hi! I'm Alice. I'm vegetarian and allergic to nuts."},
            {"role": "user", "content": "I prefer Italian and Japanese food."},
        ],
        user_id=user_id,
    )
    print(f"  stored {result.messages_stored} messages, queued {result.memories_queued} for extraction")
    print(f"  thread_id={result.thread_id}")

    # Extraction is async — wait a beat. In production, you'd poll the job
    # status endpoint; for a demo, a short sleep is fine.
    print("→ Waiting 4s for extraction to finish…")
    time.sleep(4)

    print("→ Searching: 'dietary restrictions'")
    results = client.search("dietary restrictions", user_id=user_id)
    for m in results:
        print(f"  [{m.type:>10}] score={m.score:.2f}  {m.content}")

    print("→ Asking: 'What kinds of cuisine does Alice like?'")
    answer = client.ask("What kinds of cuisine does Alice like?", user_id=user_id)
    print(f"  answer: {answer.text}")
    for cit in answer.citations:
        print(f"   • [{cit.id}] {cit.content}")

    client.close()


if __name__ == "__main__":
    main()
