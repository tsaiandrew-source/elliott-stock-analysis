# Close digest automation contract

This contract automates only the weekday Elliott cross-market **close** edition. It does not replace the producer cadence or touch the Iris v2/AppSheet ticker feed. The release runner is fail-closed and may publish only the exact close packet bound to a successful consumer acknowledgement.

## Ownership

- June/Universe Refresh is the producer. It researches, verifies, and publishes one completed `elliott-cross-market-digest-v1` packet to the outbox.
- The Elliott app consumer is the only writer to `data-model/digests.json` and `data-model/digest-data.js`.
- The local consumer never pushes, opens a PR, merges, changes settings, or deploys.
- `release-close-digest.mjs` is the sole GitHub promotion owner. It stages only the two acknowledged digest outputs in an isolated worktree based on the latest `origin/main`.
- `run-close-digest-cycle.mjs` joins the stages for the heartbeat while preserving their separate gates and durable state.

## Cadence

The producer keeps its existing America/Los_Angeles cadence: weekdays at 05:30, 11:30, and 16:00, plus the separate Sunday 16:00 weekly edition.

The close consumer wakes on weekdays at:

- 16:20 for the primary check. It ingests and then releases a valid packet. A missing packet is a quiet no-op.
- 16:50 for recovery. It reconciles an existing acknowledgement/release state without re-ingesting. If no acknowledgement exists, it retries ingestion with `--require-present`; a still-missing packet is a failed gate.

There is no Saturday or Sunday close-consumer run. The Sunday weekly edition requires its own future consumer contract.

## Producer packet

The producer atomically writes a temporary file and renames it into the configured outbox only after completion. A close packet contains exactly one record and must include:

- `id: daily-YYYY-MM-DD-close`;
- `cadence: daily` and `edition: close`;
- the correct `marketDate` and `timezone: America/Los_Angeles`;
- `status: complete` and a positive integer `revision`;
- `publishedAt`, `sourceCutoffAt`, and `retrievedAt` ISO-8601 timestamps;
- non-empty Traditional Chinese `title`, `summary`, and `sections`;
- at least one safe HTTP(S) source link.

Corrections keep the same ID and slot, increment `revision`, change content, and set a later `updatedAt`. Existing ingestion guards reject stale and same-revision conflicts.

## Runtime paths

Configure these absolute paths in the heartbeat host:

- `ELLIOTT_APP_REPO`: checked-out `elliott-stock-analysis` repository.
- `ELLIOTT_DIGEST_OUTBOX`: producer-owned `outbox/` directory.
- `ELLIOTT_DIGEST_STATE_DIR`: durable consumer state outside Git, on the same filesystem as the outbox.

Recommended handoff root:

`/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/`

The consumer state contains `locks/`, `processing/`, `archive/YYYY-MM-DD/`, `quarantine/`, `acks/<digest-id>.json`, and append-only `runs.ndjson`.

## Heartbeat commands

Primary check:

```sh
node scripts/run-close-digest-cycle.mjs \
  --mode primary \
  --repo-root "$ELLIOTT_APP_REPO" \
  --outbox "$ELLIOTT_DIGEST_OUTBOX" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR"
```

Recovery check:

```sh
node scripts/run-close-digest-cycle.mjs \
  --mode recovery \
  --repo-root "$ELLIOTT_APP_REPO" \
  --outbox "$ELLIOTT_DIGEST_OUTBOX" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR"
```

Use `--market-date`, `--now`, and `--max-age-minutes` for deterministic validation and recovery testing. If system Node is unavailable, use the bundled Codex Node runtime.

The consumer takes an exclusive per-date lock, discovers one matching packet, validates identity/slot/timestamps/freshness/sources, claims it by atomic rename, updates both app data files atomically, and runs digest-ingest, static, and PWA QA. On QA failure it restores both app files and quarantines the claimed packet. Replays are unchanged no-ops at the store layer.

## Deterministic release

The release runner accepts `--consumer-result <ack.json>` and optionally `--packet <archive.json>`; otherwise it uses the acknowledgement's archived packet. It rejects anything except an `INGESTED` or `UNCHANGED` close result whose digest ID, market date, edition, revision, packet hash, output hashes, and three QA results all match.

Before promotion it requires the consumer checkout's `HEAD` to equal freshly fetched `origin/main` and its complete dirty set to be exactly:

- `data-model/digests.json`
- `data-model/digest-data.js`

It creates `codex/digest-YYYY-MM-DD-close-rN` in `consumer-state/release-worktrees/`, copies and re-hashes only those outputs, reruns all QA, and commits only those paths. The PR title, body, branch, and public-smoke target are derived deterministically from the packet identity and SHA-256.

Each transition is atomically recorded in `consumer-state/releases/<digest-id>-rN.json`: `PREPARED`, `PUSHED`, `PR_OPEN`, `MERGED`, `PAGES_PASSED`, then `PUBLISHED`. A recovery run resumes from that state, searches for the deterministic branch's existing PR before creating one, and returns `NOOP` after publication. Unexpected changes, identity/hash drift, missing authentication, API errors, failed checks, merge conflicts, absent/failed Pages runs, and public-smoke failures stop the release.

For a local-only rehearsal that stops before all network mutations:

```sh
node scripts/release-close-digest.mjs \
  --repo-root "$ELLIOTT_APP_REPO" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR" \
  --consumer-result "$ELLIOTT_DIGEST_STATE_DIR/acks/daily-YYYY-MM-DD-close.json" \
  --prepare-only
```

Runtime credentials are not stored by this repository. Full promotion assumes:

- `origin` is the intended public GitHub repository;
- Git push authentication is already configured;
- `gh auth status` succeeds with permission to create and squash-merge PRs and read Actions;
- required branch checks and GitHub Pages are enabled;
- public smoke can reach the Pages URL.

## Release and Pages verification

After the deterministic release has merged and GitHub Pages reports success, the runner verifies the exact deployed record without invoking the Iris/AppSheet proxy:

```sh
PUBLIC_BASE_URL=https://tsaiandrew-source.github.io/elliott-stock-analysis \
EXPECTED_DIGEST_ID=daily-YYYY-MM-DD-close \
PUBLIC_SMOKE_SKIP_PROXY=1 \
node scripts/public-smoke.mjs
```

`digest-data.js` and `digests.json` use a network-first service-worker path with offline cache fallback, so every published digest revision is fetched without a manually authored cache-version bump.

## Reporting

Stay quiet for `NOOP` and `consumer_locked`. Report only:

- `INGESTED` with digest ID, revision, packet hash, app-output hashes, QA status, and acknowledgement path;
- `PUBLISHED` with PR, merge commit, Pages run, and exact digest public-smoke result;
- `FAILED_GATE` for persistent absence, malformed/unsafe/stale/conflicting/duplicate packets, QA rollback, or Pages verification failure;
- a required user action when repository access, credentials, branch protection, or deployment repair is needed.

The heartbeat must never rewrite producer analysis, bypass a failed gate, or make the producer write the app store directly.
