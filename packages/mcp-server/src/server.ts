// ─────────────────────────────────────────────
// MemHQ McpServer factory
//
// Transport-agnostic. Both `stdio.ts` (CLI) and `http.ts` (Streamable
// HTTP route handler) call into here to get a fully-configured server
// with every MemHQ tool already registered.
// ─────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PKG_NAME, PKG_VERSION, registerMemHQTools, type ToolContext } from "./tools.js";

export interface CreateMemHQMcpServerOptions {
  /** MemHQ API key (mem_… or mhq_… token). Required. */
  apiKey: string;
  /** MemHQ API origin. Default `https://api.memhq.ai`. */
  apiUrl?: string;
  /** Fallback external user id when a tool call omits `user_id`. */
  defaultUserId?: string;
}

/**
 * Build an McpServer wired to a specific MemHQ project. The returned
 * server has every tool registered but no transport attached — the
 * caller is responsible for `server.connect(transport)`.
 */
export function createMemHQMcpServer(opts: CreateMemHQMcpServerOptions): McpServer {
  if (!opts.apiKey) {
    throw new Error("createMemHQMcpServer: apiKey is required");
  }
  const ctx: ToolContext = {
    apiKey: opts.apiKey,
    apiUrl: (opts.apiUrl ?? "https://api.memhq.ai").replace(/\/+$/, ""),
    defaultUserId: opts.defaultUserId ?? "default",
  };

  const server = new McpServer(
    { name: PKG_NAME, version: PKG_VERSION },
    { capabilities: { tools: {}, logging: {} } },
  );
  registerMemHQTools(server, ctx);
  return server;
}

export { PKG_NAME, PKG_VERSION };
