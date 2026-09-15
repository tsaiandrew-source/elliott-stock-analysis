import { load } from '@tauri-apps/plugin-store';
import { openUrl } from '@tauri-apps/plugin-opener';

const STORE_FILE = 'elliott-plus-state.json';
const STORE_KEY = 'web-state-v1';
const SCHEMA_VERSION = 1;
const STORAGE_KEYS = ['stock-analysis-coverage-overrides'];
const ALLOWED_ROUTES = new Set([
  '/data-model/home.html',
  '/data-model/coverage.html',
  '/data-model/app.html',
  '/chart-surface/index.html'
]);

function currentRoute() {
  if (!ALLOWED_ROUTES.has(window.location.pathname)) return '/data-model/home.html';
  const url = new URL(window.location.href);
  url.searchParams.delete('verify');
  url.searchParams.delete('runtime');
  return `${url.pathname}${url.search}${url.hash}`;
}

function durableLocalStorage() {
  return Object.fromEntries(
    STORAGE_KEYS
      .map((key) => [key, localStorage.getItem(key)])
      .filter(([, value]) => typeof value === 'string')
  );
}

async function startPersistence() {
  const store = await load(STORE_FILE, { autoSave: 150 });
  let saving = null;

  const save = async ({ flush = false } = {}) => {
    if (saving) await saving;
    saving = store.set(STORE_KEY, {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      route: currentRoute(),
      localStorage: durableLocalStorage()
    });

    try {
      await saving;
      if (flush) await store.save();
    } finally {
      saving = null;
    }
  };

  window.__ELLIOTT_DESKTOP__ = Object.freeze({
    durable: true,
    persistNow: () => save({ flush: true })
  });

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;

    try {
      const url = new URL(anchor.href, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      event.preventDefault();
      void openUrl(url.href).catch((error) => {
        console.warn('Elliott+ could not open the external source.', error);
      });
    } catch (_) {
      // Leave malformed or relative links to the webview's normal behavior.
    }
  });

  window.addEventListener('pagehide', () => void save({ flush: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void save({ flush: true });
  });
  window.setInterval(() => void save(), 3000);
  await save();
}

startPersistence().catch((error) => {
  console.warn('Elliott+ desktop persistence is unavailable.', error);
});
