#!/bin/zsh
set -euo pipefail
umask 077

ROOT="${ELLIOTT_APP_REPO:-/Users/andrtsai/src/elliott-stock-analysis}"
NODE="${ELLIOTT_NODE:-/Users/andrtsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STATE_DIR="${ELLIOTT_REFRESH_STATE_DIR:-${HOME}/Library/Application Support/Elliott+/universal-refresh}"
INBOX="${ELLIOTT_ANALYSIS_INBOX:-/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-universal-refresh/outbox}"
GITHUB_WRAPPER="${ELLIOTT_GITHUB_WRAPPER:-${ROOT}/scripts/with-tsaiandrew-source}"
PACKET_WAIT_SECONDS="${ELLIOTT_PACKET_WAIT_SECONDS:-900}"
PACKET_POLL_SECONDS="${ELLIOTT_PACKET_POLL_SECONDS:-15}"
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

# The developer checkout may be dirty or behind. Resolve both the consumer code
# and canonical roster from a clean latest-main runtime worktree before ingest.
/usr/bin/git -C "$ROOT" fetch origin main
RUNTIME_DIR="${STATE_DIR}/runtime/latest-main-$RUN_ID"
mkdir -p "${STATE_DIR}/runtime"
/usr/bin/git -C "$ROOT" worktree add --detach "$RUNTIME_DIR" origin/main
cleanup_runtime() {
  /usr/bin/git -C "$ROOT" worktree remove --force "$RUNTIME_DIR" >/dev/null 2>&1 || true
}
trap cleanup_runtime EXIT INT TERM

waited=0
while ! find "$INBOX" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .; do
  if [[ "$waited" -ge "$PACKET_WAIT_SECONDS" ]]; then
    if [[ -f "${STATE_DIR}/pending-release.json" ]]; then
      print "[$RUN_ID] No new packet; resuming pending public verification"
    else
      print "[$RUN_ID] No packet after ${PACKET_WAIT_SECONDS}s; reconciling the live proxy with public state"
    fi
    break
  fi
  sleep "$PACKET_POLL_SECONDS"
  waited=$((waited + PACKET_POLL_SECONDS))
done

if find "$INBOX" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .; then
  "$NODE" "$RUNTIME_DIR/scripts/ingest-private-analysis.mjs" --inbox "$INBOX" --state-dir "$STATE_DIR"
fi
if [[ ! -x "$GITHUB_WRAPPER" ]]; then
  print -u2 "Personal GitHub credential wrapper is unavailable: $GITHUB_WRAPPER"
  exit 2
fi
"$GITHUB_WRAPPER" "$NODE" "$RUNTIME_DIR/scripts/sync-universal-refresh.mjs" --repo-root "$ROOT" --state-dir "$STATE_DIR" --slot "$SLOT" --release
print "[$RUN_ID] Universal Refresh $SLOT completed"
