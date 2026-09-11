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

Run `node appsheet-prototype/data-model/validate-universal-refresh-gex-v1.mjs <packet.json>`. The previous `gexSummary` contract may remain readable as legacy history, but all new Universal Refresh GEX batches must use this version. Migration is append-only: do not overwrite prior AnalysisRun, OptionsSnapshot, GEXLevel, or benchmark artifacts.
