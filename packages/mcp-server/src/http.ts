// ─────────────────────────────────────────────
// MemHQ MCP — Streamable HTTP (Web Standard) entry point
//
// Backs the public `/mcp` endpoint. A single Node process can serve
// many concurrent MCP clients: each client is identified by the
// `Mcp-Session-Id` header issued during initialization, and we keep a
// per-session (McpServer, transport) pair in memory.
//
// The transport API here uses Web Standard Request/Response so it can
// plug straight into a Next.js route handler, Hono, Cloudflare Workers,
// Deno, Bun, etc.
// ─────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMemHQMcpServer } from "./server.js";

export interface HandleMcpRequestOptions {
  /** Caller-scoped MemHQ API key. Bound to every tool call this session makes. */
  apiKey: string;
  /** MemHQ API origin. Should include scheme, no trailing slash. */
  apiUrl: string;
  /** Optional fallback external user id when tools omit `user_id`. */
  defaultUserId?: string;
}

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  /** Stable identity for the api-key/user-id pair this session is bound to. */
  bindingKey: string;
}

// Sessions live for the lifetime of the Node process. Cleanup is driven
// by the transport itself: when the client sends DELETE /mcp, the
// `onsessionclosed` callback below removes the entry. If a session is
// abandoned without a clean shutdown we accept the memory cost — these
// objects are tiny.
const sessions = new Map<string, Session>();

function bindingKeyFor(opts: HandleMcpRequestOptions): string {
  // Used to detect (and reject) an attempt to reuse a session id across
  // different API keys. Hashing isn't worth the import cost — this
  // value never leaves the process.
  return `${opts.apiKey}::${opts.defaultUserId ?? ""}::${opts.apiUrl}`;
}

async function readBody(req: Request): Promise<unknown | undefined> {
  if (req.method !== "POST") return undefined;
  const text = await req.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Drive a single HTTP request through the MCP Streamable HTTP transport.
 * Pass the raw Web Standard `Request` from your framework — the result
 * is a `Response` ready to return to the client.
 *
 * Auth: the caller has already validated `opts.apiKey`. This function
 * binds every tool call made through this session to that key.
 */
export async function handleMcpRequest(
  req: Request,
  opts: HandleMcpRequestOptions,
): Promise<Response> {
  const sessionIdHeader = req.headers.get("mcp-session-id") ?? undefined;
  const binding = bindingKeyFor(opts);
  const parsedBody = await readBody(req);

  // Fast path: existing session.
  if (sessionIdHeader) {
    const existing = sessions.get(sessionIdHeader);
    if (existing) {
      if (existing.bindingKey !== binding) {
        // Same session id, different API key — refuse rather than leak
        // tools bound to another tenant's credentials.
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Session credentials do not match." },
            id: null,
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }
      return existing.transport.handleRequest(req, { parsedBody });
    }
    // Unknown session id on a non-init request — let the transport
    // produce the spec-compliant 404.
  }

  // No session yet (or unknown id). Stand up a new transport bound to
  // this caller. The SDK will validate that the first request is an
  // `initialize` and reject anything else.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, bindingKey: binding });
    },
    onsessionclosed: (sid) => {
      sessions.delete(sid);
    },
  });

  const server = createMemHQMcpServer({
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    defaultUserId: opts.defaultUserId,
  });
  await server.connect(transport);

  return transport.handleRequest(req, { parsedBody });
}
