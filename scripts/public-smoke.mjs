const base = (process.env.PUBLIC_BASE_URL || 'https://tsaiandrew-source.github.io/elliott-stock-analysis').replace(/\/$/, '');
const proxyBaseUrl = process.env.PUBLIC_PROXY_URL || 'https://script.google.com/macros/s/AKfycbyNsvi0AFuZYFVnqxWajYeBLgzGuHOqHDAduZfaSMyfSzEWK2BsIaVBWEGxFrWKd9HGbQ/exec';
const tickers = ['2646', 'LITE', 'NBIS', 'PLTR', 'IREN', 'NOK', 'ACHR', 'CSCO', 'AMKR', 'ONDS', 'NVDA', 'MRVL', 'SNDK', '2330', 'AVGO'];
const routes = [
  '/',
  '/manifest.webmanifest',
  '/service-worker.js',
  '/offline.html',
  '/assets/elliott-asterisk-icon-192.png',
  '/assets/elliott-asterisk-icon-512.png',
  '/assets/elliott-asterisk-maskable-512.png',
  '/assets/elliott-asterisk-apple-touch-icon.png',
  '/assets/elliott-asterisk-icon-32.png',
  '/assets/lightweight-charts-5.2.0.min.js',
  '/chart-surface/analysis-packets-v2.js',
  '/data-model/home.html',
  '/data-model/app.html',
  '/chart-surface/index.html?ticker=NBIS&view=daily',
  '/chart-surface/index.html?ticker=NBIS&view=weekly',
  '/chart-surface/index.html?ticker=NBIS&view=gex',
  ...tickers.map((ticker) => `/chart-surface/index.html?ticker=${ticker}&view=daily`)
];
const failures = [];

for (const route of routes) {
  const url = `${base}${route}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      failures.push(`${response.status} ${route}`);
      continue;
    }
    const body = await response.text();
    if (!body.trim()) failures.push(`empty response ${route}`);
    if (route.includes('/chart-surface/index.html') && !body.includes('Stock analysis chart surface')) {
      failures.push(`chart shell marker missing ${route}`);
    }
    if (route === '/chart-surface/analysis-packets-v2.js' && !body.includes('window.PROTOTYPE_IRIS_V2')) {
      failures.push(`Iris packet asset marker missing ${route}`);
    }
    if (route === '/data-model/home.html') {
      if (!body.includes('partialChartTickers') || !body.includes('hasChartData')) {
        failures.push('home navigation fallback marker missing');
      }
      for (const ticker of ['2646', 'ACHR', 'AMKR', 'CSCO', 'LITE', 'MRVL', 'NOK', 'NVDA', 'ONDS', 'PLTR', 'SNDK', '2330']) {
        if (!body.includes(`'${ticker}'`)) failures.push(`home partial ticker fallback missing ${ticker}`);
      }
    }
    if (route === '/data-model/home.html' || route.includes('/chart-surface/index.html')) {
      if (!body.includes('AKfycbyNsvi0AFuZYFVnqxWajYeBLgzGuHOqHDAduZfaSMyfSzEWK2BsIaVBWEGxFrWKd9HGbQ')) failures.push(`read proxy marker missing ${route}`);
      if (body.includes('AKfycbwN2')) failures.push(`write-only ingest URL leaked into frontend ${route}`);
    }
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
  }
}

let proxySummary = null;
try {
  const separator = proxyBaseUrl.includes('?') ? '&' : '?';
  const proxyUrl = `${proxyBaseUrl}${separator}format=json&health=1&refresh=${Date.now()}`;
  const response = await fetch(proxyUrl, {
    headers: { 'User-Agent': 'elliott-stock-analysis-release-smoke/1.0' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    failures.push(`proxy ${response.status}`);
  } else {
    const payload = await response.json();
    if (payload.error || !Array.isArray(payload.coverage) || !Array.isArray(payload.analysisRuns)) {
      failures.push('proxy response is missing Coverage or AnalysisRuns');
    } else {
      const gexRows = Array.isArray(payload.tables?.GEXSnapshots) ? payload.tables.GEXSnapshots.length : 0;
      proxySummary = {
        contractVersion: payload.contractVersion || 'unknown',
        generatedAt: payload.generatedAt || null,
        coverage: payload.coverage.length,
        analysisRuns: payload.analysisRuns.length,
        gexRows
      };
    }
  }
} catch (error) {
  failures.push(`proxy: ${error.message}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', base, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', base, checkedRoutes: routes.length, tickers, proxy: proxySummary }, null, 2));
}
