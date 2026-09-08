const base = (process.env.PUBLIC_BASE_URL || 'https://tsaiandrew-source.github.io/elliott-stock-analysis').replace(/\/$/, '');
const tickers = ['2646', 'LITE', 'NBIS', 'PLTR', 'IREN', 'NOK', 'ACHR', 'CSCO', 'AMKR', 'ONDS', 'NVDA', 'MRVL', 'SNDK', '2330', 'AVGO'];
const routes = [
  '/',
  '/manifest.webmanifest',
  '/assets/elliott-plus-icon.svg',
  '/data-model/home.html',
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
    if (route.includes('/chart-surface/') && !body.includes('Stock analysis chart surface')) {
      failures.push(`chart shell marker missing ${route}`);
    }
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', base, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', base, checkedRoutes: routes.length, tickers }, null, 2));
}
