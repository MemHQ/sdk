#!/usr/bin/env bash
# PostToolUse hook — auto-capture significant tool events:
#   Bash:      deploy / release / git commit|push|merge / docker / terraform / npm publish
#   Edit/Write: high-signal config files (Dockerfile, CLAUDE.md, package.json, *.env, ...)
#   TodoWrite:  newly completed todos
#
# Reads the Claude Code event JSON on stdin. Always exits 0.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

if ! memhq_enabled; then exit 0; fi

event=$(cat 2>/dev/null)
tool=$(printf '%s' "$event" | memhq_jq '.tool_name // .tool // empty')

description=""

case "$tool" in
  Bash)
    cmd=$(printf '%s' "$event" | memhq_jq '.tool_input.command // empty')
    case "$cmd" in
      "git commit"*|"git push"*|"git merge"*|"git rebase"*|"git tag"*|\
      "docker compose up"*|"docker compose down"*|"docker build"*|\
      "kubectl apply"*|"terraform apply"*|\
      "npm publish"*|"pnpm publish"*|"pip publish"*)
        description="ran \`$cmd\`"
        ;;
    esac
    ;;

  Edit|Write)
    fp=$(printf '%s' "$event" | memhq_jq '.tool_input.file_path // empty')
    base=$(basename "$fp" 2>/dev/null)
    case "$base" in
      *docker-compose*|*Dockerfile*|*pyproject*|*requirements*|\
      *CLAUDE.md*|*.env*|*tsconfig*|*package.json)
        description="edited \`$fp\`"
        ;;
    esac
    ;;

  TodoWrite)
    todos=$(printf '%s' "$event" \
      | memhq_jq '[.tool_input.todos[]? | select(.status=="completed") | (.content // .text // .)] | .[0:3] | join("; ")')
    if [ -n "$todos" ] && [ "$todos" != "null" ]; then
      description="completed: $todos"
    fi
    ;;
esac

if [ -z "$description" ]; then exit 0; fi

project=$(memhq_project)
user_id=$(memhq_user_id)
content="[claude-code] $project: $description"

body=$(jq -nc \
  --arg uid "$user_id" \
  --arg content "$content" \
  --arg project "$project" \
  --arg tool "$tool" \
  '{
    user_id: $uid,
    messages: [{role:"user", content:$content}],
    metadata: {
      source: "claude-code-plugin",
      project: $project,
      tool: $tool,
      event: "post_tool_use"
    }
  }')

memhq_post "/v1/memhq/add" "$body" >/dev/null

exit 0
