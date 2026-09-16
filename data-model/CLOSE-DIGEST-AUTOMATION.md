# Digest automation contract

This contract provides one fail-closed ingestion and release path for the weekday Elliott cross-market **morning**, **midday**, and **close** editions plus the Sunday **weekly** edition. The existing close command remains backward compatible: omitting `--edition` still selects `close`. The pipeline does not touch the Iris v2/AppSheet ticker feed or any social route.

## Ownership

- The digest heartbeat is the producer only. After research and editorial gates pass, it atomically writes one completed `elliott-cross-market-digest-v1` packet to the producer-owned outbox.
- The Elliott app consumer validates the packet and writes acknowledged local copies of `data-model/digests.json` and `data-model/digest-data.js`.
- The consumer never pushes, opens a PR, merges, changes settings, or deploys.
- The release runner is the sole GitHub promotion owner. It replays the acknowledged packet into only those two outputs in an isolated worktree based on the latest `origin/main`, preserving editions or revisions that merged after the local consumer checkout was created.
- `run-close-digest-cycle.mjs` joins the stages and accepts `--edition morning|midday|close|weekly`. The filename is retained so the activated close command does not break.
- The user-authorized local LaunchAgent is the scheduler and invokes the deterministic consumer/release runner. Codex consumer wakes must remain disabled so there is only one promotion owner.

## Cadence

All times use `America/Los_Angeles`.

| Edition | Producer | Primary consumer | Recovery consumer |
|---|---:|---:|---:|
| morning | weekdays 05:30 | 05:50 | 06:20 |
| midday | weekdays 11:30 | 11:50 | 12:20 |
| close | weekdays 16:00 | 16:20 | 16:50 |
| weekly | Sunday 16:00 | 16:20 | 16:50 |

Primary absence is a quiet no-op. Recovery reconciles an existing acknowledgement/release state without re-ingesting; otherwise it retries with `--require-present` and reports a failed gate if the packet is still missing. Saturday has no run. Sunday morning and midday expansion wakes remain quiet.

The producer and consumer are deliberately separated by 20 minutes. Recovery runs 30 minutes later. This avoids making release latency part of research time and keeps each edition out of the next producer window.

## Producer packet

The producer writes a temporary file and renames it into the outbox only after every source, timestamp, fact, and editorial gate passes. Each packet contains exactly one record:

- `id: daily-YYYY-MM-DD-<edition>`;
- `cadence: daily` and `edition: morning|midday|close`;
- the correct `marketDate` and `timezone: America/Los_Angeles`;
- `status: complete` and a positive integer `revision`;
- `publishedAt`, `sourceCutoffAt`, and `retrievedAt` ISO-8601 timestamps;
- publication no earlier than 05:30 for morning, 11:30 for midday, or 16:00 for close;
- non-empty Traditional Chinese `title`, `summary`, and `sections`;
- at least one safe HTTP(S) source link.

The Sunday weekly packet contains exactly one record with:

- `id: weekly-YYYY-MM-DD`, where the date is the Monday `weekStart`;
- `cadence: weekly`, `edition: weekly`, and that same `weekStart`;
- `timezone: America/Los_Angeles`, `status: complete`, and a positive integer `revision`;
- `publishedAt` on the following Sunday at or after 16:00 PT, plus same-Sunday `sourceCutoffAt` and `retrievedAt`;
- non-empty Traditional Chinese `title`, `summary`, and `sections`;
- at least one safe HTTP(S) source link.

Corrections retain the ID and edition slot, increment `revision`, change content, and set a later `updatedAt`. Existing ingestion guards reject stale and same-revision conflicts.

Recommended filenames are:

- `daily-YYYY-MM-DD-morning.json`
- `daily-YYYY-MM-DD-midday.json`
- `daily-YYYY-MM-DD-close.json`
- `weekly-YYYY-MM-DD.json` using the Monday `weekStart`

## Runtime paths

- `ELLIOTT_APP_REPO`: checked-out `elliott-stock-analysis` repository.
- `ELLIOTT_DIGEST_OUTBOX`: producer-owned `outbox/` directory.
- `ELLIOTT_DIGEST_STATE_DIR`: durable consumer state outside Git, on the same filesystem as the outbox.

Recommended handoff root:

`/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/`

Consumer state is edition-scoped and contains `locks/`, `processing/`, `archive/YYYY-MM-DD/`, `quarantine/`, `acks/<digest-id>.json`, `releases/<digest-id>-rN.json`, and append-only `runs.ndjson`.

## Autonomous LaunchAgent

