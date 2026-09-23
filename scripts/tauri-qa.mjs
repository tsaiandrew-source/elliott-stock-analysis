import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distRoot = path.join(projectRoot, 'dist-tauri');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(relativePath, root = projectRoot) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function collect(relativePath = '') {
  const absolute = path.join(distRoot, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await collect(child));
    else files.push(child);
  }
  return files;
}

const config = JSON.parse(await text('src-tauri/tauri.conf.json'));
const packageJson = JSON.parse(await text('package.json'));
const files = await collect();
const csp = config.app?.security?.csp || '';
const connectSrc = csp.split(';').find((directive) => directive.trim().startsWith('connect-src')) || '';

assert(config.build?.frontendDist === '../dist-tauri', 'Tauri must embed the staged web directory.');
assert(config.identifier === 'com.tsaiandrew.elliottplus', 'Desktop bundle identifier changed unexpectedly.');
assert(config.app?.windows?.[0]?.visible === true, 'The main window must be visible on first launch.');
assert(typeof csp === 'string' && csp.includes("object-src 'none'"), 'Desktop content security policy is missing.');
assert(connectSrc.includes("'self'"), 'Desktop connect-src must allow staged same-origin JSON data.');
assert(connectSrc.includes('https://tsaiandrew-source.github.io'), 'Desktop connect-src must allow the canonical published-data origin.');
assert(packageJson.scripts?.['desktop:build'] === 'tauri build', 'Desktop build command is missing.');
assert(files.includes('index.html'), 'Desktop entry page is missing.');
assert(files.includes('desktop/tauri-entry.js'), 'Desktop restore bridge is missing.');
assert(files.includes('desktop/tauri-persistence.js'), 'Desktop persistence bridge is missing.');
assert(files.includes('desktop/tauri-fresh-data.js'), 'Desktop published-data bridge is missing.');
assert(files.includes('data-model/digests.json'), 'Digest data was not staged.');
assert(files.includes('chart-surface/index.html'), 'Chart surface was not staged.');
assert(files.includes('shared-menu.css') && files.includes('shared-menu.js'), 'Shared navigation assets were not staged.');
assert(files.includes('shared-topbar.css') && files.includes('shared-topbar.js'), 'Shared top bar assets were not staged.');
assert(!files.some((file) => file.includes('node_modules') || file.includes('src-tauri') || file.includes('.git')), 'Build output contains development files.');

for (const page of ['data-model/home.html', 'data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html', 'offline.html']) {
  const html = await text(page, distRoot);
  assert(html.includes('tauri-persistence.js'), `${page} is missing native persistence.`);
  assert(!html.includes('pwa-register-v27.js'), `${page} still registers the PWA service worker in Tauri.`);
}

for (const page of ['data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html']) {
  const html = await text(page, distRoot);
  assert(html.includes('shared-menu.css') && html.includes('shared-menu.js') && html.includes('<elliott-shared-menu'), `${page} is missing shared navigation.`);
  assert(html.includes('tauri-fresh-data.js'), `${page} is missing the published-data bridge.`);
  assert(html.includes('__ELLIOTT_DESKTOP_DATA_READY__'), `${page} does not wait for validated published data.`);
  assert(html.includes('__ELLIOTT_DESKTOP_APPLY_DATA__'), `${page} does not reapply accepted data after bundled scripts load.`);
}

const digestHome = await text('data-model/home.html', distRoot);
assert(digestHome.includes('shared-topbar.css') && digestHome.includes('shared-topbar.js') && digestHome.includes('<elliott-topbar'), 'data-model/home.html is missing the shared top bar.');
assert(digestHome.includes('tauri-fresh-data.js'), 'data-model/home.html is missing the published-data bridge.');
assert(digestHome.includes('__ELLIOTT_DESKTOP_DATA_READY__'), 'data-model/home.html does not wait for validated published data.');
assert(digestHome.includes('__ELLIOTT_DESKTOP_APPLY_DATA__'), 'data-model/home.html does not reapply accepted data after bundled scripts load.');

const marketDataFiles = files.filter((file) => /^chart-surface\/partial-market-data\/(?!MANIFEST\.json$)[^/]+\.json$/.test(file));
assert(marketDataFiles.length >= 15, 'Desktop staging omitted one or more tracked market-data payloads.');
for (const file of marketDataFiles) {
  const payload = JSON.parse(await text(file, distRoot));
  const lastBar = Array.isArray(payload.bars) ? payload.bars.at(-1) : null;
  assert(lastBar, `${file} has no OHLCV bars.`);
  assert(String(lastBar.date || '').slice(0, 10) === String(payload.dataThrough || '').slice(0, 10), `${file} declares dataThrough after its last bar.`);
}

const entry = await text('index.html', distRoot);
assert(entry.includes('tauri-entry.js'), 'Desktop entry does not restore state before navigation.');
assert((await stat(path.join(distRoot, 'desktop/tauri-entry.js'))).size > 1000, 'Desktop restore bridge is unexpectedly small.');
const freshDataBridge = await text('desktop/tauri-fresh-data.js', distRoot);
assert(freshDataBridge.includes('tsaiandrew-source.github.io/elliott-stock-analysis'), 'Desktop bridge does not use the canonical published-data origin.');
assert(freshDataBridge.includes('partial-market-data/MANIFEST.json'), 'Desktop bridge does not validate the market-data manifest.');
assert(freshDataBridge.includes('elliott-plus-data.json'), 'Desktop bridge does not keep an offline accepted-data cache.');

console.log(`Tauri desktop QA passed (${files.length} embedded files).`);
