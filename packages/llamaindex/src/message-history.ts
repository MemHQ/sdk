// ─────────────────────────────────────────────
// MemHQChatMemory
//
// Implements the LlamaIndex.js chat memory contract — `getMessages`,
// `put`, `reset`. Compatible with `ChatEngine`, `OpenAIAgent`, and
// other agents that accept a memory parameter.
//
// We deliberately keep the LlamaIndex types as a structural interface
// rather than a hard import: LlamaIndex's public surface changes
// between minor versions and this adapter is meant to keep working as
// the framework evolves. Duck-typing wins here.
// ─────────────────────────────────────────────

import { MemoryClient, type Role } from "@memhq/sdk";

/** Structural shape of a LlamaIndex ChatMessage. */
export interface ChatMessageLike {
  role: "user" | "assistant" | "system" | "tool" | "memory" | string;
  content: string | unknown;
  options?: Record<string, unknown>;
}

export interface MemHQChatMemoryOptions {
  /** MemHQ API key. Falls back to MEMHQ_API_KEY env var. */
  apiKey?: string;
  /** Session identifier — stored as MemHQ thread metadata. */
  sessionId: string;
  /** External user id. Required — MemHQ is user-scoped. */
  userId: string;
  /** Override the MemHQ base URL. */
  baseUrl?: string;
  /** How many memories to surface on read. Default 10. */
  recallLimit?: number;
  /** Reuse an existing MemoryClient. */
  client?: MemoryClient;
}

/**
 * Chat memory for LlamaIndex.js agents and chat engines, backed by
 * MemHQ. Reads return memories most relevant to the session; writes
 * ingest into the user's graph.
 */
export class MemHQChatMemory {
  private readonly client: MemoryClient;
  private readonly sessionId: string;
  private readonly userId: string;
  private readonly recallLimit: number;

  constructor(opts: MemHQChatMemoryOptions) {
    this.sessionId = opts.sessionId;
    this.userId = opts.userId;
    this.recallLimit = opts.recallLimit ?? 10;
    this.client =
      opts.client ??
      new MemoryClient({
        ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
        ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      });
  }

  /** LlamaIndex ChatMemoryBuffer-compatible read. */
  async getMessages(transientMessages?: ChatMessageLike[]): Promise<ChatMessageLike[]> {
    const res = await this.client.search({
      query: this.sessionId,
      userId: this.userId,
      limit: this.recallLimit,
    });
    const recalled: ChatMessageLike[] = res.results.map((m) => ({
      role: "system",
      content: m.content,
    }));
    return [...recalled, ...(transientMessages ?? [])];
  }

  /** Append a single message into MemHQ. */
  async put(message: ChatMessageLike): Promise<void> {
    await this.client.add({
      userId: this.userId,
      messages: [
        { role: toRole(message.role), content: stringifyContent(message.content) },
      ],
      metadata: { session_id: this.sessionId },
    });
  }

  /** Some LlamaIndex versions call `set` to seed a transcript. */
  async set(messages: ChatMessageLike[]): Promise<void> {
    if (messages.length === 0) return;
    await this.client.add({
      userId: this.userId,
      messages: messages.map((m) => ({
        role: toRole(m.role),
        content: stringifyContent(m.content),
      })),
      metadata: { session_id: this.sessionId },
    });
  }

  /**
   * MemHQ does not expose session-scoped delete via the hosted API yet.
   * No-op on purpose so the agent loop doesn't crash. To wipe a user
   * wholesale, use `client.users.delete(userId)` from `@memhq/sdk`.
   */
  async reset(): Promise<void> {
    // intentional no-op
  }

  /** Optional convenience used by some engines. */
  getLLM(): undefined {
    return undefined;
  }
}

function toRole(role: ChatMessageLike["role"]): Role {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
    return role;
  }
  return "user";
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object" && "text" in (p as object)) {
          const t = (p as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}
