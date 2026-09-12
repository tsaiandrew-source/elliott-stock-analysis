# Universal Refresh GEX Contract v1

Version: `universal-refresh-gex-v1`

This append-only contract is the sole machine-loadable shape for Universal Refresh GEX packets. It covers the exact ordered universe `LITE, NBIS, PLTR, IREN, NOK, ACHR, CSCO, AMKR, ONDS, NVDA, MRVL, SNDK, AVGO, 2646, 2330` and always carries both `currentExpiration` and `nextExpiration`.

## Status and rendering

- `renderable`: non-empty, equal-length, finite numeric `strikes` and `exposure`; `exposureType=signed_dealer_gex`; direct signed evidence is required.
- `aggregate_only`: public aggregate/unsigned sensitivity may be retained for analysis, but the chart consumer must not draw it as GEX.
- `not_available`: required evidence is missing; arrays stay empty and no chart is rendered.
- `not_applicable`: required for 2646 and 2330; arrays stay empty and no chart is rendered.

The consumer never falls back from a non-renderable Universal GEX record to candles, old benchmark profiles, or another expiration. `magnet`, `gammaFlip`, `dealerCallWall`, and `dealerPutWall` remain `null` unless direct, method-consistent signed dealer evidence supports the specific field.

## Freshness and language

Every expiration carries its own `dataThrough`, provider `sourceCutoff`, `sourceProvider`, `sourceUrl`, `calculationMethod`, limitations, Traditional Chinese `displayText`, locked Traditional Chinese labels, and separate provider/retrieval freshness timestamps. A delayed public quote must say so in `quoteDelayDisclosureZh`.

## Append-only ingestion

Each ticker has a unique `runId` and nullable `supersedesRunId`. The converter `build-universal-refresh-gex-ingest.mjs` emits immutable `OptionsSnapshot` and `GEXLevel` rows and never advances a consumer pointer. For unsigned rows it writes `ExposureSign=unsigned`, never positive/negative dealer sign.

## Validation and migration

Run `node scripts/validate-universal-refresh-gex.mjs <packet.json>` before publishing a packet, or use `node scripts/ingest-universal-refresh-gex.mjs --input <packet.json>` to validate and atomically publish the browser bundle. Add `--check` to the ingest command for a no-write dry run. The static QA also validates the browser bundle, so a malformed or incomplete Universal Refresh batch fails before it can be served to the UI. The previous `gexSummary` contract may remain readable as legacy history, but all new Universal Refresh GEX batches must use this version. Migration is append-only: do not overwrite prior AnalysisRun, OptionsSnapshot, GEXLevel, or benchmark artifacts.

For the autonomous local bridge, run `node scripts/run-universal-refresh-gex-cycle.mjs --outbox <outbox-dir>`. The cycle accepts exactly one packet, validates it, publishes the browser bundle, runs Static QA and PWA QA, and rolls the bundle back if either QA fails. With `--check`, it validates the discovered packet without writing. An empty outbox is a quiet `NOOP`; multiple packets are a failed gate so the bridge cannot choose nondeterministically.

The packet is intentionally split into two layers: Universal Refresh owns the canonical per-ticker/current-next-expiration profile and provenance; richer OI, volume, IV, and unsigned-side rankings may be carried by the analysis overlay, but must not be silently promoted to signed dealer GEX, Gamma Flip, Magnet, or dealer Walls. The UI may display an unsigned pressure map only when it is labelled as unsigned sensitivity and never as a formal GEX landmark.
