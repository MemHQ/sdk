#!/usr/bin/env node
// ─────────────────────────────────────────────
// MemHQ MCP — stdio entry point
//
// Reads MEMHQ_API_KEY (+ optional MEMHQ_API_URL, MEMHQ_DEFAULT_USER_ID)
// from env, builds the server, and attaches a StdioServerTransport.
// All logging goes to stderr — stdout is reserved for the MCP transport.
// ─────────────────────────────────────────────

import { hostname } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMemHQMcpServer } from "./server.js";
import { PKG_NAME } from "./tools.js";

function loadConfig(): { apiKey: string; apiUrl: string; defaultUserId: string } {
  const apiKey = process.env["MEMHQ_API_KEY"];
  if (!apiKey) {
    process.stderr.write(
      `[${PKG_NAME}] ERROR: MEMHQ_API_KEY is required. Set it in your MCP server env block.\n`,
    );
    process.exit(1);
  }
  const apiUrl = (process.env["MEMHQ_API_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
  const defaultUserId =
    process.env["MEMHQ_DEFAULT_USER_ID"] ?? `claude-code-${hostname() || "local"}`;
  return { apiKey, apiUrl, defaultUserId };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const server = createMemHQMcpServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[${PKG_NAME}] ready — api=${cfg.apiUrl} default_user=${cfg.defaultUserId}\n`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${PKG_NAME}] fatal: ${msg}\n`);
  process.exit(1);
});
