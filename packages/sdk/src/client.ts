// ─────────────────────────────────────────────
// MemHQ SDK — MemoryClient
//
// Thin TypeScript wrapper around the /v1/memhq/* endpoints. Uses the
// global fetch (Node 18+, browsers, edge runtimes) so we ship zero
// runtime deps.
// ─────────────────────────────────────────────

import {
  AddParams,
  AddResult,
  AskParams,
  AskResult,
  AuthError,
  MemHQError,
  MemoryClientOptions,
  NotFoundError,
  RateLimitError,
  SearchParams,
  SearchResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.memhq.ai";
const USER_AGENT = "memhq-typescript/0.1.1";

/**
 * Resolve API key from option > env. Throws if neither is set.
 */
function resolveConfig(opts: MemoryClientOptions): { apiKey: string; baseUrl: string } {
  const env =
    typeof process !== "undefined" && process.env
      ? process.env
      : ({} as Record<string, string | undefined>);
  const apiKey = opts.apiKey ?? env["MEMHQ_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "MemHQ API key not provided. Pass { apiKey } or set MEMHQ_API_KEY in the environment.",
    );
  }
  const baseUrl = (opts.baseUrl ?? env["MEMHQ_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/**
 * MemHQ memory client.
 *
 * ```ts
 * const client = new MemoryClient({ apiKey: process.env.MEMHQ_API_KEY! });
 * await client.add({
 *   messages: [{ role: "user", content: "I love pizza" }],
 *   userId: "user_123",
 * });
 * const results = await client.search({ query: "food", userId: "user_123" });
 * ```
 */
export class MemoryClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  /** User management sub-namespace. Use ``client.users.get(...)`` etc. */
  public readonly users: UsersAPI;

  constructor(opts: MemoryClientOptions = {}) {
    const { apiKey, baseUrl } = resolveConfig(opts);
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    // Bind so callers can pass through arbitrary fetch impls (undici, etc.).
    this.fetchImpl = (opts.fetch ?? fetch).bind(globalThis);
    this.users = new UsersAPI(this);
  }

  // ── public methods ──────────────────────────────────────────

  /**
   * Ingest messages into the user's memory graph. Auto-creates the user
   * (by `userId`) and a default thread on first call. Returns immediately —
   * extraction is async and typically completes in <3s.
   */
  async add(params: AddParams): Promise<AddResult> {
    const body: Record<string, unknown> = {
      user_id: params.userId,
      messages: params.messages,
    };
    if (params.groupId !== undefined) body["group_id"] = params.groupId;
    if (params.metadata !== undefined) body["metadata"] = params.metadata;
    return this.request<AddResult>("POST", "/v1/memhq/add", body);
  }

  /**
   * Hybrid search across the user's graph plus any shared group graphs.
   */
  async search(params: SearchParams): Promise<SearchResult> {
    const body: Record<string, unknown> = {
      query: params.query,
      limit: params.limit ?? 10,
      mode: params.mode ?? "hybrid",
    };
    if (params.userId !== undefined) body["user_id"] = params.userId;
    if (params.groupIds && params.groupIds.length > 0) body["group_ids"] = params.groupIds;
    return this.request<SearchResult>("POST", "/v1/memhq/search", body);
  }

  /**
   * Synthesize a cited answer over the user's memory. The MemHQ wedge:
   * Mem0 doesn't have this. We retrieve, rerank, and synthesize via an LLM.
   */
  async ask(params: AskParams): Promise<AskResult> {
    const body: Record<string, unknown> = {
      question: params.question,
      limit: params.limit ?? 8,
    };
    if (params.userId !== undefined) body["user_id"] = params.userId;
    if (params.groupIds && params.groupIds.length > 0) body["group_ids"] = params.groupIds;
    return this.request<AskResult>("POST", "/v1/memhq/ask", body);
  }

  // ── internals ─────────────────────────────────────────────

  /** @internal */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e: unknown) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      throw new MemHQError(`Network error: ${msg}`);
    }
    clearTimeout(timer);

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* keep as text */
    }

    if (!response.ok) {
      raiseForStatus(response.status, parsed);
    }
    return parsed as T;
  }
}

// ─────────────────────────────────────────────
// Users sub-namespace
// ─────────────────────────────────────────────

interface RawUser {
  id: string;
  externalId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  graphId?: string | null;
}

/**
 * User management API — fetch, list, delete. The `userId` accepted here
 * is the external id you passed to `add()`; the SDK resolves it.
 */
export class UsersAPI {
  constructor(private readonly client: MemoryClient) {}

  async get(userId: string): Promise<RawUser> {
    const internal = await this.resolveInternalId(userId);
    return this.client.request<RawUser>("GET", `/v1/users/${internal}`);
  }

  async delete(userId: string): Promise<{ deleted: boolean; id: string }> {
    const internal = await this.resolveInternalId(userId);
    return this.client.request<{ deleted: boolean; id: string }>("DELETE", `/v1/users/${internal}`);
  }

  async list(): Promise<RawUser[]> {
    const resp = await this.client.request<{ users: RawUser[] }>("GET", "/v1/users");
    return resp.users ?? [];
  }

  private async resolveInternalId(externalOrInternal: string): Promise<string> {
    const users = await this.list();
    const hit = users.find(
      (u) => u.externalId === externalOrInternal || u.id === externalOrInternal,
    );
    return hit?.id ?? externalOrInternal;
  }
}

// ─────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────

function raiseForStatus(status: number, body: unknown): never {
  const asObj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = String(asObj["error"] ?? asObj["message"] ?? `MemHQ request failed (${status})`);
  const code = typeof asObj["code"] === "string" ? (asObj["code"] as string) : undefined;
  const opts = { statusCode: status, code, body: asObj };

  if (status === 401 || status === 403) throw new AuthError(message, opts);
  if (status === 404) throw new NotFoundError(message, opts);
  if (status === 429) throw new RateLimitError(message, opts);
  throw new MemHQError(message, opts);
}
