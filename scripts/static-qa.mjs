import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'assets/elliott-plus-icon.svg',
  'chart-surface/index.html',
  'chart-surface/data-contract.js',
  'chart-surface/analysis-localization.js',
  'chart-surface/analysis-geometry.js',
  'data-model/home.html'
];

const exists = async (relative) => {
  try { await fs.access(path.join(root, relative)); return true; } catch (_) { return false; }
};
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');

for (const file of requiredFiles) {
  if (!(await exists(file))) failures.push(`missing required file: ${file}`);
}

for (const file of ['manifest.webmanifest', 'chart-surface/data-contract.js']) {
  if (!(await exists(file))) continue;
  try { JSON.parse(await read(file)); } catch (error) {
    if (file.endsWith('.json')) failures.push(`invalid JSON: ${file}: ${error.message}`);
  }
}

if (await exists('manifest.webmanifest')) {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  for (const icon of manifest.icons || []) {
    if (icon.src && !(await exists(icon.src))) failures.push(`manifest icon not found: ${icon.src}`);
  }
}

const htmlFiles = ['index.html', 'chart-surface/index.html', 'data-model/home.html', 'data-model/app.html'];
for (const file of htmlFiles) {
  if (!(await exists(file))) continue;
  const html = await read(file);
  if (/file:\/\//i.test(html)) failures.push(`${file}: contains file:// reference`);
  if (/\/Users\/|[A-Z]:\\\\|P F Social|shared_research/i.test(html)) failures.push(`${file}: contains a local workspace path`);
  if (/BEGIN PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|INGEST_TOKEN\s*[:=]/i.test(html)) failures.push(`${file}: possible secret material`);
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    if (!reference || /^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    if (reference.includes('${') || reference.includes('<') || reference.includes('>')) continue;
    const clean = reference.split('#')[0].split('?')[0];
    if (!clean || clean.endsWith('/')) continue;
    const resolved = path.normalize(path.join(path.dirname(file), clean));
    if (!(await exists(resolved))) failures.push(`${file}: referenced file not found: ${reference}`);
  }
}

if (await exists('data-model/home.html')) {
  const home = await read('data-model/home.html');
  const requiredPartialTickers = ['2330', '2646', 'ACHR', 'AMKR', 'CSCO', 'LITE', 'MRVL', 'NOK', 'NVDA', 'ONDS', 'PLTR', 'SNDK'];
  if (!home.includes('partialChartTickers') || !home.includes('hasChartData')) failures.push('data-model/home.html: partial-safe chart navigation gate is missing');
  for (const ticker of requiredPartialTickers) {
    if (!home.includes(`'${ticker}'`)) failures.push(`data-model/home.html: partial chart ticker missing from navigation fallback: ${ticker}`);
  }
}

for (const file of ['chart-surface/data-contract.js', 'chart-surface/benchmark-data.js', 'chart-surface/analysis-details.js', 'chart-surface/analysis-localization.js', 'chart-surface/analysis-geometry.js']) {
  if (!(await exists(file))) continue;
  const source = await read(file);
  if (/\/Users\/|[A-Z]:\\\\|P F Social|shared_research/i.test(source)) failures.push(`${file}: contains a local workspace path`);
}

const partialDir = path.join(root, 'chart-surface/partial-market-data');
if (await exists('chart-surface/partial-market-data')) {
  const files = (await fs.readdir(partialDir)).filter((file) => file.endsWith('.json'));
  if (!files.length) failures.push('partial-market-data: no JSON datasets found');
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(partialDir, file), 'utf8'));
      if (!data || typeof data !== 'object') failures.push(`partial dataset is not an object: ${file}`);
    } catch (error) {
      failures.push(`invalid partial dataset ${file}: ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', checkedFiles: requiredFiles.length, partialDatasets: (await fs.readdir(partialDir)).filter((file) => file.endsWith('.json')).length }, null, 2));
}
