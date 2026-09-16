# Universal ticker lifecycle contract v1

`coverage-roster.json` is the public application's single canonical ticker
registry. The generated `coverage-order.js`, UI navigation, sanitized contract,
completed-session market files, manifest, Universal Refresh validator and PWA
cache must agree with it before a ticker change can ship.

Ticker lifecycle changes span three independently gated planes:

1. **Live source plane** — Coverage and CoverageMembership in the production
   Google Sheet. Additions become active only after identity and membership are
   complete. Removals set the legacy Coverage row inactive and every active
   membership row to `inactive` / `FALSE`; historical rows are retained.
2. **Producer plane** — the private Universal Refresh roster, fixture and
   selection code. A producer run must emit exactly the canonical ticker set.
3. **Public plane** — this repository's registry, generated browser bundle,
   fallback contract, market-data files and manifest.

No plane silently authorizes another. A lifecycle record under
`docs/ticker-lifecycle-events/` ties their evidence together.

## Public command

The command is dry-run by default. `--apply` is required for writes.

Remove:

```sh
pnpm ticker:lifecycle remove OKLO --effective-date 2026-09-16
pnpm ticker:lifecycle remove OKLO --effective-date 2026-09-16 --apply
```

Add (real completed-session OHLCV is mandatory):

```sh
pnpm ticker:lifecycle add XYZ \
  --company "Example Corp" --exchange NASDAQ \
  --group exploration --market us --default-view daily \
  --market-source "https://authoritative.example/XYZ" \
  --market-data /absolute/path/to/XYZ.json \
  --gex-record /absolute/path/to/XYZ-gex-record.json --after AVGO

pnpm ticker:lifecycle add XYZ ...same reviewed arguments... --apply
```

An add fails closed if identity metadata, a valid completed-session market
artifact or a reviewed GEX evidence record is absent. The tool never invents
prices, analysis or signed dealer evidence. It creates a partial-safe coverage
row and keeps unsigned GEX fail-closed. A remove recursively prunes
ticker-bearing rows and keyed objects, removes the market file, rebuilds the
roster-complete GEX packet and market manifest, regenerates the browser bundle
and increments the PWA cache version.

## Operator sequence

1. Prepare and review the lifecycle event (identity, reason, effective date,
   roster position, source references and rollback intent).
2. Dry-run the public command and producer command. Confirm both report the
   same before/after ticker counts.
3. Apply the live Sheet state and verify the exact rows.
4. Apply the private producer change and run its self-test.
5. Apply the public change and run all gates below.
6. Commit each plane separately. Open the public PR only after the exact release
   scope is reviewed and explicitly approved.
7. After merge, wait for Pages and smoke-test Coverage plus daily, weekly and
   GEX routes. Update the lifecycle event with the merge and public evidence.

## Required gates

```sh
pnpm coverage:check
pnpm ticker:lifecycle:qa
node scripts/validate-ticker-onboarding.mjs <ACTIVE_TICKER>
node scripts/sync-market-data-qa.mjs
node scripts/static-qa.mjs
node scripts/pwa-qa.mjs
pnpm desktop:qa
```

For removals, static QA also rejects retired-ticker references and any stray
market file. For additions, the registry, generated bundle, sanitized contract,
manifest and market data must all contain the same symbol.

## Rollback and history

Rollback is another reviewed lifecycle change; do not re-enable a ticker by
editing only the UI. Removal preserves Git history, archived packets and Sheet
history. It only removes the symbol from active selection, refresh, contract,
navigation and current market-data publication.
