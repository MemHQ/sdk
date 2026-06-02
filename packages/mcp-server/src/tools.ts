// ─────────────────────────────────────────────
// MemHQ MCP tools
//
// Pure tool definitions — describe each MCP tool and the small HTTP
// client used to call the MemHQ API. No transport-specific code lives
// here: both the stdio CLI and the Streamable HTTP route handler load
// the same registry.
// ─────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const PKG_NAME = "@memhq/mcp-server";
export const PKG_VERSION = "0.1.0";
export const USER_AGENT = `memhq-mcp/${PKG_VERSION}`;

// ── config the factory needs ────────────────────────────────

export interface ToolContext {
  /** API key forwarded as `Authorization: Bearer …`. */
  apiKey: string;
  /** MemHQ API origin, no trailing slash. */
  apiUrl: string;
  /** Fallback external user id when the caller omits `user_id`. */
  defaultUserId: string;
}

// ── http helper ─────────────────────────────────────────────

export class MemHQRequestError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "MemHQRequestError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  ctx: ToolContext,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${ctx.apiUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new MemHQRequestError(0, `Network error contacting ${url}: ${msg}`, null);
  }

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* keep as string */
  }

  if (!res.ok) {
    const asObj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const msg = String(
      asObj["error"] ?? asObj["message"] ?? `MemHQ request failed (${res.status})`,
    );
    throw new MemHQRequestError(res.status, msg, parsed);
  }
  return parsed as T;
}

function asText(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function asError(e: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const msg =
    e instanceof MemHQRequestError
      ? `MemHQ ${e.status || "network"} error: ${e.message}`
      : e instanceof Error
        ? e.message
        : String(e);
  return {
    content: [{ type: "text", text: msg }],
    isError: true,
  };
}

// ── tool schemas ────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const addInput = {
  user_id: z
    .string()
    .optional()
    .describe(
      "External user id to scope memories. Defaults to the project's configured default user id.",
    ),
  messages: z
    .array(messageSchema)
    .min(1)
    .describe(
      "Conversation turns to store. At minimum one user/assistant pair from the latest turn.",
    ),
  group_id: z.string().optional().describe("Optional shared group/org graph id."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arbitrary tags persisted with the memory."),
};

const searchInput = {
  query: z.string().min(1).describe("Natural-language query to retrieve relevant memories."),
  user_id: z
    .string()
    .optional()
    .describe("Scope search to this user. Defaults to the project's default user id."),
  limit: z.number().int().positive().max(50).optional().describe("Max results. Default 10."),
  group_id: z.string().optional().describe("Optional shared group/org graph id."),
};

const askInput = {
  question: z.string().min(1).describe("Question to answer over the memory graph."),
  user_id: z
    .string()
    .optional()
    .describe("Scope synthesis to this user. Defaults to the project's default user id."),
  group_id: z.string().optional().describe("Optional shared group/org graph id."),
};

// ── tool registry ───────────────────────────────────────────

/**
 * Attach every MemHQ tool to the given McpServer. Called once at server
 * construction time — both the stdio entry point and the HTTP route
 * handler go through this so the tool surface stays in lockstep.
 */
export function registerMemHQTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "memhq_add",
    {
      title: "Store memory in MemHQ",
      description:
        "Ingest one or more conversation messages into the MemHQ memory graph. Auto-creates the user (by external id) and a thread on first call. Returns immediately; extraction is async (~1-3s). Call this after each turn so memories accumulate across sessions.",
      inputSchema: addInput,
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          user_id: args.user_id ?? ctx.defaultUserId,
          messages: args.messages,
        };
        if (args.group_id !== undefined) body["group_id"] = args.group_id;
        if (args.metadata !== undefined) body["metadata"] = args.metadata;
        const result = await request<unknown>(ctx, "POST", "/v1/memhq/add", body);
        return asText(result);
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    "memhq_search",
    {
      title: "Search MemHQ memory",
      description:
        "Hybrid (vector + lexical) search over the user's memory graph. Use this BEFORE answering anything that might benefit from prior context (preferences, decisions, ongoing projects, names). Returns ranked memories with text and score.",
      inputSchema: searchInput,
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          query: args.query,
          user_id: args.user_id ?? ctx.defaultUserId,
          limit: args.limit ?? 10,
          mode: "hybrid",
        };
        if (args.group_id !== undefined) body["group_ids"] = [args.group_id];
        const result = await request<unknown>(ctx, "POST", "/v1/memhq/search", body);
        return asText(result);
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    "memhq_ask",
    {
      title: "Ask MemHQ (synthesized answer with citations)",
      description:
        "Retrieve, rerank, and synthesize an LLM-written answer grounded in the user's memory. Returns { answer, citations: [{ id, content }] }. Prefer this over memhq_search when you want a direct answer instead of raw snippets.",
      inputSchema: askInput,
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          question: args.question,
          user_id: args.user_id ?? ctx.defaultUserId,
        };
        if (args.group_id !== undefined) body["group_ids"] = [args.group_id];
        const result = await request<unknown>(ctx, "POST", "/v1/memhq/ask", body);
        return asText(result);
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    "memhq_list_users",
    {
      title: "List MemHQ users in this project",
      description:
        "List the user external-ids known to this MemHQ project. Useful for seeing which machines / personas have memories stored.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await request<{ users: unknown[] }>(ctx, "GET", "/v1/users");
        return asText(result);
      } catch (e) {
        return asError(e);
      }
    },
  );
}
