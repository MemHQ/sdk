#!/usr/bin/env bash
# Stop hook — fired when Claude Code ends a session.
# Extracts the last assistant message from the full transcript and stores it
# as a memory, so key conclusions survive across sessions.
#
# Reads the Claude Code event JSON on stdin:
#   { session_id, transcript: [{role, content},...], stop_hook_active }
#
# Always exits 0 — never blocks Claude Code.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

if ! memhq_enabled; then exit 0; fi

event=$(cat 2>/dev/null)

# Extract the last assistant message. Content can be a plain string or an
# array of content blocks ({type:"text",text:"..."}|{type:"tool_use",...}).
# We keep only text blocks and discard tool_use / image blocks.
last=$(printf '%s' "$event" | jq -r '
  [.transcript[]? | select(.role == "assistant") |
    if (.content | type) == "string" then .content
    else (.content | [.[]? | select(.type == "text") | .text] | join("\n"))
    end
  ] | map(select(length > 0)) | last // ""
' 2>/dev/null)

# Skip if too short (e.g. tool-only turns with no text).
if [ "${#last}" -lt 80 ]; then exit 0; fi

# Cap at 2000 chars.
last=$(printf '%.2000s' "$last")

project=$(memhq_project)
user_id=$(memhq_user_id)
session_id=$(printf '%s' "$event" | memhq_jq '.session_id // empty')
content="[claude-code] Session end ($project): $last"

body=$(jq -nc \
  --arg uid "$user_id" \
  --arg content "$content" \
  --arg project "$project" \
  --arg session_id "$session_id" \
  '{
    user_id: $uid,
    messages: [{role:"user", content:$content}],
    metadata: {
      source: "claude-code-plugin",
      project: $project,
      session_id: $session_id,
      event: "stop"
    }
  }')

memhq_post "/v1/memhq/add" "$body" >/dev/null

exit 0
