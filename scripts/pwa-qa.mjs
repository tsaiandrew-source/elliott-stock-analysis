import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const exists = async (relative) => {
  try { await fs.access(path.join(root, relative)); return true; } catch (_) { return false; }
};

const expectedIcons = [
  ['assets/elliott-asterisk-icon-32.png', 32],
  ['assets/elliott-asterisk-icon-192.png', 192],
  ['assets/elliott-asterisk-icon-512.png', 512],
  ['assets/elliott-asterisk-maskable-512.png', 512],
  ['assets/elliott-asterisk-apple-touch-icon.png', 180]
];

const OFFICIAL_PLUS_SHA256 = '7d71b53bf0e369a768878752cc7e8f710712218da2dc02b6ee2f8f96373f3346';
const OFFICIAL_ASTERISK_SHA256 = '0526b1ae56458c7312802a0bc6c2236a402556361be70497192ee27dd47a4dfe';

const pngSize = async (relative) => {
  const bytes = await fs.readFile(path.join(root, relative));
  if (bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};
const sha256 = async (relative) => createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');

if (await sha256('assets/elliott-plus-icon-locked.png') !== OFFICIAL_PLUS_SHA256) failures.push('official + icon no longer matches its locked checksum');
if (await sha256('assets/elliott-asterisk-icon-locked.png') !== OFFICIAL_ASTERISK_SHA256) failures.push('official * icon no longer matches its locked checksum');

for (const [file, size] of expectedIcons) {
  if (!(await exists(file))) {
    failures.push(`missing PWA icon: ${file}`);
    continue;
  }
  const dimensions = await pngSize(file);
  if (!dimensions || dimensions[0] !== size || dimensions[1] !== size) {
    failures.push(`${file}: expected ${size}x${size} PNG`);
  }
}

const manifest = JSON.parse(await read('manifest.webmanifest'));
for (const field of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
  if (!manifest[field]) failures.push(`manifest missing ${field}`);
}
if (manifest.display !== 'standalone') failures.push('manifest display must be standalone');
if (manifest.short_name !== 'E+') failures.push('manifest short_name must be E+');
if (!manifest.icons?.some((icon) => icon.src.includes('elliott-asterisk-icon-192.png') && icon.sizes === '192x192' && icon.purpose === 'any')) failures.push('manifest missing official * 192x192 any icon');
if (!manifest.icons?.some((icon) => icon.src.includes('elliott-asterisk-icon-512.png') && icon.sizes === '512x512' && icon.purpose === 'any')) failures.push('manifest missing official * 512x512 any icon');
if (!manifest.icons?.some((icon) => icon.src.includes('elliott-asterisk-maskable-512.png') && icon.sizes === '512x512' && icon.purpose === 'maskable')) failures.push('manifest missing official * 512x512 maskable icon');

const htmlFiles = ['index.html', 'data-model/home.html', 'data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html'];
for (const file of htmlFiles) {
  const html = await read(file);
  for (const marker of ['viewport-fit=cover', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-touch-icon', 'manifest.webmanifest', 'pwa-register.js']) {
    if (!html.includes(marker)) failures.push(`${file}: missing ${marker}`);
  }
  if (!html.includes('apple-mobile-web-app-title" content="E+"')) failures.push(`${file}: installed iOS title must be E+`);
  if (!html.includes('elliott-asterisk-icon-32.png')) failures.push(`${file}: official * favicon is missing`);
  if (/elliott-plus-(?:icon|apple-touch|maskable)/.test(html)) failures.push(`${file}: inactive + delivery icon is still referenced`);
  if (html.includes('elliott-plus-icon.svg')) failures.push(`${file}: legacy E-shaped icon is still referenced`);
}

if (!(await read('data-model/home.html')).includes('<title>股市分析</title>')) failures.push('home document title must be 股市分析');

for (const file of ['data-model/home.html', 'data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html', 'offline.html']) {
  const html = await read(file);
  for (const inset of ['safe-area-inset-top', 'safe-area-inset-right', 'safe-area-inset-left']) {
    if (!html.includes(inset)) failures.push(`${file}: missing ${inset}`);
  }
  if (!html.includes('100dvh')) failures.push(`${file}: missing dynamic viewport height`);
}

const worker = await read('service-worker.js');
for (const marker of ['self.addEventListener(\'install\'', 'self.addEventListener(\'activate\'', 'self.addEventListener(\'fetch\'', 'offline.html', "url.search = ''"]) {
  if (!worker.includes(marker)) failures.push(`service-worker.js: missing ${marker}`);
}
if (/script\.google\.com|AKfy/i.test(worker)) failures.push('service-worker.js: must not cache or rewrite the live analysis proxy');
if (/request\.method\s*!==\s*['"]GET['"]/.test(worker) === false) failures.push('service-worker.js: non-GET bypass is missing');
if (!(await read('chart-surface/index.html')).includes('../assets/lightweight-charts-5.2.0.min.js')) failures.push('chart surface must use the offline-capable local chart library');

const viewportMatrix = [
  ['iPhone portrait', 390, 844],
  ['iPhone landscape', 844, 390],
  ['iPad portrait', 820, 1180],
  ['iPad landscape', 1180, 820],
  ['iPad split view', 507, 1024]
];

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures, viewportMatrix }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', installability: true, offlineShell: true, viewportMatrix }, null, 2));
}
