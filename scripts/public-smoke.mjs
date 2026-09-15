import { loadCoverageRoster } from './coverage-roster.mjs';
import { createHash } from 'node:crypto';

const base = (process.env.PUBLIC_BASE_URL || 'https://tsaiandrew-source.github.io/elliott-stock-analysis').replace(/\/$/, '');
const proxyBaseUrl = process.env.PUBLIC_PROXY_URL || 'https://script.google.com/macros/s/AKfycbyfPXGRSZvSa8NOp6OguWNYgWEB1wHcr42E6e_uvleNb-ckI_Rei23PEWigi2Wx3CzQRg/exec';
const expectedDigestId = process.env.EXPECTED_DIGEST_ID || '';
const expectedDataContractSha256 = process.env.EXPECTED_DATA_CONTRACT_SHA256 || '';
const expectedMarketManifestSha256 = process.env.EXPECTED_MARKET_MANIFEST_SHA256 || '';
const skipProxy = process.env.PUBLIC_SMOKE_SKIP_PROXY === '1';
const tickers = (await loadCoverageRoster()).order;
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
  ...(expectedDataContractSha256 ? [`/chart-surface/data-contract.js?expected=${expectedDataContractSha256.slice(0, 12)}&refresh=${Date.now()}`] : []),
  `/chart-surface/partial-market-data/MANIFEST.json?refresh=${Date.now()}`,
  '/data-model/home.html',
  ...(expectedDigestId ? [`/data-model/digest-data.js?expected=${encodeURIComponent(expectedDigestId)}&refresh=${Date.now()}`] : []),
  '/data-model/home.html?view=weekly',
  '/data-model/coverage.html',
  '/data-model/app.html',
  '/chart-surface/index.html?ticker=NBIS&view=daily',
  '/chart-surface/index.html?ticker=NBIS&view=weekly',
  '/chart-surface/index.html?ticker=NBIS&view=gex',
  ...tickers.map((ticker) => `/chart-surface/index.html?ticker=${ticker}&view=daily`)
];
const failures = [];
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url, { attempts = 2, timeoutMs = 20_000, headers = {}, retryStatuses = [] } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      const retryableStatus = response.status >= 500 || retryStatuses.includes(response.status);
      if (response.ok || attempt === attempts || !retryableStatus) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await sleep(5_000 * attempt);
  }
  throw lastError || new Error('request failed');
}

for (const route of routes) {
  const url = `${base}${route}`;
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      failures.push(`${response.status} ${route}`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const body = bytes.toString('utf8');
    if (route.startsWith('/chart-surface/data-contract.js') && expectedDataContractSha256) {
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== expectedDataContractSha256) failures.push(`published data contract hash mismatch: expected ${expectedDataContractSha256.slice(0, 12)} got ${actualHash.slice(0, 12)}`);
    }
    if (route.startsWith('/chart-surface/partial-market-data/MANIFEST.json') && expectedMarketManifestSha256) {
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== expectedMarketManifestSha256) failures.push(`published market manifest hash mismatch: expected ${expectedMarketManifestSha256.slice(0, 12)} got ${actualHash.slice(0, 12)}`);
    }
    if (!body.trim()) failures.push(`empty response ${route}`);
    if (route.includes('/chart-surface/index.html') && !body.includes('Stock analysis chart surface')) {
      failures.push(`chart shell marker missing ${route}`);
    }
    if (route === '/chart-surface/analysis-packets-v2.js' && !body.includes('window.PROTOTYPE_IRIS_V2')) {
      failures.push(`Iris packet asset marker missing ${route}`);
    }
    if (expectedDigestId && route.startsWith('/data-model/digest-data.js') && !body.includes(expectedDigestId)) {
      failures.push(`expected digest missing from public bundle: ${expectedDigestId}`);
    }
    if (route === '/data-model/coverage.html') {
      if (!body.includes('partialChartTickers') || !body.includes('hasChartData')) {
        failures.push('coverage navigation fallback marker missing');
      }
      if (!body.includes('Object.fromEntries((activeContract.coverage || [])')) failures.push('coverage partial ticker sources are not derived from the canonical roster');
    }
    if (route === '/data-model/coverage.html' || route.includes('/chart-surface/index.html')) {
      if (!skipProxy && !body.includes('AKfycbyfPXGRSZvSa8NOp6OguWNYgWEB1wHcr42E6e_uvleNb-ckI_Rei23PEWigi2Wx3CzQRg')) failures.push(`read proxy marker missing ${route}`);
      if (body.includes('AKfycbwN2')) failures.push(`write-only ingest URL leaked into frontend ${route}`);
    }
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
  }
}

try {
  const manifestUrl = `${base}/chart-surface/partial-market-data/MANIFEST.json?verify=${Date.now()}`;
  const manifestResponse = await fetchWithRetry(manifestUrl, { attempts: 3 });
  const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schemaVersion !== 'elliott-completed-session-market-data-v1') failures.push('market manifest schema is invalid');
  const manifestTickers = Object.keys(manifest.tickers || {});
  if ((manifest.tickerOrder || []).join(',') !== tickers.join(',') || manifestTickers.length !== tickers.length || tickers.some((ticker) => !manifest.tickers?.[ticker])) failures.push(`market manifest roster mismatch: ${manifestTickers.join(',')}`);
  for (const ticker of tickers) {
    const expected = manifest.tickers?.[ticker];
    if (!expected) continue;
    const response = await fetchWithRetry(`${base}/chart-surface/partial-market-data/${encodeURIComponent(ticker)}.json?verify=${Date.now()}`, { attempts: 3 });
    if (!response.ok) {
      failures.push(`${ticker}: market data HTTP ${response.status}`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expected.sha256) failures.push(`${ticker}: published market data hash mismatch`);
    const dataset = JSON.parse(bytes.toString('utf8'));
    const last = Array.isArray(dataset.bars) ? dataset.bars.at(-1) : null;
    if (!last || dataset.dataThrough !== last.date || dataset.dataThrough !== expected.dataThrough) failures.push(`${ticker}: published final OHLCV date mismatch`);
    if (!last || Math.abs(Number(last.close) - Number(expected.close)) > Math.max(0.011, Math.abs(Number(expected.close)) * 0.000001)) failures.push(`${ticker}: published closing price mismatch`);
  }
} catch (error) {
  failures.push(`market data verification: ${error.message}`);
}

let proxySummary = skipProxy ? { skipped:true } : null;
try {
  if (skipProxy) throw Object.assign(new Error('proxy check skipped'), { skipProxy:true });
  const separator = proxyBaseUrl.includes('?') ? '&' : '?';
  const proxyUrl = `${proxyBaseUrl}${separator}format=json&health=1&refresh=${Date.now()}`;
  const response = await fetchWithRetry(proxyUrl, {
    attempts: 3,
    timeoutMs: 120_000,
    headers: { 'User-Agent': 'elliott-stock-analysis-release-smoke/1.0' },
    // Apps Script deployments can briefly answer 404 while their redirect
    // target is warming or being replaced. Retry only the transient statuses;
    // the final response still fails the release gate if it is not healthy.
    retryStatuses: [404, 408, 425, 429]
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
  if (!error.skipProxy) failures.push(`proxy: ${error.message}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', base, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', base, checkedRoutes: routes.length, tickers, proxy: proxySummary }, null, 2));
}
