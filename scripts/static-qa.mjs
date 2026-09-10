import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'pwa-register.js',
  'shared-menu.js',
  'offline.html',
  'assets/elliott-asterisk-icon-192.png',
  'assets/elliott-asterisk-icon-512.png',
  'assets/elliott-asterisk-maskable-512.png',
  'assets/elliott-asterisk-apple-touch-icon.png',
  'assets/elliott-asterisk-icon-32.png',
  'assets/elliott-plus-icon-locked.png',
  'assets/elliott-asterisk-icon-locked.png',
  'assets/lightweight-charts-5.2.0.min.js',
  'ELLIOTT-ICON-LOCK.md',
  'chart-surface/index.html',
  'chart-surface/data-contract.js',
  'chart-surface/analysis-localization.js',
  'chart-surface/analysis-geometry.js',
  'data-model/home.html',
  'data-model/coverage.html',
  'data-model/digest-model.js',
  'data-model/digest-data.js'
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

const htmlFiles = ['index.html', 'chart-surface/index.html', 'data-model/home.html', 'data-model/coverage.html', 'data-model/app.html'];
for (const file of htmlFiles) {
  if (!(await exists(file))) continue;
  const html = await read(file);
  if (/file:\/\//i.test(html)) failures.push(`${file}: contains file:// reference`);
  if (/\/Users\/|[A-Z]:\\\\|P F Social|shared_research/i.test(html)) failures.push(`${file}: contains a local workspace path`);
  if (/BEGIN PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|INGEST_TOKEN\s*[:=]/i.test(html)) failures.push(`${file}: possible secret material`);
  if (/AKfycbwN2/i.test(html)) failures.push(`${file}: write-only ingest bridge must not be used by the browser`);
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    if (!reference || /^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    if (reference.includes('${') || reference.includes('<') || reference.includes('>')) continue;
    const clean = reference.split('#')[0].split('?')[0];
    if (!clean || clean.endsWith('/')) continue;
    const resolved = path.normalize(path.join(path.dirname(file), clean));
    if (!(await exists(resolved))) failures.push(`${file}: referenced file not found: ${reference}`);
  }
  if (file === 'chart-surface/index.html') {
    if (!html.includes('const compactReaderText')) failures.push(`${file}: compact reader text filter is missing`);
    if (!html.includes('const publicEvidenceLabel')) failures.push(`${file}: public source-label filter is missing`);
    if (/shape:\s*'arrowUp'\s*,\s*text:\s*'watch'/i.test(html)) failures.push(`${file}: generic watch arrow marker must not be rendered on candle charts`);
    if (!html.includes("technicalEvidence?.patterns?.[state.view === 'weekly' ? 'weeklyPrimary' : 'dailyPrimary']")) failures.push(`${file}: selected daily/weekly pattern coordinates are not wired to the chart`);
    if (/if \(state\.view === 'weekly' \|\| !bars\.length \|\| !pattern\) return \[\]/.test(html)) failures.push(`${file}: weekly pattern geometry is still disabled`);
    if (!html.includes("state.view === 'weekly' ? null")) failures.push(`${file}: weekly charts can still fall back to daily geometry sidecars`);
  }
  if (file === 'data-model/coverage.html') {
    if (/coverage-manage-tab|coverage-form|new-ticker|data-toggle-ticker|data-remove-ticker/i.test(html)) failures.push(`${file}: hidden coverage-management controls leaked into the public home page`);
  }
  if (file === 'data-model/app.html' && /data-view="coverage"/i.test(html)) {
    failures.push(`${file}: hidden coverage-management view is still exposed in the app navigation`);
  }
}

if (await exists('data-model/coverage.html')) {
  const home = await read('data-model/coverage.html');
  const requiredPartialTickers = ['2330', '2646', 'ACHR', 'AMKR', 'CSCO', 'LITE', 'MRVL', 'NOK', 'NVDA', 'ONDS', 'PLTR', 'SNDK'];
  if (!home.includes('partialChartTickers') || !home.includes('hasChartData')) failures.push('data-model/coverage.html: partial-safe chart navigation gate is missing');
  for (const ticker of requiredPartialTickers) {
    if (!home.includes(`'${ticker}'`)) failures.push(`data-model/coverage.html: partial chart ticker missing from navigation fallback: ${ticker}`);
  }
}

if (await exists('data-model/home.html')) {
  const home = await read('data-model/home.html');
  const sharedMenu = await read('shared-menu.js');
  const homeIndex = sharedMenu.indexOf("link('dock-home'");
  const coverageIndex = sharedMenu.indexOf("link('dock-coverage'");
  if (!home.includes('window.ELLIOTT_CROSS_MARKET_DIGESTS') && !home.includes('digest-data.js')) failures.push('data-model/home.html: digest dataset is not wired');
  if (!home.includes('Daily · 每日') || !home.includes('Weekly · 每週')) failures.push('data-model/home.html: Daily/Weekly navigation is missing');
  if (homeIndex < 0 || coverageIndex < 0 || homeIndex > coverageIndex) failures.push('data-model/home.html: Home must precede Coverage in primary navigation');
  if (!home.includes('<elliott-shared-menu') || !home.includes('data-current="home"')) failures.push('data-model/home.html: active shared Home navigation is missing');
}

if (await exists('shared-menu.js')) {
  const sharedMenu = await read('shared-menu.js');
  for (const marker of ['dock-home', 'dock-coverage', 'ticker-menu-toggle', 'aria-current', 'safe-area-inset-bottom']) {
    if (!sharedMenu.includes(marker)) failures.push(`shared-menu.js: missing ${marker}`);
  }
  for (const file of ['data-model/home.html', 'data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html']) {
    const html = await read(file);
    if (!html.includes('shared-menu.js') || !html.includes('<elliott-shared-menu')) failures.push(`${file}: shared menu component is not mounted`);
  }
}

if (await exists('data-model/digest-model.js')) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(await read('data-model/digest-model.js'), context);
  const digestModel = context.ELLIOTT_DIGEST_MODEL;
  const fixture = digestModel.normalizeDataset({
    schemaVersion: 'elliott-cross-market-digest-v1',
    records: [
      { id:'d-close', cadence:'daily', edition:'close', marketDate:'2026-09-09' },
      { id:'d-morning', cadence:'daily', edition:'morning', marketDate:'2026-09-09' },
      { id:'d-midday', cadence:'daily', edition:'midday', marketDate:'2026-09-09' },
      { id:'d-new', cadence:'daily', edition:'morning', marketDate:'2026-09-10' },
      { id:'w-1', cadence:'weekly', edition:'weekly', weekStart:'2026-09-07' },
      { id:'invalid', cadence:'weekly', edition:'morning', weekStart:'2026-09-07' },
      { id:'d-new', cadence:'daily', edition:'morning', marketDate:'2026-09-10' }
    ]
  });
  const dailyGroups = digestModel.groupRecords(fixture.records, 'daily');
  const weeklyGroups = digestModel.groupRecords(fixture.records, 'weekly');
  if (dailyGroups.map((group) => group.key).join(',') !== '2026-09-10,2026-09-09') failures.push('digest model: daily groups are not newest-first');
  if (dailyGroups[1]?.items.map((item) => item.edition).join(',') !== 'morning,midday,close') failures.push('digest model: daily editions are not chronological');
  if (weeklyGroups.length !== 1 || weeklyGroups[0]?.items[0]?.id !== 'w-1') failures.push('digest model: weekly grouping failed');
  if (fixture.records.length !== 5) failures.push('digest model: invalid or duplicate records were not filtered');
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
