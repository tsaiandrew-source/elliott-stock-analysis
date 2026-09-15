# ELLIOTT+ STOCK ANALYSIS

Public front-end prototype for the stock-analysis chart surface, deployed as a
static GitHub Pages web app.

The site is installable as a PWA on iPhone and iPad. The PWA shell includes
opaque Apple touch icons, a maskable icon, safe-area-aware layouts, and an
offline fallback. App documents use network-first navigation so an online open
still receives current HTML, while versioned local assets use stale-while-
revalidate. The live Apps Script analysis proxy is deliberately outside the
service-worker cache; existing bundled-data fallback behavior remains the data
availability boundary.

- Home: `data-model/home.html`
- Daily/Weekly/GEX charts: `chart-surface/index.html`
- Cross-market Digest home: `data-model/home.html`
- Coverage browser: `data-model/coverage.html`
- Digest source of truth: `data-model/digests.json`
- Static digest bundle/model: `data-model/digest-data.js` and `data-model/digest-model.js`
- Digest ingestion contract and command: `data-model/DIGEST-INGESTION.md` and `scripts/ingest-digests.mjs`
- Representative tickers: NBIS and IREN
- Data: contract based on the Google Sheets / GOOGLEFINANCE model, refreshed
  from the read-only Apps Script proxy when a page opens
- Charting: TradingView Lightweight Charts attribution is retained in the UI

This deployment contains only the front-end files. The operating repository,
private analysis archives, and credentials are not included.

## Update behavior

Each page renders the last bundled contract immediately, then requests the
current public proxy contract with a no-store request. A changed contract is
cached for the current browser session and causes one reload so Home and Chart
share the same latest snapshot. If the proxy is unavailable, the last bundled
snapshot remains visible and incomplete analysis is labeled as partial rather
than being fabricated.

Pending analysis does not make a chart-capable ticker unreachable. Home keeps
partial-safe ticker rows selectable when a market chart source is available;
the separate Apps Script ingestion bridge is write-only and is never called by
the browser.

## Release checks

```text
node scripts/static-qa.mjs
node scripts/pwa-qa.mjs
node scripts/public-smoke.mjs
node scripts/close-digest-consumer-qa.mjs
node scripts/close-digest-release-qa.mjs
node scripts/close-digest-cycle-qa.mjs
```

The public smoke check covers the home page, chart modes, and all 15 covered
ticker routes. The Apps Script proxy and the production data-control plane are
separate release gates; this repository does not contain their credentials or
private source archives.

## Durable desktop app (Tauri v2)

The repository also contains a Tauri v2 desktop shell. The desktop build embeds
a staged copy of the same static application, so it can start without GitHub
Pages or a network connection. Live market refreshes still use the public proxy
when available and retain the existing bundled-data fallback when it is not.

Desktop releases follow the same producer boundaries as the web app. June's
digest release runner remains the only writer of `data-model/digests.json` and
`data-model/digest-data.js`; Universal Refresh remains the only writer of the
published analysis contract. Build the desktop app from `main` only after those
gated producer releases land. The staging QA verifies that the shared navigation,
digest bundle, and all tracked same-origin OHLCV payloads are embedded, and it
fails when a payload's declared `dataThrough` date is later than its final bar.

Before rendering a primary surface, the desktop app also checks the canonical
GitHub Pages publication. It accepts market data only when the manifest,
per-ticker SHA-256 hashes, completed-session dates, closing prices, and analysis
contract dates agree. It checks again every five minutes and whenever the app
regains focus. A newer validated publication is applied with a reload; an
unavailable, incomplete, stale, or invalid publication cannot replace newer
accepted data.

Desktop-only persistence remembers the last valid Home, Coverage, or Chart
route, coverage overrides, and native window geometry between launches. Live
session caches are deliberately excluded so an unvalidated market snapshot is
not promoted to durable state. The validated analysis contract, ticker OHLCV
payloads, and digest dataset are kept in a separate Tauri Store cache for offline
launches, with the bundled snapshot as the final fallback. The source PWA is
unchanged; service-worker registration is removed only from the staged Tauri
copy. Public source links open in the system browser, keeping the embedded
application route intact.

Requirements: Node.js 24+, pnpm 11+, Rust 1.77.2+, and the platform prerequisites
listed in the Tauri v2 documentation.

```text
pnpm install
pnpm desktop:qa
pnpm desktop:dev
pnpm desktop:build
```

`desktop:build` creates the platform application and installer bundles under
`src-tauri/target/release/bundle/`. Public distribution still requires the
appropriate platform signing and, on macOS, notarization credentials.
