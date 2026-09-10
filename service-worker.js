const CACHE_VERSION = 'elliott-pwa-v14';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_ROOT = new URL('./', self.location);
const OFFLINE_URL = new URL('offline.html', APP_ROOT).href;

const CORE_ASSETS = [
  './offline.html',
  './index.html',
  './manifest.webmanifest',
  './assets/elliott-asterisk-icon-32.png',
  './assets/elliott-asterisk-icon-192.png',
  './assets/elliott-asterisk-icon-512.png',
  './assets/elliott-asterisk-maskable-512.png',
  './assets/elliott-asterisk-apple-touch-icon.png',
  './assets/lightweight-charts-5.2.0.min.js',
  './pwa-register.js',
  './coverage-order.js',
  './shared-menu.js',
  './data-model/home.html',
  './data-model/coverage.html',
  './data-model/digest-model.js',
  './data-model/digest-data.js',
  './data-model/app.html',
  './chart-surface/index.html',
  './chart-surface/data-contract.js',
  './chart-surface/analysis-localization.js',
  './chart-surface/analysis-geometry.js',
  './chart-surface/analysis-packets-v2.js',
  './chart-surface/analysis-details.js',
  './chart-surface/benchmark-data.js',
  './chart-surface/weekly-history.js',
  './chart-surface/eod-digest-20260908.js',
  './chart-surface/partial-market-data/2330.json',
  './chart-surface/partial-market-data/2646.json',
  './chart-surface/partial-market-data/ACHR.json',
  './chart-surface/partial-market-data/AMKR.json',
  './chart-surface/partial-market-data/AVGO.json',
  './chart-surface/partial-market-data/CSCO.json',
  './chart-surface/partial-market-data/IREN.json',
  './chart-surface/partial-market-data/LITE.json',
  './chart-surface/partial-market-data/MRVL.json',
  './chart-surface/partial-market-data/NBIS.json',
  './chart-surface/partial-market-data/NOK.json',
  './chart-surface/partial-market-data/NVDA.json',
  './chart-surface/partial-market-data/ONDS.json',
  './chart-surface/partial-market-data/PLTR.json',
  './chart-surface/partial-market-data/SNDK.json'
].map((path) => new URL(path, APP_ROOT).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('elliott-pwa-') && ![CORE_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const cacheKey = (request) => {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url, { method: 'GET' });
};
const cachedResponse = (request) => caches.match(cacheKey(request));

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(cacheKey(request), response.clone());
    }
    return response;
  } catch (_) {
    return (await cachedResponse(request)) || (await caches.match(OFFLINE_URL));
  }
}

async function localAssetResponse(request) {
  const cached = await cachedResponse(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(cacheKey(request), response.clone());
    }
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.origin === APP_ROOT.origin && url.pathname.startsWith(APP_ROOT.pathname)) {
    event.respondWith(localAssetResponse(request));
    return;
  }
});
