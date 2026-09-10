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