`automation/macos/com.tsaiandrew.elliott-cross-market-digest.plist` runs the local wrapper at every primary and recovery checkpoint. `RunAtLoad` provides catch-up after login or restart. The scheduler resolves all due editions in `America/Los_Angeles`, so a wake after sleep retries earlier same-day editions before the current one.

The wrapper is `scripts/run-autonomous-cross-market-digest.command`. It writes a private per-run log under `consumer-state/autonomous-logs/` and invokes `scripts/run-autonomous-cross-market-digest.mjs`. The Node scheduler:

- uses only the Keychain-backed `with-tsaiandrew-source` credential wrapper;
- runs the existing fail-closed cycle for each due edition;
- continues to later editions when an earlier edition fails, then reports an aggregate failed gate;
- records an append-only `autonomous-runs.ndjson` receipt;
- remains quiet for successful and idempotent runs;
- shows a local macOS notification only when one or more routes fail.

Install the checked-in plist at `~/Library/LaunchAgents/com.tsaiandrew.elliott-cross-market-digest.plist`, validate it with `plutil`, then bootstrap it in the current GUI domain. The installed job must point to `/Users/andrtsai/src/elliott-stock-analysis` and the credential wrapper at `/Users/andrtsai/Library/Application Support/Elliott+/credentials/with-tsaiandrew-source`.

## Manual recovery command

Primary check for an edition:

```sh
node scripts/run-close-digest-cycle.mjs \
  --edition morning \
  --mode primary \
  --repo-root "$ELLIOTT_APP_REPO" \
  --outbox "$ELLIOTT_DIGEST_OUTBOX" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR" \
  --public-base-url https://tsaiandrew-source.github.io/elliott-stock-analysis
```

Recovery uses the same command with `--mode recovery`. Substitute `midday`, `close`, or `weekly` for the other slots. Weekly deterministic tests use `--week-start`; daily tests use `--market-date`. `--now` and `--max-age-minutes` support deterministic testing. Use the bundled Codex Node runtime when system Node is unavailable.

The consumer takes an exclusive per-date, per-edition lock; discovers exactly one matching packet; validates identity, slot, timestamps, freshness, and sources; claims it by atomic rename; updates both app data files atomically; and runs digest-ingest, static, and PWA QA. Failure restores both files and quarantines the packet. Replays are unchanged no-ops at the store layer.

## Deterministic release

The release runner accepts a consumer acknowledgement and its archived packet. It rejects anything except an `INGESTED` or `UNCHANGED` result whose digest ID, slot date (`marketDate` or `weekStart`), cadence, edition, revision, packet hash, output hashes, and three QA results all match.

Before promotion it requires the consumer checkout's `HEAD` to equal freshly fetched `origin/main` and its complete dirty set to be exactly:

- `data-model/digests.json`
- `data-model/digest-data.js`

The runner verifies the acknowledged local hashes, then replays that exact packet onto the latest remote dataset rather than copying an older complete dataset over it. The deterministic branch is `codex/digest-YYYY-MM-DD-<edition>-rN`, using `marketDate` for daily editions and Monday `weekStart` for weekly. PR metadata and the public-smoke target derive from the packet identity and SHA-256. State transitions are `PREPARED`, `PUSHED`, `PR_OPEN`, `MERGED`, `PAGES_PASSED`, then `PUBLISHED`. Recovery resumes from durable state and searches for the deterministic branch's existing PR before creating one.

Unexpected changes, identity or hash drift, missing authentication, API errors, failed checks, merge conflicts, absent or failed Pages runs, and public-smoke failures stop the release. Runtime credentials are never stored in this repository.

## Authorization boundary

Andrew activated this exact scheduled route on 2026-09-15. No per-run review is required while the schedule, repository, GitHub identity, packet schema, two-file output scope, PR/check/squash-merge/Pages sequence, and recovery behavior remain unchanged.

The standing authority is limited to `tsaiandrew-source/elliott-stock-analysis`, `data-model/digests.json`, `data-model/digest-data.js`, the morning/midday/close/weekly cadence above, and its same-day recovery. A changed repository, account, schedule, schema, output file, action type, or publication series requires new review. Every validation or platform gate still fails closed.

## Reporting

Stay quiet for `NOOP` and `consumer_locked`. Report only:

- `INGESTED` with edition, digest ID, revision, packet and output hashes, QA status, and acknowledgement path;
- `PUBLISHED` with PR, merge commit, Pages run, and exact digest public-smoke result;
- `FAILED_GATE` for persistent absence, malformed or unsafe data, stale/conflicting/duplicate packets, QA rollback, or Pages verification failure;
- required user action for repository access, credentials, branch protection, or deployment repair.

The producer heartbeat must never run the consumer, rewrite producer analysis, bypass a failed gate, write the app store directly, or cross into Iris/AppSheet or social publishing.
