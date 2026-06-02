# `@memhq/mcp-server`

Model Context Protocol (MCP) server that turns a [MemHQ](https://memhq.ai) instance into persistent memory for Claude Code, Claude Desktop, Cursor, or any other MCP client.

Out of the box you get four tools:

| Tool | What it does |
| --- | --- |
| `memhq_add` | Store conversation turns. Call this after each Claude turn. |
| `memhq_search` | Hybrid (vector + lexical) search. Call this before answering anything that might benefit from prior context. |
| `memhq_ask` | Synthesized, cited answer over your memory graph. |
| `memhq_list_users` | Inspect which user externalIds have memories stored. |

## Install

```bash
npm install -g @memhq/mcp-server
```

Or from this monorepo:

```bash
cd sdks/mcp-server
npm install
npm run build
npm link            # exposes the `memhq-mcp` binary globally
```

## Get an API key

1. Open the MemHQ dashboard → **Settings → API keys**.
2. Create a project key. It starts with `mem_`.
3. Keep it secret — it's a bearer credential for the whole project graph.

For local dev against the OSS stack, copy any `mem_...` key from `apps/api/.env` or grab one with:

```bash
curl -s -H "Authorization: Bearer $CLERK_DEV_JWT" http://localhost:3000/v1/api-keys
```

## Configure Claude Code

Add the server to `~/.config/claude-code/mcp-servers.json` (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "memhq": {
      "command": "memhq-mcp",
      "env": {
        "MEMHQ_API_KEY": "mem_xxxxxxxxxxxxxxxx",
        "MEMHQ_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Restart Claude Code. You should see `memhq_add`, `memhq_search`, `memhq_ask`, and `memhq_list_users` in the tool list.

### Production

For the hosted MemHQ API, drop `MEMHQ_API_URL` (defaults to `http://localhost:3000` in this build; for the public API point it at `https://api.memhq.ai`).

### Environment

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `MEMHQ_API_KEY` | yes | — | Bearer key (`mem_...`). |
| `MEMHQ_API_URL` | no | `http://localhost:3000` | Base URL of the MemHQ API. |
| `MEMHQ_DEFAULT_USER_ID` | no | `claude-code-<hostname>` | External user id used when a tool call omits `user_id`. |

## Suggested workflow for Claude Code

Add this to your project's `CLAUDE.md`:

> **Memory:** Before answering anything that involves user preferences, project context, prior decisions, names, or ongoing work, call `memhq_search` first. After each substantial turn, call `memhq_add` with the user message + your reply so the next session remembers.

## Example tool calls

`memhq_add`:

```json
{
  "messages": [
    { "role": "user", "content": "I prefer pnpm over npm for new TS projects." },
    { "role": "assistant", "content": "Got it — pnpm by default." }
  ]
}
```

`memhq_search`:

```json
{ "query": "package manager preferences", "limit": 5 }
```

`memhq_ask`:

```json
{ "question": "What package manager should I use?" }
```

## Notes / quirks

- **stdio transport only.** stdout is reserved for JSONRPC frames; all server logs go to stderr.
- **User scoping is per machine by default.** Override `MEMHQ_DEFAULT_USER_ID` if you want memories shared across machines or projects.
- **`memhq_add` returns immediately.** Extraction runs async on the API side (typically <3s before memories surface in `search`).
- **Errors are returned as tool errors,** not thrown — Claude Code will see them as `isError: true` content and can react.

## License

Apache-2.0
