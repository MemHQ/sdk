// ─────────────────────────────────────────────
// MemHQ SDK — types
//
// Plain interfaces, no runtime validation. The server validates;
// the SDK just shapes the I/O for callers' editors.
// ─────────────────────────────────────────────

export type Role = "user" | "assistant" | "system" | "tool";

export interface Message {
  role: Role;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  id: string;
  content: string;
  type: string;
  /**
   * Combined retrieval score (cosine similarity / hybrid). Always present
   * on `/v1/memhq/search` results.
   */
  score: number;
  /**
   * Extractor confidence at write time, in [0, 1]. Always present on
   * `/v1/memhq/search` results.
   */
  confidence: number;
}

export interface SearchResult {
  results: Memory[];
  total: number;
  query: string;
  latency_ms?: number;
}

export interface Citation {
  id: string;
  content: string;
  type?: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  question_mode?: string;
  refused: boolean;
  latency_ms?: number;
}

export interface AddResult {
  /** The external `user_id` you passed in (or echoes the internal id). */
  user_id: string;
  /** MemHQ's internal user id. Always returned. */
  internal_user_id: string;
  /** Internal id of the thread the messages were appended to. */
  thread_id: string;
  messages_stored: number;
  memories_queued: number;
}

// ─────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────

export interface AddParams {
  messages: Message[];
  userId: string;
  groupId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchParams {
  query: string;
  userId?: string;
  groupIds?: string[];
  limit?: number;
  mode?: "hybrid" | "vector" | "lexical";
}

export interface AskParams {
  question: string;
  userId?: string;
  groupIds?: string[];
  limit?: number;
}

export interface MemoryClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Per-request timeout in ms. Default 60s. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to global fetch. */
  fetch?: typeof fetch;
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────

export class MemHQError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly body?: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      code?: string;
      body?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "MemHQError";
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.body = opts.body;
  }
}

export class AuthError extends MemHQError {
  constructor(message: string, opts: { statusCode?: number; code?: string; body?: Record<string, unknown> } = {}) {
    super(message, opts);
    this.name = "AuthError";
  }
}

export class NotFoundError extends MemHQError {
  constructor(message: string, opts: { statusCode?: number; code?: string; body?: Record<string, unknown> } = {}) {
    super(message, opts);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends MemHQError {
  constructor(message: string, opts: { statusCode?: number; code?: string; body?: Record<string, unknown> } = {}) {
    super(message, opts);
    this.name = "RateLimitError";
  }
}
