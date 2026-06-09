#!/usr/bin/env bash
# UserPromptSubmit hook — search memory for every user prompt and
# inject relevant results as a markdown block on stdout.
#
# Reads the Claude Code event JSON on stdin. Always exits 0.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

if ! memhq_enabled; then exit 0; fi

event=$(cat 2>/dev/null)
prompt=$(printf '%s' "$event" | memhq_jq '.prompt // .text // empty')

# Truncate to 200 chars for the search query.
prompt=$(printf '%.200s' "$prompt")

if memhq_should_skip "$prompt"; then exit 0; fi

user_id=$(memhq_user_id)
limit="${MEMHQ_PROMPT_SEARCH_LIMIT:-5}"

body=$(jq -nc \
  --arg q "$prompt" \
  --arg u "$user_id" \
  --argjson n "$limit" \
  '{query:$q, user_id:$u, limit:$n}')

resp=$(memhq_post "/v1/memhq/search" "$body")

if ! printf '%s' "$resp" | jq -e '.results | length > 0' >/dev/null 2>&1; then
  exit 0
fi

printf '## MemHQ — likely relevant\n\n'
printf '%s' "$resp" | jq -r '.results[] | "- \(.content)"' 2>/dev/null
printf '\n'

exit 0
