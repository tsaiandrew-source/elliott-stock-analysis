import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const exists = async (relative) => {
  try { await fs.access(path.join(root, relative)); return true; } catch (_) { return false; }
};

const expectedIcons = [
  ['assets/elliott-plus-icon-192.png', 192],
  ['assets/elliott-plus-icon-512.png', 512],
  ['assets/elliott-plus-maskable-512.png', 512],
  ['assets/elliott-plus-apple-touch-icon.png', 180]
];

const pngSize = async (relative) => {
  const bytes = await fs.readFile(path.join(root, relative));
  if (bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

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
if (!manifest.icons?.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')) failures.push('manifest missing 192x192 any icon');
if (!manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')) failures.push('manifest missing 512x512 any icon');
if (!manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')) failures.push('manifest missing 512x512 maskable icon');

const htmlFiles = ['index.html', 'data-model/home.html', 'data-model/app.html', 'chart-surface/index.html'];
for (const file of htmlFiles) {
  const html = await read(file);
  for (const marker of ['viewport-fit=cover', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-touch-icon', 'manifest.webmanifest', 'pwa-register.js']) {
    if (!html.includes(marker)) failures.push(`${file}: missing ${marker}`);
  }
}

for (const file of ['data-model/home.html', 'data-model/app.html', 'chart-surface/index.html', 'offline.html']) {
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
