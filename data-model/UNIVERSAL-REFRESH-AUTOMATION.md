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
   ambiguous workspace-wide location. The consumer waits up to 15 minutes
   inside both the primary and catch-up windows so a packet that finishes a
   few minutes after the calendar trigger is still consumed in the same run.
   Multiple unrelated packet heads remain fail-closed; when packets form an
   explicit `supersedesBatchId` chain, only the newest head is eligible and
   older inbox files are archived as superseded without being posted.
   An empty outbox after the wait never ends the run before reconciliation:
   the consumer still compares the live proxy with public state. This lets a
   later schedule recover automatically when private insertion succeeded but
   the subsequent public release failed before it could write a pending-release
   receipt.
   A hash-backed technical-chart handoff is an input to Iris's technical lane,
   not a replacement roster and not a publication route. Build a
   `correctionScope: technical-content` packet against the current canonical
   roster: update only supplied daily technical fields, preserve every
   unsupplied ticker and all non-technical fields, preserve completed-week
   analysis unless a weekly artifact was supplied, and assign a new RunID to
   every daily and weekly packet. The builder verifies the handoff, manifest,
   source, image and QA hashes plus completed-session closes before emitting a
   candidate. A technical handoff never authorizes Joanne, Clara, Drive or
   social operations. The handoff must target the canonical Iris Universal
   Refresh task and pass its routing-lock validator; applications must never
   reconstruct the analytical verdict from chart text or a historical archive
   handoff.
2. `ingest-private-analysis.mjs` validates the packet against the canonical
   roster, reads `elliott-ingest-token` / `INGEST_TOKEN` from macOS Keychain,
   appends it to the private Apps Script bridge, and waits until every run ID is
   visible through the canonical read proxy. The token is never printed or
   persisted. A failed or ambiguous write remains in the inbox for recovery.
   Before validation, the runner fetches `origin/main` and executes the
   consumer from a clean detached latest-main runtime worktree. A dirty or
   behind developer checkout therefore cannot supply an obsolete ticker
   roster. A correction may reuse an already visible superseded row only when
   it declares `correctionScope: roster-only`, names the exact
   `supersedesRunId`, and the completed-session close still matches. Content
   corrections require a newly visible run and cannot use this exception.
   `technical-content` corrections must name both `supersedesBatchId` and each
   packet's `supersedesRunId`; reusing the superseded RunID fails validation.
   Build a candidate with:

   ```sh
   node scripts/build-technical-reconciliation.mjs \
     --base <current-iris-analysis-contract-v2.json> \
     --handoff <iris-universal-refresh-technical-input.v1.json> \
     --routing-correction <append-only-routing-correction.json> \
     --routing-lock <locked-routing-contract.md> \
     --output <technical-content-correction.json> \
     --qa-output <qa.json>
   ```

   The output remains a private candidate until the normal ingest and release
   gates run; the builder itself never calls Apps Script, GitHub or a social
   destination.
3. `sync-market-data.mjs` resolves the hash-backed completed-session OHLCV
   artifact named by every daily packet and atomically publishes one
   `chart-surface/partial-market-data/<TICKER>.json` file for every canonical
   ticker. The whole release fails closed if a source hash is wrong, a ticker
   is absent, OHLCV is empty, packet `dataThrough` differs from the final bar
   date, or the packet close differs from the final bar close. `MANIFEST.json`
   records the exact per-ticker date, close and public file hash.
4. `sync-universal-refresh.mjs` reads the canonical proxy and overlays it on
   the bundled last-good contract. Coverage date, closing price, daily chart
   and weekly aggregation all derive from the same completed-session market
   dataset. An unavailable optional lane cannot replace a populated prior lane
   with an empty value. For a current daily run, the public core thesis is
   rebuilt from that same date's structured EoD opening plus its confirmation
   and invalidation. This prevents a carried last-good thesis from displaying
   an older closing price as today's close while optional lanes remain pending.
5. A clean isolated worktree may change only
   `chart-surface/data-contract.js` and
   `chart-surface/partial-market-data/*.json`. Static and PWA QA must pass before the
   exact `tsaiandrew-source` credential wrapper creates and merges a PR; the
   runner never depends on the globally active `gh` account.
   The LaunchAgent invokes the repo-native `scripts/with-tsaiandrew-source`
   wrapper, which asks `gh` for the personal `tsaiandrew-source` credential
   stored by macOS Keychain. The wrapper contains no token and deliberately
   lives beside the runner so background execution never depends on a
   TCC-protected `Documents` path.
6. The runner records a pending release, waits for GitHub Pages, verifies the
   exact SHA-256 of the published data contract and market manifest, then
   verifies every public ticker file's hash, final bar date and closing price.
   The public smoke matrix still covers the canonical roster. Proxy checks use
   bounded retries. A later replay re-verifies an unchanged pending release;
   only a complete pass records `PUBLISHED_AND_VERIFIED` or `NOOP_VERIFIED`.

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
