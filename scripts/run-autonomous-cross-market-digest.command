#!/bin/zsh
set -euo pipefail
umask 077

ROOT="${ELLIOTT_APP_REPO:-/Users/andrtsai/src/elliott-stock-analysis}"
NODE="${ELLIOTT_NODE:-/Users/andrtsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STATE_DIR="${ELLIOTT_DIGEST_STATE_DIR:-/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/consumer-state}"
OUTBOX="${ELLIOTT_DIGEST_OUTBOX:-/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/outbox}"
GITHUB_WRAPPER="${ELLIOTT_GITHUB_WRAPPER:-/Users/andrtsai/Library/Application Support/Elliott+/credentials/with-tsaiandrew-source}"
LOG_DIR="${STATE_DIR}/autonomous-logs"
mkdir -p "$LOG_DIR" "$OUTBOX"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/$RUN_ID.log"
exec >> "$LOG_FILE" 2>&1

export ELLIOTT_APP_REPO="$ROOT"
export ELLIOTT_NODE="$NODE"
export ELLIOTT_DIGEST_STATE_DIR="$STATE_DIR"
export ELLIOTT_DIGEST_OUTBOX="$OUTBOX"
export ELLIOTT_GITHUB_WRAPPER="$GITHUB_WRAPPER"

print "[$RUN_ID] Elliott cross-market digest scheduler started"
"$NODE" "$ROOT/scripts/run-autonomous-cross-market-digest.mjs"
print "[$RUN_ID] Elliott cross-market digest scheduler completed"
