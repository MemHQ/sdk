// ─────────────────────────────────────────────
// MemHQMessageHistory
//
// Implements LangChain.js BaseListChatMessageHistory so any chain or
// agent that takes a chat history (RunnableWithMessageHistory,
// ConversationChain, AgentExecutor) can read/write directly from MemHQ.
// ─────────────────────────────────────────────

import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { MemoryClient, type Role } from "@memhq/sdk";

export interface MemHQMessageHistoryOptions {
  /** MemHQ API key. Falls back to MEMHQ_API_KEY env var. */
  apiKey?: string;
  /** Session identifier — typically the LangChain session_id. Stored as MemHQ thread metadata. */
  sessionId: string;
  /** External user id. Required — MemHQ is user-scoped. */
  userId: string;
  /** Override the MemHQ base URL (default https://api.memhq.ai). */
  baseUrl?: string;
  /** How many top memories to prepend on `getMessages()`. Default 10. */
  recallLimit?: number;
  /** Reuse an existing MemoryClient (skips constructing a new one). */
  client?: MemoryClient;
}

/**
 * Chat message history backed by MemHQ. Reads return recent memories
 * formatted as messages; writes ingest into the user's graph.
 *
 * The "history" here is semantic, not chronological — `getMessages()`
 * surfaces the memories most relevant to the latest exchange, not raw
 * transcript. This is the right shape for agents whose context window
 * can't hold the full conversation.
 */
export class MemHQMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ["memhq", "chat_history"];

  private readonly client: MemoryClient;
  private readonly sessionId: string;
  private readonly userId: string;
  private readonly recallLimit: number;

  constructor(opts: MemHQMessageHistoryOptions) {
    super();
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

  /**
   * Returns the top-k semantically relevant memories for this user,
   * shaped as LangChain messages. Used by RunnableWithMessageHistory
   * to prepend to the model prompt.
   */
  async getMessages(): Promise<BaseMessage[]> {
    // Use the session id itself as a recency anchor — pulls memories
    // most associated with this thread. Callers wanting more targeted
    // retrieval should use MemHQRetriever directly.
    const search = await this.client.search({
      query: this.sessionId,
      userId: this.userId,
      limit: this.recallLimit,
    });
    return search.results.map((m) => new SystemMessage({ content: m.content }));
  }

  /** Append a single message to MemHQ. */
  async addMessage(message: BaseMessage): Promise<void> {
    const role = mapRole(message);
    const content = stringifyContent(message.content);
    await this.client.add({
      userId: this.userId,
      messages: [{ role, content }],
      metadata: { session_id: this.sessionId },
    });
  }

  /** Batch ingest — preferred for whole-turn writes. */
  override async addMessages(messages: BaseMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.client.add({
      userId: this.userId,
      messages: messages.map((m) => ({
        role: mapRole(m),
        content: stringifyContent(m.content),
      })),
      metadata: { session_id: this.sessionId },
    });
  }

  /**
   * MemHQ does not expose a session-scoped delete via the hosted API
   * yet. This is a no-op so callers don't blow up; the next add() will
   * append normally. To wipe a user wholesale, use
   * `client.users.delete(userId)` from `@memhq/sdk`.
   */
  override async clear(): Promise<void> {
    // intentional no-op
  }
}

function mapRole(message: BaseMessage): Role {
  if (message instanceof HumanMessage) return "user";
  if (message instanceof AIMessage) return "assistant";
  if (message instanceof SystemMessage) return "system";
  if (message instanceof ToolMessage) return "tool";
  // Fallback for custom message classes — treat as user input so the
  // extractor still indexes the content.
  return "user";
}

function stringifyContent(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  // Multi-part content (vision, tool calls) → flatten the text parts.
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text") return (part as { text: string }).text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
