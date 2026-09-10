# Cross-market digest ingestion

The app is the only writer to `data-model/digests.json`. Universe Refresh produces packets; it does not edit app files or run a competing ingestion job.

## Producer handoff

Universe Refresh emits one JSON object using `elliott-cross-market-digest-v1`. The object may be a single record or a dataset with `records[]`.

Every daily record requires:

- a stable `id`;
- `cadence: "daily"`;
- one `edition`: `morning`, `midday`, or `close`;
- `marketDate` in `YYYY-MM-DD`;
- an ISO-8601 `publishedAt` and an IANA `timezone`;
- non-empty `title`, `summary`, and `sections`.

Corrections retain the same ID and slot, change the content, and set `updatedAt` later than the stored revision. A different ID cannot occupy an existing date/edition slot.

## Consumer command

Validate without writing:

```sh
node scripts/ingest-digests.mjs --input /absolute/path/to/packet.json --check
```

Ingest atomically:

```sh
node scripts/ingest-digests.mjs --input /absolute/path/to/packet.json
```

The command upserts `data-model/digests.json` and regenerates `data-model/digest-data.js` for the static/offline app. Replaying an unchanged packet performs no writes. Stale corrections, same-revision conflicts, duplicate IDs, duplicate slots, malformed dates, and unsafe source URLs fail before either output changes.

## Heartbeat boundary

The app-owned heartbeat may discover a completed Universe Refresh packet and invoke the consumer command. It must remain quiet when there is no new packet. It reports only an ingestion, validation failure, or required user action. The producer must never write the store directly.
