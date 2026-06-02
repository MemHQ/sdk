// ─────────────────────────────────────────────
// MemHQ middleware for the Vercel AI SDK
//
// `withMemHQ` wraps a `streamText` / `generateText` call:
//
//   1. Before the model call, search MemHQ for memories relevant to the
//      latest user turn and prepend them as a system message.
//   2. After the model call settles (text resolved or stream finished),
//      persist the assistant turn back into MemHQ so subsequent calls
//      can recall it.
//
// We try to be transparent — same call-shape options, same return value,
// same streaming semantics. We just thread context in and persist on the
// way out.
// ─────────────────────────────────────────────

import { MemoryClient } from "@memhq/sdk";

/** Options accepted by `withMemHQ`. */
export interface WithMemHQOptions {
  /** MemHQ API key. Falls back to MEMHQ_API_KEY env var. */
  apiKey?: string;
  /** External user id. Required — MemHQ is user-scoped. */
  userId: string;
  /** Override the MemHQ base URL. */
  baseUrl?: string;
  /** How many memories to inject. Default 5. */
  recallLimit?: number;
  /** Override the search mode. Default "hybrid". */
  searchMode?: "hybrid" | "vector" | "lexical";
  /**
   * Optional thread/session id — stored on the persisted messages as
   * metadata for later filtering.
   */
  sessionId?: string;
  /** Reuse a MemoryClient instance. */
  client?: MemoryClient;
}

/**
 * Minimal subset of the AI SDK message shape we care about — we only
 * inspect `role` and `content`. Keeping it loose avoids a hard dep on
 * `ai`'s types (which churn between minor versions).
 */
interface SDKMessage {
  role: "system" | "user" | "assistant" | "tool" | string;
  content: string | Array<{ type: string; text?: string }>;
}

/**
 * The argument bag passed to `streamText` / `generateText`. We only
 * touch `messages` and `system`, and pipe `onFinish` through for
 * post-call persistence.
 */
interface AICallArgs {
  messages?: SDKMessage[];
  prompt?: string;
  system?: string;
  onFinish?: (event: unknown) => void | Promise<void>;
  [key: string]: unknown;
}

/**
 * Wrap an AI SDK call so it reads and writes MemHQ memories.
 *
 * The inner function receives a modified args bag with memory context
 * prepended. Return whatever the AI SDK call returns — `withMemHQ`
 * passes it through unchanged.
 *
 * ```ts
 * const result = await withMemHQ(
 *   { apiKey: process.env.MEMHQ_API_KEY!, userId: "user_42" },
 *   (args) => streamText({ model: openai("gpt-4o-mini"), ...args }),
 *   { messages: [{ role: "user", content: "What's my favorite coffee?" }] },
 * );
 * ```
 */
export async function withMemHQ<T>(
  options: WithMemHQOptions,
  call: (args: AICallArgs) => T | Promise<T>,
  args: AICallArgs,
): Promise<T> {
  const client =
    options.client ??
    new MemoryClient({
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    });

  const latestUserText = extractLatestUserText(args);
  let memoryContext = "";

  if (latestUserText) {
    try {
      const res = await client.search({
        query: latestUserText,
        userId: options.userId,
        limit: options.recallLimit ?? 5,
        mode: options.searchMode ?? "hybrid",
      });
      if (res.results.length > 0) {
        memoryContext = formatMemories(res.results.map((m) => m.content));
      }
    } catch {
      // Soft-fail: never block the model call on a memory lookup miss.
    }
  }

  // Compose the augmented args — preserve original `onFinish` and chain
  // our persistence step after it.
  const userOnFinish = args.onFinish;
  const augmentedArgs: AICallArgs = {
    ...args,
    system: memoryContext
      ? args.system
        ? `${args.system}\n\n${memoryContext}`
        : memoryContext
      : args.system,
    onFinish: async (event: unknown) => {
      if (typeof userOnFinish === "function") {
        try {
          await userOnFinish(event);
        } catch {
          /* never let user callbacks break persistence */
        }
      }
      await persistTurn(client, options, args, event);
    },
  };

  const result = await call(augmentedArgs);

  // For `generateText`, the call settles synchronously with `.text`
  // available. Persist immediately — streamText goes through onFinish.
  await maybePersistResolved(client, options, args, result);

  return result;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function extractLatestUserText(args: AICallArgs): string {
  if (typeof args.prompt === "string" && args.prompt.length > 0) {
    return args.prompt;
  }
  const messages = args.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") return contentToText(m.content);
  }
  return "";
}

function contentToText(content: SDKMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p.type === "text" && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

function formatMemories(items: string[]): string {
  const bullets = items.map((c) => `- ${c}`).join("\n");
  return `Relevant memories about this user (from MemHQ):\n${bullets}`;
}

async function persistTurn(
  client: MemoryClient,
  options: WithMemHQOptions,
  args: AICallArgs,
  event: unknown,
): Promise<void> {
  const assistantText = extractAssistantText(event);
  const userText = extractLatestUserText(args);
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (userText) messages.push({ role: "user", content: userText });
  if (assistantText) messages.push({ role: "assistant", content: assistantText });
  if (messages.length === 0) return;
  try {
    await client.add({
      userId: options.userId,
      messages,
      ...(options.sessionId !== undefined
        ? { metadata: { session_id: options.sessionId } }
        : {}),
    });
  } catch {
    // Never propagate a persistence failure back to the user — the
    // model call already succeeded.
  }
}

async function maybePersistResolved(
  client: MemoryClient,
  options: WithMemHQOptions,
  args: AICallArgs,
  result: unknown,
): Promise<void> {
  // `generateText` returns an object whose `text` is a Promise<string>
  // or a string. `streamText` returns a result whose final text is
  // delivered via onFinish — skip those.
  if (result && typeof result === "object" && "text" in result) {
    const text = (result as { text: unknown }).text;
    let resolved: string | undefined;
    if (typeof text === "string") resolved = text;
    else if (text && typeof (text as Promise<string>).then === "function") {
      try {
        resolved = await (text as Promise<string>);
      } catch {
        resolved = undefined;
      }
    }
    // Only persist here for non-streaming results. Streaming results
    // expose a `textStream` or `fullStream` and will hit `onFinish`.
    const looksStreaming =
      "textStream" in (result as object) || "fullStream" in (result as object);
    if (!looksStreaming && resolved) {
      await persistTurn(client, options, args, { text: resolved });
    }
  }
}

function extractAssistantText(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const e = event as Record<string, unknown>;
  if (typeof e["text"] === "string") return e["text"] as string;
  // streamText.onFinish supplies { text, finishReason, usage, ... }
  return "";
}
