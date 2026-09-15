import { load } from '@tauri-apps/plugin-store';
import {
  createDigestSnapshot,
  createMarketSnapshot,
  selectFreshestSnapshot,
  snapshotFingerprint
} from './tauri-fresh-data-core.js';

const PUBLIC_ROOT = 'https://tsaiandrew-source.github.io/elliott-stock-analysis';
const STORE_FILE = 'elliott-plus-data.json';
const STORE_KEY = 'published-data-v1';
const REQUEST_TIMEOUT_MS = 12_000;
const REFRESH_INTERVAL_MS = 5 * 60_000;
const FOCUS_REFRESH_AGE_MS = 60_000;

let activeSnapshot = null;
let activeStore = null;
let refreshInFlight = null;
let lastRefreshAttempt = 0;
let activeSource = 'bundled';

function snapshotSource(cached, remote, selected) {
  if (!selected?.market && !selected?.digests) return 'bundled';
  const selectedFingerprint = snapshotFingerprint(selected);
  if (remote && selectedFingerprint === snapshotFingerprint(selectFreshestSnapshot(null, remote))) return 'published';
  if (cached && selectedFingerprint === snapshotFingerprint(selectFreshestSnapshot(null, cached))) return 'cache';
  return cached && remote ? 'hybrid' : (remote ? 'published' : 'cache');
}

async function fetchText(pathname, refreshToken) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const separator = pathname.includes('?') ? '&' : '?';
    const response = await fetch(`${PUBLIC_ROOT}/${pathname}${separator}desktop=${refreshToken}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}.`);
    return response.text();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchPublishedSnapshot() {
  const refreshToken = Date.now();
  const [contractResult, manifestResult, digestResult] = await Promise.allSettled([
    fetchText('chart-surface/data-contract.js', refreshToken),
    fetchText('chart-surface/partial-market-data/MANIFEST.json', refreshToken),
    fetchText('data-model/digests.json', refreshToken)
  ]);

  const snapshot = { schemaVersion: 1, fetchedAt: new Date().toISOString(), market: null, digests: null };
  if (contractResult.status === 'fulfilled' && manifestResult.status === 'fulfilled') {
    try {
      const manifest = JSON.parse(manifestResult.value);
      const payloadEntries = await Promise.all((manifest.tickerOrder || []).map(async (ticker) => [
        ticker,
        await fetchText(`chart-surface/partial-market-data/${encodeURIComponent(ticker)}.json`, refreshToken)
      ]));
      snapshot.market = await createMarketSnapshot({
        contractSource: contractResult.value,
        manifest,
        payloadSources: Object.fromEntries(payloadEntries)
      });
    } catch (error) {
      console.warn('Elliott+ rejected an incomplete published market-data snapshot.', error);
    }
  }

  if (digestResult.status === 'fulfilled') {
    try {
      snapshot.digests = createDigestSnapshot(JSON.parse(digestResult.value));
    } catch (error) {
      console.warn('Elliott+ rejected an invalid published digest snapshot.', error);
    }
  }

  if (!snapshot.market && !snapshot.digests) throw new Error('No published Elliott+ data passed validation.');
  return snapshot;
}

function applySnapshot(snapshot, source) {
  if (snapshot?.market?.contract) window.PROTOTYPE_DATA_CONTRACT = snapshot.market.contract;
  if (snapshot?.market?.datasets) window.__ELLIOTT_DESKTOP_MARKET_DATA__ = snapshot.market.datasets;
  if (snapshot?.digests?.dataset) window.ELLIOTT_CROSS_MARKET_DIGESTS = snapshot.digests.dataset;
  window.__ELLIOTT_DESKTOP_DATA_STATUS__ = Object.freeze({
    source,
    fetchedAt: snapshot?.fetchedAt || null,
    marketDataThrough: snapshot?.market?.dataThrough || null,
    digestGeneratedAt: snapshot?.digests?.generatedAt || null
  });
}

async function saveSnapshot(snapshot) {
  if (!activeStore || (!snapshot?.market && !snapshot?.digests)) return;
  await activeStore.set(STORE_KEY, snapshot);
  await activeStore.save();
}

async function initialLoad() {
  let cached = null;
  try {
    activeStore = await load(STORE_FILE, { autoSave: false });
    cached = await activeStore.get(STORE_KEY);
  } catch (error) {
    activeStore = null;
    console.warn('Elliott+ accepted-data cache is unavailable.', error);
  }
  let remote = null;
  lastRefreshAttempt = Date.now();
  try {
    remote = await fetchPublishedSnapshot();
  } catch (error) {
    console.warn('Elliott+ could not validate the current published data; using its last accepted snapshot.', error);
  }

  activeSnapshot = selectFreshestSnapshot(cached, remote);
  activeSource = snapshotSource(cached, remote, activeSnapshot);
  applySnapshot(activeSnapshot, activeSource);
  if (remote && snapshotFingerprint(activeSnapshot) !== snapshotFingerprint(cached)) await saveSnapshot(activeSnapshot);
  return window.__ELLIOTT_DESKTOP_DATA_STATUS__;
}

async function refresh({ reload = true } = {}) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    lastRefreshAttempt = Date.now();
    const remote = await fetchPublishedSnapshot();
    const next = selectFreshestSnapshot(activeSnapshot, remote);
    const changed = snapshotFingerprint(next) !== snapshotFingerprint(activeSnapshot);
    const nextSource = snapshotSource(activeSnapshot, remote, next);
    activeSnapshot = next;
    activeSource = nextSource;
    applySnapshot(activeSnapshot, activeSource);
    if (changed) {
      await saveSnapshot(activeSnapshot);
      if (reload) window.location.reload();
    }
    return { changed, status: window.__ELLIOTT_DESKTOP_DATA_STATUS__ };
  })().catch((error) => {
    console.warn('Elliott+ published-data refresh was unavailable.', error);
    return { changed: false, error };
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

window.__ELLIOTT_DESKTOP_APPLY_DATA__ = () => applySnapshot(activeSnapshot, activeSource);
window.__ELLIOTT_DESKTOP_DATA_READY__ = initialLoad().catch((error) => {
  console.warn('Elliott+ published-data startup failed; continuing with bundled data.', error);
  window.__ELLIOTT_DESKTOP_DATA_STATUS__ = Object.freeze({
    source: 'bundled',
    fetchedAt: null,
    marketDataThrough: null,
    digestGeneratedAt: null
  });
  return window.__ELLIOTT_DESKTOP_DATA_STATUS__;
});
window.__ELLIOTT_DESKTOP_REFRESH_DATA__ = () => refresh({ reload: true });
window.setInterval(() => void refresh({ reload: true }), REFRESH_INTERVAL_MS);
document.addEventListener('visibilitychange', () => {
  if (activeSnapshot && document.visibilityState === 'visible' && Date.now() - lastRefreshAttempt >= FOCUS_REFRESH_AGE_MS) {
    void refresh({ reload: true });
  }
});
