#!/usr/bin/env bash
# MemHQ Claude Code plugin — shared helpers.
#
# Sourced by every hook script. Every helper is fail-soft: hooks must never
# block Claude Code on network problems, so we always exit 0 from the caller.

# ───────────────────────────────────────────────
# Config (env-overridable)
# ───────────────────────────────────────────────

# API URL — prefer MEMHQ_API_URL, fall back to legacy MEMHQ_URL, then default.
if [ -n "${MEMHQ_API_URL:-}" ]; then
  : "${MEMHQ_API_URL:=https://api.memhq.ai}"
elif [ -n "${MEMHQ_URL:-}" ]; then
  MEMHQ_API_URL="$MEMHQ_URL"
else
  MEMHQ_API_URL="https://api.memhq.ai"
fi
# Strip trailing slashes
MEMHQ_API_URL="${MEMHQ_API_URL%/}"

: "${MEMHQ_API_KEY:=}"
: "${MEMHQ_ENABLED:=true}"
: "${MEMHQ_SESSION_START_LIMIT:=10}"
: "${MEMHQ_PROMPT_SEARCH_LIMIT:=5}"
: "${MEMHQ_MIN_PROMPT_CHARS:=40}"
: "${MEMHQ_LOG:=/tmp/memhq-hook.out}"
: "${MEMHQ_USER_ID:=}"
: "${MEMHQ_USER_ID_FROM_KEY:=0}"

memhq_log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$MEMHQ_LOG" 2>/dev/null || true
}

memhq_enabled() {
  case "$MEMHQ_ENABLED" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

# Resolve user_id with priority:
#   1. Explicit MEMHQ_USER_ID env  →  used as-is
#   2. MEMHQ_USER_ID_FROM_KEY=1    →  sha256(MEMHQ_API_KEY)[:16]
#   3. default                     →  $USER, then claude-code-$(hostname -s)
memhq_user_id() {
  if [ -n "$MEMHQ_USER_ID" ]; then
    printf '%s' "$MEMHQ_USER_ID"
    return 0
  fi
  case "$MEMHQ_USER_ID_FROM_KEY" in
    1|true|yes|on)
      if [ -n "$MEMHQ_API_KEY" ]; then
        local hash
        hash=$(printf '%s' "$MEMHQ_API_KEY" | shasum -a 256 2>/dev/null | awk '{print $1}')
        if [ -n "$hash" ]; then
          printf '%s' "${hash:0:16}"
          return 0
        fi
      fi
      ;;
  esac
  if [ -n "${USER:-}" ]; then
    printf '%s' "$USER"
    return 0
  fi
  printf 'claude-code-%s' "$(hostname -s 2>/dev/null || echo local)"
}

# Detect a stable project identifier:
#   1. git remote origin → strip .git, take basename
#   2. basename of CWD
#   3. "unknown"
memhq_project() {
  local remote
  remote=$(git remote get-url origin 2>/dev/null)
  if [ -n "$remote" ]; then
    remote="${remote%.git}"
    remote="${remote##*/}"
    if [ -n "$remote" ]; then
      printf '%s' "$remote"
      return 0
    fi
  fi
  local base
  base=$(basename "$PWD" 2>/dev/null)
  if [ -n "$base" ]; then
    printf '%s' "$base"
    return 0
  fi
  printf 'unknown'
}

# Returns 0 (skip) if the text is too short or a known noop.
memhq_should_skip() {
  local text="$1"
  if [ -z "$text" ]; then return 0; fi
  text="${text#"${text%%[![:space:]]*}"}"
  text="${text%"${text##*[![:space:]]}"}"
  local n=${#text}
  if [ "$n" -lt "$MEMHQ_MIN_PROMPT_CHARS" ]; then
    local lower
    lower=$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')
    case "$lower" in
      ok|yes|no|continue|stop|next|go|pause|ack|nop|y|n) return 0 ;;
    esac
    return 0
  fi
  return 1
}

# POST helper. Never blocks the hook. Returns 0 always.
# Args: <path>  <json body>
memhq_post() {
  local path="$1"
  local body="$2"
  if ! memhq_enabled; then return 0; fi
  if [ -z "$MEMHQ_API_KEY" ]; then
    memhq_log "skip $path: MEMHQ_API_KEY unset"
    return 0
  fi
  local resp
  resp=$(curl -sS --max-time 8 \
    -X POST "${MEMHQ_API_URL}${path}" \
    -H "Authorization: Bearer ${MEMHQ_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "$body" 2>&1) || true
  memhq_log "POST $path -> $(printf '%s' "$resp" | head -c 600)"
  printf '%s' "$resp"
  return 0
}

# jq wrapper that returns empty string on failure.
memhq_jq() {
  jq -r "$@" 2>/dev/null || printf ''
}
