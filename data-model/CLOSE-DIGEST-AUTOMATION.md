# Close digest automation contract

This contract automates only the weekday Elliott cross-market **close** edition. It does not replace the producer cadence, touch the Iris v2/AppSheet ticker feed, or authorize an external release.

## Ownership

- June/Universe Refresh is the producer. It researches, verifies, and publishes one completed `elliott-cross-market-digest-v1` packet to the outbox.
- The Elliott app consumer is the only writer to `data-model/digests.json` and `data-model/digest-data.js`.
- GitHub promotion remains a separate release stage. The local consumer never pushes, opens a PR, merges, changes settings, or deploys.

## Cadence

The producer keeps its existing America/Los_Angeles cadence: weekdays at 05:30, 11:30, and 16:00, plus the separate Sunday 16:00 weekly edition.

The close consumer wakes on weekdays at:

- 16:20 for the primary check. A missing packet is a quiet no-op.
- 16:50 for recovery. This run uses `--require-present`; a still-missing packet is a failed gate.

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

## Consumer commands

Primary check:

```sh
node scripts/consume-close-digest.mjs \
  --repo-root "$ELLIOTT_APP_REPO" \
  --outbox "$ELLIOTT_DIGEST_OUTBOX" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR"
```

Recovery check:

```sh
node scripts/consume-close-digest.mjs \
  --repo-root "$ELLIOTT_APP_REPO" \
  --outbox "$ELLIOTT_DIGEST_OUTBOX" \
  --state-dir "$ELLIOTT_DIGEST_STATE_DIR" \
  --require-present
```

Use `--dry-run`, `--market-date`, `--now`, and `--max-age-minutes` for deterministic validation and recovery testing.

The consumer takes an exclusive per-date lock, discovers one matching packet, validates identity/slot/timestamps/freshness/sources, claims it by atomic rename, updates both app data files atomically, and runs digest-ingest, static, and PWA QA. On QA failure it restores both app files and quarantines the claimed packet. Replays are unchanged no-ops at the store layer.

## Release and Pages verification

After a separately authorized release has merged and GitHub Pages reports success, verify the exact deployed record without invoking the Iris/AppSheet proxy:

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
- `FAILED_GATE` for persistent absence, malformed/unsafe/stale/conflicting/duplicate packets, QA rollback, or Pages verification failure;
- a required user action when release authorization, repository access, credentials, or deployment repair is needed.

The heartbeat must never rewrite producer analysis, bypass a failed gate, or make the producer write the app store directly.
