import { load } from '@tauri-apps/plugin-store';

const STORE_FILE = 'elliott-plus-state.json';
const STORE_KEY = 'web-state-v1';
const DEFAULT_ROUTE = './data-model/home.html?runtime=tauri';
const ALLOWED_ROUTES = new Set([
  '/data-model/home.html',
  '/data-model/coverage.html',
  '/data-model/app.html',
  '/chart-surface/index.html'
]);

function safeRoute(value) {
  if (typeof value !== 'string' || !value) return DEFAULT_ROUTE;

  try {
    const url = new URL(value, window.location.href);
    if (!ALLOWED_ROUTES.has(url.pathname)) return DEFAULT_ROUTE;
    url.searchParams.delete('verify');
    url.searchParams.set('runtime', 'tauri');
    return `.${url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    return DEFAULT_ROUTE;
  }
}

async function restore() {
  try {
    const store = await load(STORE_FILE, { autoSave: 150 });
    const snapshot = await store.get(STORE_KEY);
    const savedStorage = snapshot && typeof snapshot === 'object' ? snapshot.localStorage : null;

    if (savedStorage && typeof savedStorage === 'object') {
      Object.entries(savedStorage).forEach(([key, value]) => {
        if (typeof value === 'string') localStorage.setItem(key, value);
      });
    }

    window.location.replace(safeRoute(snapshot?.route));
  } catch (error) {
    console.warn('Elliott+ could not restore desktop state.', error);
    window.location.replace(DEFAULT_ROUTE);
  }
}

restore();
