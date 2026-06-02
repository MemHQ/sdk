// ─────────────────────────────────────────────
// MemHQRetriever for LlamaIndex.js
//
// Implements the BaseRetriever `retrieve` contract: takes a query and
// returns an array of NodeWithScore-shaped results. Compatible with
// QueryEngine, RetrieverQueryEngine, RouterQueryEngine, agents, etc.
//
// We use a structural type rather than importing from `llamaindex` so
// this adapter keeps working across LlamaIndex's frequent API moves.
// ─────────────────────────────────────────────

import { MemoryClient } from "@memhq/sdk";

/** Structural shape compatible with LlamaIndex's NodeWithScore. */
export interface NodeWithScoreLike {
  node: {
    id_: string;
    text: string;
    metadata: Record<string, unknown>;
    getContent(): string;
  };
  score: number;
}

/** Structural shape of a LlamaIndex retriever query input. */
export interface RetrieveParams {
  query: string | { query: string };
}

export interface MemHQRetrieverOptions {
  apiKey?: string;
  userId: string;
  baseUrl?: string;
  limit?: number;
  mode?: "hybrid" | "vector" | "lexical";
  client?: MemoryClient;
}

export class MemHQRetriever {
  private readonly client: MemoryClient;
  private readonly userId: string;
  private readonly limit: number;
  private readonly mode: "hybrid" | "vector" | "lexical";

  constructor(opts: MemHQRetrieverOptions) {
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

  async retrieve(params: RetrieveParams | string): Promise<NodeWithScoreLike[]> {
    const query =
      typeof params === "string"
        ? params
        : typeof params.query === "string"
          ? params.query
          : params.query.query;
    const res = await this.client.search({
      query,
      userId: this.userId,
      limit: this.limit,
      mode: this.mode,
    });
    return res.results.map<NodeWithScoreLike>((m) => ({
      node: {
        id_: m.id,
        text: m.content,
        metadata: {
          memory_id: m.id,
          confidence: m.confidence,
          type: m.type,
          source: "memhq",
        },
        getContent: () => m.content,
      },
      score: m.score,
    }));
  }
}
