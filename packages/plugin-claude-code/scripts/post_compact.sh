#!/usr/bin/env bash
# PostCompact hook — fired after Claude Code compacts the conversation.
# The event carries the generated compact summary; we store it as a memory
# so the knowledge survives across future sessions.
#
# Reads the Claude Code event JSON on stdin. Always exits 0.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

if ! memhq_enabled; then exit 0; fi

event=$(cat 2>/dev/null)
summary=$(printf '%s' "$event" | memhq_jq '.summary // empty')

# Need at least 80 chars to be worth storing.
if [ ${#summary} -lt 80 ]; then exit 0; fi

# Cap at 2000 chars to stay well within API limits.
summary=$(printf '%.2000s' "$summary")

project=$(memhq_project)
user_id=$(memhq_user_id)
content="[claude-code] Session summary ($project): $summary"

body=$(jq -nc \
  --arg uid "$user_id" \
  --arg content "$content" \
  --arg project "$project" \
  '{
    user_id: $uid,
    messages: [{role:"user", content:$content}],
    metadata: {
      source: "claude-code-plugin",
      project: $project,
      event: "post_compact"
    }
  }')

memhq_post "/v1/memhq/add" "$body" >/dev/null

exit 0
