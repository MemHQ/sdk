// ─────────────────────────────────────────────
// @memhq/mcp-server — programmatic entry point.
//
// Re-exports the transport-agnostic factory. Consumers attach their own
// transport (`./stdio` and `./http` are bundled for the common cases).
// ─────────────────────────────────────────────

export {
  createMemHQMcpServer,
  PKG_NAME,
  PKG_VERSION,
  type CreateMemHQMcpServerOptions,
} from "./server.js";
export { registerMemHQTools, MemHQRequestError, type ToolContext } from "./tools.js";
