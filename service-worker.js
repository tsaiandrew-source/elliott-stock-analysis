const CACHE_VERSION = 'elliott-pwa-v23';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_ROOT = new URL('./', self.location);
const OFFLINE_URL = new URL('offline.html', APP_ROOT).href;
const DIGEST_FRESH_PATHS = new Set([
  new URL('data-model/digests.json', APP_ROOT).pathname,
  new URL('data-model/digest-data.js', APP_ROOT).pathname
]);
const LIVE_DATA_PATHS = new Set([
  ...DIGEST_FRESH_PATHS,
  new URL('chart-surface/analysis-packets-v2.js', APP_ROOT).pathname,
  new URL('chart-surface/analysis-live-fallback.js', APP_ROOT).pathname,
  new URL('chart-surface/analysis-details.js', APP_ROOT).pathname,
  new URL('chart-surface/benchmark-data.js', APP_ROOT).pathname,
  new URL('chart-surface/weekly-history.js', APP_ROOT).pathname,
  new URL('chart-surface/eod-digest-20260908.js', APP_ROOT).pathname
]);

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
  './data-model/app.html',
  './chart-surface/index.html',
  './chart-surface/data-contract.js',
  './chart-surface/analysis-localization.js',
  './chart-surface/analysis-geometry.js',
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

async function freshDigestResponse(request) {
  try {
    const response = await fetch(request, { cache:'no-store' });
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(cacheKey(request), response.clone());
    }
    return response;
  } catch (_) {
    return (await cachedResponse(request)) || Response.error();
  }
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
    if (LIVE_DATA_PATHS.has(url.pathname) || url.pathname.includes('/chart-surface/partial-market-data/')) {
      event.respondWith(freshDigestResponse(request));
      return;
    }
    event.respondWith(localAssetResponse(request));
    return;
  }
});
