#!/usr/bin/env bash
# SessionStart hook — fetch recent memories for the active project and
# print them as a markdown block so Claude Code injects them as context.
#
# Output on stdout is injected into the session system prompt. Always exits 0.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

if ! memhq_enabled; then exit 0; fi

project=$(memhq_project)
user_id=$(memhq_user_id)
limit="${MEMHQ_SESSION_START_LIMIT:-10}"

body=$(jq -nc \
  --arg q "$project" \
  --arg u "$user_id" \
  --argjson n "$limit" \
  '{query:$q, user_id:$u, limit:$n}')

resp=$(memhq_post "/v1/memhq/search" "$body")

if ! printf '%s' "$resp" | jq -e '.results | length > 0' >/dev/null 2>&1; then
  exit 0
fi

printf '## MemHQ — recent memories for project "%s"\n\n' "$project"
printf '%s' "$resp" | jq -r '.results[] | "- [\(.score | . * 100 | floor / 100)] \(.content)"' 2>/dev/null
printf '\n'

exit 0
