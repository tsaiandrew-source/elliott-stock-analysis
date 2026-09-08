# ELLIOTT+ STOCK ANALYSIS

Public front-end prototype for the stock-analysis chart surface, deployed as a
static GitHub Pages web app.

- Home: `data-model/home.html`
- Daily/Weekly/GEX charts: `chart-surface/index.html`
- Representative tickers: NBIS and IREN
- Data: contract based on the Google Sheets / GOOGLEFINANCE model, refreshed
  from the Apps Script proxy when a page opens
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

## Release checks

```text
node scripts/static-qa.mjs
node scripts/public-smoke.mjs
```

The public smoke check covers the home page, chart modes, and all 15 covered
ticker routes. The Apps Script proxy and the production data-control plane are
separate release gates; this repository does not contain their credentials or
private source archives.
