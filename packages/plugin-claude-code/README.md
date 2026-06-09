# @memhq/claude-code

MemHQ Claude Code plugin. Gives Claude Code persistent memory backed by your MemHQ project — no manual tool calls required.

## What it does

| Hook | What happens |
|---|---|
| `SessionStart` | Fetches the top-N memories relevant to the current project and injects them as context |
| `UserPromptSubmit` | Searches memory on every prompt and injects likely-relevant results |
| `PostToolUse` | Auto-captures significant events: git commits, deploys, edits to key config files, completed todos |
| `PostCompact` | Saves the compaction summary to memory so knowledge survives context resets |
| `Stop` | Saves the final assistant message from the session transcript |

## Install

```bash
claude plugin install @memhq/claude-code
```

Then set your API key (get one at [memhq.ai/app](https://memhq.ai/app)):

```bash
export MEMHQ_API_KEY=your_key_here
```

Add that line to your `~/.zshrc` or `~/.bashrc` so it persists.

## Configuration

All settings are environment variables:

| Variable | Default | Description |
|---|---|---|
| `MEMHQ_API_KEY` | — | **Required.** Bearer token from memhq.ai/app |
| `MEMHQ_API_URL` | `https://api.memhq.ai` | API base URL |
| `MEMHQ_USER_ID` | `$USER` | Scopes memories to this user id |
| `MEMHQ_ENABLED` | `true` | Set to `false` to disable without uninstalling |
| `MEMHQ_SESSION_START_LIMIT` | `10` | Max memories to inject at session start |
| `MEMHQ_PROMPT_SEARCH_LIMIT` | `5` | Max memories to inject per prompt |
| `MEMHQ_MIN_PROMPT_CHARS` | `40` | Skip prompts shorter than this |
| `MEMHQ_LOG` | `/tmp/memhq-hook.out` | Debug log path |

## Uninstall

```bash
claude plugin uninstall memhq
```
