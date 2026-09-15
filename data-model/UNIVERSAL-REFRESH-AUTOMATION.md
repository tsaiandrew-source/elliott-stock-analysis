# Universal Refresh autonomous operations

This repository is the sole release destination for Elliott+ ticker data and
June cross-market digests. The two producers keep separate schemas and release
files, but both use fail-closed, idempotent PR promotion to `main`.

## Ticker analysis route

The local LaunchAgent runs on U.S. trading weekdays at 15:50 PT (primary) and
17:30 PT (catch-up). The primary accepts approved partial/provisional fields;
the catch-up firms up delayed validation lanes. Detailed missing-field reasons
remain backend-only.

1. The Iris producer writes a complete `iris-analysis-contract-v2` packet
   atomically to the canonical local handoff outbox at
   `/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-universal-refresh/outbox`.
   The scheduled consumer creates the directory when absent and never scans an
   ambiguous workspace-wide location.
2. `ingest-private-analysis.mjs` validates the packet against the canonical
   roster, reads `elliott-ingest-token` / `INGEST_TOKEN` from macOS Keychain,
   appends it to the private Apps Script bridge, and waits until every run ID is
   visible through the canonical read proxy. The token is never printed or
   persisted. A failed or ambiguous write remains in the inbox for recovery.
3. `sync-universal-refresh.mjs` reads the canonical proxy and overlays it on
   the bundled last-good contract. An unavailable optional lane cannot replace
   a populated prior lane with an empty value.
4. A clean isolated worktree may change only
   `chart-surface/data-contract.js`. Static and PWA QA must pass before the
   exact `tsaiandrew-source` credential wrapper creates and merges a PR; the
   runner never depends on the globally active `gh` account.
5. The runner records a pending release, waits for GitHub Pages, verifies the
   exact SHA-256 of the published data contract, and runs the public smoke
   matrix across the canonical roster. Proxy checks use bounded retries. A
   later replay re-verifies an unchanged pending release; only a complete pass
   records `PUBLISHED_AND_VERIFIED` or `NOOP_VERIFIED`.

The run state, processed packets, locks, logs and release receipt are durable
under `~/Library/Application Support/Elliott+/universal-refresh`; none are
committed to the public repository. Replaying the same proxy content is a
quiet `NOOP` and cannot create a duplicate PR.

## June digest route

June owns producer packets in
`/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/outbox`.
The existing digest consumer/release runner remains the sole owner of
`data-model/digests.json` and `data-model/digest-data.js`: 05:50/06:20 morning,
11:50/12:20 midday, 16:20/16:50 close on weekdays, and 16:20/16:50 weekly on
Sunday. Those are canonical scheduled releases with standing authority; they
must not ask for per-run approval when destination, account, series and scope
are unchanged and all gates pass.

## Failure policy

Missing credentials, invalid packets, roster drift, stale or malformed proxy
responses, unexpected worktree changes, failed QA, merge conflicts, failed
Pages deployment or failed public smoke all stop the affected route. The last
good UI remains live. Recovery retries the unchanged route; it never bypasses
a failed gate and never requires routine owner involvement.
