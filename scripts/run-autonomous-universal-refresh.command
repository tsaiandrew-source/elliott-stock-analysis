#!/bin/zsh
set -euo pipefail
umask 077

ROOT="${ELLIOTT_APP_REPO:-/Users/andrtsai/src/elliott-stock-analysis}"
NODE="${ELLIOTT_NODE:-/Users/andrtsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STATE_DIR="${ELLIOTT_REFRESH_STATE_DIR:-${HOME}/Library/Application Support/Elliott+/universal-refresh}"
INBOX="${ELLIOTT_ANALYSIS_INBOX:-/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-universal-refresh/outbox}"
GITHUB_WRAPPER="${ELLIOTT_GITHUB_WRAPPER:-${ROOT}/scripts/with-tsaiandrew-source}"
LOG_DIR="${STATE_DIR}/logs"
mkdir -p "$LOG_DIR" "$INBOX"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/$RUN_ID.log"
exec >> "$LOG_FILE" 2>&1

SLOT="${1:-}"
if [[ -z "$SLOT" ]]; then
  local_hour="$(TZ=America/Los_Angeles date +%H)"
  if [[ "$local_hour" -lt 17 ]]; then SLOT="primary"; else SLOT="catchup"; fi
fi

print "[$RUN_ID] Universal Refresh $SLOT started"
"$NODE" "$ROOT/scripts/ingest-private-analysis.mjs" --inbox "$INBOX" --state-dir "$STATE_DIR"
if [[ ! -x "$GITHUB_WRAPPER" ]]; then
  print -u2 "Personal GitHub credential wrapper is unavailable: $GITHUB_WRAPPER"
  exit 2
fi
"$GITHUB_WRAPPER" "$NODE" "$ROOT/scripts/sync-universal-refresh.mjs" --repo-root "$ROOT" --state-dir "$STATE_DIR" --slot "$SLOT" --release
print "[$RUN_ID] Universal Refresh $SLOT completed"
