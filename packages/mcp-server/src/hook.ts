#!/usr/bin/env node
// ─────────────────────────────────────────────
// MemHQ — Claude Code Stop hook
//
// Silently captures every Claude Code session transcript into MemHQ at
// session end. Zero-config passive memory: the user never has to call
// memhq_add manually.
//
// ── Setup ───────────────────────────────────────────────────────────────
// Add to ~/.claude/settings.json (or the project's .claude/settings.json):
//
//   "hooks": {
//     "Stop": [{
//       "matcher": "",
//       "hooks": [{
//         "type": "command",
//         "command": "npx -y @memhq/mcp-server hook"
//       }]
//     }]
//   }
//
// ── Environment variables ───────────────────────────────────────────────
//   MEMHQ_API_KEY       — Required. Bearer token from memhq.ai/app.
//   MEMHQ_USER_ID       — Optional. Scopes memories to this user id.
//                         Defaults to $USER (your local username).
//   MEMHQ_API_URL       — Optional. API base URL. Default: https://api.memhq.ai
//   MEMHQ_HOOK_TURNS    — Optional. Max conversation turns to capture per
//                         session. Default: 20. Set to 0 to capture all.
//   MEMHQ_HOOK_TIMEOUT  — Optional. HTTP timeout in ms. Default: 5000.
//
// ── Contract ────────────────────────────────────────────────────────────
// This script MUST always exit 0 and MUST never write to stdout.
// Errors are swallowed so Claude Code is never blocked.
// ─────────────────────────────────────────────

const MEMHQ_API_KEY = process.env["MEMHQ_API_KEY"];
const MEMHQ_USER_ID = process.env["MEMHQ_USER_ID"] ?? process.env["USER"] ?? "claude-code";
const MEMHQ_API_URL = (process.env["MEMHQ_API_URL"] ?? "https://api.memhq.ai").replace(/\/+$/, "");
const HOOK_TURNS_RAW = parseInt(process.env["MEMHQ_HOOK_TURNS"] ?? "20", 10);
const MEMHQ_HOOK_TURNS = Number.isFinite(HOOK_TURNS_RAW) ? Math.max(0, HOOK_TURNS_RAW) : 20;
const MEMHQ_HOOK_TIMEOUT = parseInt(process.env["MEMHQ_HOOK_TIMEOUT"] ?? "5000", 10);
const HOOK_VERSION = "0.1.0";

// No API key → silently skip (don't break the Claude Code flow)
if (!MEMHQ_API_KEY) process.exit(0);

// ── helpers ─────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Normalise MCP message content to a plain string.
 *
 * Claude Code content can be:
 *   - a plain string
 *   - an array of content blocks: { type: "text"|"tool_use"|..., text?: string }
 *
 * We extract only the text blocks and ignore tool_use / tool_result / image
 * blocks — those aren't meaningful as memories.
 */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as Record<string, unknown>)["type"] === "text" &&
        typeof (b as Record<string, unknown>)["text"] === "string",
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ── main ─────────────────────────────────────────────────────────────────

interface ClaudeHookPayload {
  session_id?: string;
  transcript?: unknown[];
  stop_hook_active?: boolean;
}

async function main(): Promise<void> {
  // 1. Read stdin (Claude Code Stop hook sends the payload here)
  let raw: string;
  try {
    raw = await readStdin();
  } catch {
    return; // stdin error — skip silently
  }

  if (!raw.trim()) return;

  // 2. Parse hook payload
  let payload: ClaudeHookPayload;
  try {
    payload = JSON.parse(raw) as ClaudeHookPayload;
  } catch {
    return; // not JSON — skip silently
  }

  const transcript = Array.isArray(payload.transcript) ? payload.transcript : [];
  if (transcript.length === 0) return;

  // 3. Extract user/assistant turns only, drop tool noise
  const allTurns = transcript.filter(
    (t): t is { role: "user" | "assistant"; content: unknown } => {
      if (!t || typeof t !== "object") return false;
      const r = (t as Record<string, unknown>)["role"];
      return r === "user" || r === "assistant";
    },
  );

  const selectedTurns =
    MEMHQ_HOOK_TURNS === 0 ? allTurns : allTurns.slice(-MEMHQ_HOOK_TURNS);

  const messages = selectedTurns
    .map((t) => ({ role: t.role, content: contentToText(t.content) }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0) return;

  // 4. POST to MemHQ with a hard timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MEMHQ_HOOK_TIMEOUT);

  try {
    await fetch(`${MEMHQ_API_URL}/v1/memhq/add`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MEMHQ_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": `memhq-hook/${HOOK_VERSION}`,
      },
      body: JSON.stringify({
        user_id: MEMHQ_USER_ID,
        messages,
        metadata: {
          source: "claude-code-stop-hook",
          session_id: payload.session_id ?? null,
          turns_captured: messages.length,
        },
      }),
      signal: ac.signal,
    });
  } catch {
    // Network error, timeout, or API error — always swallowed
  } finally {
    clearTimeout(timer);
  }
}

// Never let any unhandled error propagate — Claude Code must not be blocked
main().catch(() => undefined).finally(() => process.exit(0));
