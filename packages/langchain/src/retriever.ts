// ─────────────────────────────────────────────
// MemHQRetriever
//
// LangChain retriever backed by MemHQ /v1/memhq/search. Plug into
// createRetrievalChain, MultiQueryRetriever, ContextualCompression,
// or any chain that takes a BaseRetriever.
// ─────────────────────────────────────────────

import {
  BaseRetriever,
  type BaseRetrieverInput,
} from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { MemoryClient } from "@memhq/sdk";

export interface MemHQRetrieverOptions extends BaseRetrieverInput {
  /** MemHQ API key. Falls back to MEMHQ_API_KEY env var. */
  apiKey?: string;
  /** External user id. Required — MemHQ is user-scoped. */
  userId: string;
  /** Override the MemHQ base URL (default https://api.memhq.ai). */
  baseUrl?: string;
  /** How many memories to fetch per query. Default 10. */
  limit?: number;
  /** Retrieval mode — "hybrid" combines BM25 + vector + graph. */
  mode?: "hybrid" | "vector" | "lexical";
  /** Reuse an existing MemoryClient. */
  client?: MemoryClient;
}

export class MemHQRetriever extends BaseRetriever {
  lc_namespace = ["memhq", "retrievers"];

  private readonly client: MemoryClient;
  private readonly userId: string;
  private readonly limit: number;
  private readonly mode: "hybrid" | "vector" | "lexical";

  constructor(opts: MemHQRetrieverOptions) {
    super(opts);
    this.userId = opts.userId;
    this.limit = opts.limit ?? 10;
    this.mode = opts.mode ?? "hybrid";
    this.client =
      opts.client ??
      new MemoryClient({
        ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      });
  }

  override async _getRelevantDocuments(query: string): Promise<Document[]> {
    const res = await this.client.search({
      query,
      userId: this.userId,
      limit: this.limit,
      mode: this.mode,
    });
    return res.results.map(
      (m) =>
        new Document({
          pageContent: m.content,
          metadata: {
            memory_id: m.id,
            score: m.score,
            confidence: m.confidence,
            type: m.type,
            source: "memhq",
          },
        }),
    );
  }
}
