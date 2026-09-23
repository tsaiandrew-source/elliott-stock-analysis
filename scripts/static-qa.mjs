import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { UNIVERSE, validatePacket } from './validate-universal-refresh-gex.mjs';
import { buildReleaseReceipt, parsePorcelainPaths, pruneToCoverage } from './sync-universal-refresh.mjs';
import { loadCoverageRoster } from './coverage-roster.mjs';
import { readCoverageRegistry, renderCoverageOrderBrowser } from './coverage-registry.mjs';
import { verifyMarketDataset } from './sync-market-data.mjs';

const root = process.cwd();
const failures = [];
const retiredTickers = ['OKLO'];

const pruneFixture = pruneToCoverage({
  coverage: [{ ticker:'LITE' }, { ticker:'OKLO' }],
  tables: { Sources:[{ Ticker:'LITE' }, { Ticker:'OKLO' }] },
  datasets: { benchmark:{ LITE:{ ticker:'LITE' }, OKLO:{ ticker:'OKLO' } } }
}, new Set(['LITE']), new Set(['LITE', 'OKLO']));
if (JSON.stringify(pruneFixture).includes('OKLO') || pruneFixture.coverage.length !== 1 || pruneFixture.tables.Sources.length !== 1 || pruneFixture.datasets.benchmark.OKLO) {
  failures.push('Universal Refresh does not prune retired tickers from append-only live data');
}

const porcelainFixture = ' M chart-surface/data-contract.js\n?? path with spaces.json\n';
const porcelainPaths = parsePorcelainPaths(porcelainFixture);
if (porcelainPaths[0] !== 'chart-surface/data-contract.js' || porcelainPaths[1] !== 'path with spaces.json') {
  failures.push('autonomous release porcelain parser does not preserve the first path character');
}
for (const finalStatus of ['NOOP_VERIFIED', 'PUBLISHED_AND_VERIFIED']) {
  const receipt = buildReleaseReceipt(finalStatus, { status: 'NO_CHANGE', tickerCount: 15 }, { status: 'STALE_DETAIL', slot: 'primary' });
  if (receipt.status !== finalStatus) failures.push(`autonomous release receipt does not preserve terminal status ${finalStatus}`);
}
const requiredFiles = [
  'coverage-roster.json',
  'coverage-order.js',
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'pwa-register.js',
  'pwa-register-v27.js',
  'shared-menu.css',
  'shared-menu.js',
  'shared-topbar.css',
  'shared-topbar.js',
  'moomoo-patterns.html',
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
  'chart-surface/universal-refresh-gex-data.js',
  'chart-surface/universal-refresh-gex-consumer.js',
  'scripts/validate-universal-refresh-gex.mjs',
  'scripts/ingest-universal-refresh-gex.mjs',
  'scripts/run-universal-refresh-gex-cycle.mjs',
  'scripts/ingest-private-analysis.mjs',
  'scripts/sync-universal-refresh.mjs',
  'scripts/sync-market-data.mjs',
  'scripts/coverage-registry.mjs',
  'scripts/generate-coverage-order.mjs',
  'scripts/ticker-lifecycle.mjs',
  'scripts/ticker-lifecycle-lib.mjs',
  'scripts/ticker-lifecycle-qa.mjs',
  'scripts/with-tsaiandrew-source',
  'scripts/run-autonomous-universal-refresh.command',
  'automation/macos/com.tsaiandrew.elliott-universal-refresh.plist',
  'scripts/run-autonomous-cross-market-digest.mjs',
  'scripts/run-autonomous-cross-market-digest.command',
  'scripts/autonomous-cross-market-digest-qa.mjs',
  'automation/macos/com.tsaiandrew.elliott-cross-market-digest.plist',
  'chart-surface/gex-market-overview.js',
  'data-model/home.html',
  'data-model/coverage.html',
  'data-model/digest-model.js',
  'data-model/news-sources.json',
  'data-model/NEWS-SOURCES.md',
  'data-model/digests.json',
  'data-model/digest-data.js'
];

const exists = async (relative) => {
  try { await fs.access(path.join(root, relative)); return true; } catch (_) { return false; }
};
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');

for (const file of requiredFiles) {
  if (!(await exists(file))) failures.push(`missing required file: ${file}`);
}

if (await exists('data-model/news-sources.json')) {
  try {
    const registry = JSON.parse(await read('data-model/news-sources.json'));
    if (registry.schemaVersion !== 'elliott-news-sources-v1') failures.push('news source registry: invalid schemaVersion');
    if (!Array.isArray(registry.usageRules) || registry.usageRules.length < 3) failures.push('news source registry: usageRules are incomplete');
    if (!Array.isArray(registry.sources) || registry.sources.length < 1) failures.push('news source registry: sources are missing');
    const ids = new Set();
    for (const source of registry.sources || []) {
      if (!source.id || ids.has(source.id)) failures.push(`news source registry: missing or duplicate id ${source.id || '<empty>'}`);
      ids.add(source.id);
      if (!source.name || !source.kind || ![1, 2, 3].includes(source.priority) || typeof source.enabled !== 'boolean') failures.push(`news source registry: invalid metadata for ${source.id || '<empty>'}`);
      if (!Array.isArray(source.domains) || !source.domains.length || !Array.isArray(source.topics) || !source.topics.length) failures.push(`news source registry: domains/topics missing for ${source.id || '<empty>'}`);
      try {
        const url = new URL(source.homeUrl);
        if (url.protocol !== 'https:') failures.push(`news source registry: non-HTTPS homeUrl for ${source.id || '<empty>'}`);
      } catch (_) {
        failures.push(`news source registry: invalid homeUrl for ${source.id || '<empty>'}`);
      }
    }
  } catch (error) {
    failures.push(`news source registry: invalid JSON: ${error.message}`);
  }
}

if (await exists('scripts/run-autonomous-cross-market-digest.mjs')) {
  const runner = await read('scripts/run-autonomous-cross-market-digest.mjs');
  for (const marker of [
    'America/Los_Angeles',
    "edition:'morning'",
    "edition:'midday'",
    "edition:'close'",
    "weekday === 'Sat' || weekday === 'Sun'",
    'with-tsaiandrew-source',
    'run-close-digest-cycle.mjs',
    "status:'FAILED_GATE'"
  ]) {
    if (!runner.includes(marker)) failures.push(`autonomous digest runner is missing ${marker}`);
  }
}

if (await exists('automation/macos/com.tsaiandrew.elliott-cross-market-digest.plist')) {
  const launchAgent = await read('automation/macos/com.tsaiandrew.elliott-cross-market-digest.plist');
  for (const marker of [
    'com.tsaiandrew.elliott-cross-market-digest',
    'run-autonomous-cross-market-digest.command',
    'ELLIOTT_GITHUB_WRAPPER',
    'ELLIOTT_DIGEST_NOTIFY_FAILURES',
    '<key>RunAtLoad</key>'
  ]) {
    if (!launchAgent.includes(marker)) failures.push(`autonomous digest LaunchAgent is missing ${marker}`);
  }
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
    if (!html.includes('const publicGexText')) failures.push(`${file}: public GEX text filter is missing`);
    if (!html.includes('const publicAnalysisText')) failures.push(`${file}: public analysis text filter is missing`);
    if (!html.includes('.direction-item')) failures.push(`${file}: persistent direction rows are missing`);
    if (!html.includes('市場壓力地圖') || !html.includes('ElliottGexOverview') || !html.includes('gex-market-summary')) failures.push(`${file}: consolidated GEX market-pressure map is not wired`);
    if (!html.includes('marketMapMarkup')) failures.push(`${file}: integrated GEX market map is not wired`);
    if (!html.includes('renderLandmarks(marketProfiles)') || !html.includes('下方支撐候選') || !html.includes('上方壓力候選') || !html.includes('Gamma Pivot 候選') || !html.includes('正式 Flip 無法判定')) failures.push(`${file}: evidence-gated GEX landmark experiment is not wired`);
    if (!html.includes('紅圈＝下方支撐候選') || !html.includes('紫菱形＝Gamma Pivot') || !html.includes('綠圈＝上方壓力候選') || !html.includes('semanticMarkers')) failures.push(`${file}: GEX landmark colors and shapes are not tied back to the market map`);
    if (!html.includes('buildGexOptionSummaryHtml(data)') || !html.includes(".join('<br><br>')")) failures.push(`${file}: options summary does not reuse current- and next-week GEX scenarios across views`);
    if (html.includes('履約價 × 到期日熱圖') || html.includes('heatmapMarkup')) failures.push(`${file}: discarded GEX heatmap is still wired`);
    if (!html.includes('data-gex-map-analysis') || !html.includes('本週優先 · 壓力座標 × Ely 情境')) failures.push(`${file}: consolidated GEX market-map watch analysis is not wired`);
    if (!html.includes('.gex-landmark-reading { grid-column: 1 / -1;') || html.includes('style="grid-column:2 / -1"')) failures.push(`${file}: GEX priority-watch reading does not span the full row`);
    if (!html.includes('Math.min(4, marketProfiles.length)') || !html.includes('marketProfiles.slice(0, 4)')) failures.push(`${file}: GEX market map is not capped and laid out for four expirations`);
    for (const label of ['日線投影', '日線確認', '週線投影', '週線確認']) {
      if (!html.includes(label)) failures.push(`${file}: persistent direction label is missing: ${label}`);
    }
    if (html.includes('資料部分可用；完整度與限制已在摘要中整理。')) failures.push(`${file}: partial-status uncertainty notice is still public`);
    if (html.includes('資料限制：${escapeHtml')) failures.push(`${file}: GEX limitation disclaimer is still public`);
    if (!html.includes('const publicEvidenceLabel')) failures.push(`${file}: public source-label filter is missing`);
    if (/shape:\s*'arrowUp'\s*,\s*text:\s*'watch'/i.test(html)) failures.push(`${file}: generic watch arrow marker must not be rendered on candle charts`);
    if (!html.includes("technicalEvidence?.patterns?.[state.view === 'weekly' ? 'weeklyPrimary' : 'dailyPrimary']")) failures.push(`${file}: selected daily/weekly pattern coordinates are not wired to the chart`);
    if (!html.includes('const wyckoffPhaseEvidenceFor') || !html.includes('segmentsStatus: \'last-valid\'') || !html.includes("wyckoffPhaseEvidenceFor(ticker, 'weekly'")) failures.push(`${file}: partial refreshes can erase timeframe-specific Wyckoff phase geometry`);
    if (/if \(state\.view === 'weekly' \|\| !bars\.length \|\| !pattern\) return \[\]/.test(html)) failures.push(`${file}: weekly pattern geometry is still disabled`);
    if (!html.includes("state.view === 'weekly' ? null")) failures.push(`${file}: weekly charts can still fall back to daily geometry sidecars`);
    if (!html.includes('const coveragePrice = coverageItem && Number.isFinite(Number(coverageItem.price))')) failures.push(`${file}: chart price snapshot is not wired to the canonical coverage price`);
    if (!html.includes('function aggregateWeeklyBars(bars)')) failures.push(`${file}: weekly chart is not wired to refresh from the latest daily bars`);
    if (!html.includes('lastValueVisible: false });')) failures.push(`${file}: stale candle last-value label is still exposed`);
    if (!html.includes('colors.currentPrice, 1, L.LineStyle.Dashed, true')) failures.push(`${file}: current price line does not expose the canonical price label`);
    if (!html.includes('const DAILY_VISIBLE_MONTHS = 4') || !html.includes('setDefaultChartWindow(bars)')) failures.push(`${file}: daily chart default window is not constrained to the recent four months`);
    if (!html.includes('id="price-zero-floor"') || !html.includes('function updateZeroFloor()')) failures.push(`${file}: compressed zero-price floor is not wired below the candle pane`);
    if (!html.includes('panes.slice(0, 1).reduce') || !html.includes('const monthStarts = []')) failures.push(`${file}: candle date axis is not positioned and sampled deterministically`);
    if (!html.includes('function finitePrice(value)') || !html.includes('value !== null && value > 0') || !html.includes('const lowerBound = min > 0') || !html.includes('const minimumGap = getViewportWidth() <= 420 ? 72 : 88')) failures.push(`${file}: false zero levels, unused price space, or colliding date labels can distort the candle chart`);
  }
  if (file === 'data-model/coverage.html') {
    if (/coverage-manage-tab|coverage-form|new-ticker|data-toggle-ticker|data-remove-ticker/i.test(html)) failures.push(`${file}: hidden coverage-management controls leaked into the public home page`);
  }
  if (file === 'data-model/home.html') {
    if (html.includes('data-view="weekly"') || html.includes("model.groupRecords(dataset.records, 'weekly')")) failures.push(`${file}: separate weekly digest view is still exposed`);
    if (!html.includes('const selectedDate = today;') || !html.includes('hasNonRuntimeQuery') || html.includes("query.get('date')")) failures.push(`${file}: Home is not pinned to one canonical current-day URL`);
    if (!html.includes("const editionOrder = weekend ? ['close'] : ['close', 'midday', 'morning']")) failures.push(`${file}: current-day weekday/weekend cadence is not wired`);
  }
  if (file === 'data-model/app.html' && /data-view="coverage"/i.test(html)) {
    failures.push(`${file}: hidden coverage-management view is still exposed in the app navigation`);
  }
}

if (await exists('pwa-register-v27.js')) {
  const registration = await read('pwa-register-v27.js');
  if (!registration.includes("new URL('./service-worker.js'")) failures.push('pwa-register-v27.js: canonical service worker is not registered');
}

if (await exists('scripts/build-technical-reconciliation.mjs')) {
  const reconciliation = await read('scripts/build-technical-reconciliation.mjs');
  if (!reconciliation.includes('daily: wyckoff,')) failures.push('technical reconciliation drops Wyckoff phase segments from refreshed daily packets');
}

if (await exists('chart-surface/gex-market-overview.js')) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(await read('chart-surface/gex-market-overview.js'), context);
  const overview = context.ElliottGexOverview?.summarize([
    { label: '本週到期', expiry: '2026-09-18', profileKind: 'unsigned-pressure', strikes: [95, 100, 105], exposure: [2, 8, 4] },
    { label: '下週到期', expiry: '2026-09-25', profileKind: 'unsigned-pressure', strikes: [95, 100, 105], exposure: [2, 2, 2] }
  ], 100);
  if (!overview || overview.rows.length !== 2) failures.push('GEX market overview: two-expiration summary failed');
  if (overview?.rows[0]?.dominant?.strike !== 100) failures.push('GEX market overview: dominant strike calculation failed');
  if (Math.round((overview?.rows[0]?.share || 0) * 100) !== 70) failures.push('GEX market overview: expiration weighting failed');
  if (!/不能推定造市商方向/.test(overview?.interpretation || '')) failures.push('GEX market overview: unsigned evidence guardrail missing');
  const display = context.ElliottGexOverview?.displayProfile({ strikes: Array.from({ length: 80 }, (_, index) => index + 70), exposure: Array.from({ length: 80 }, (_, index) => index + 1) }, 100, 12);
  if (!display || display.strikes.length > 12 || display.strikes.some((strike) => strike < 65 || strike > 135)) failures.push('GEX market overview: spot-centered display selection failed');
  const collected = context.ElliottGexOverview?.collectProfiles([
    { label: '本週到期', expiry: '2026-09-18', profileKind: 'unsigned-pressure', strikes: [100], exposure: [1] },
    { label: '下週到期', expiry: '2026-09-25', profileKind: 'unsigned-pressure', strikes: [100], exposure: [1] }
  ], { additionalExpirations: [
    { expiry: '2026-10-02', status: 'aggregate_only', exposureType: 'unsigned_gamma_sensitivity', strikes: [100], exposure: [1] },
    { expiry: '2026-10-09', status: 'aggregate_only', exposureType: 'unsigned_gamma_sensitivity', strikes: [100], exposure: [1] }
  ] }, 4);
  if (collected?.length !== 4 || collected[3]?.label !== '第4週到期') failures.push('GEX market overview: four-expiration expansion failed');
  const fourWeekOverview = context.ElliottGexOverview?.summarize(collected, 100);
  if (fourWeekOverview?.rows.length !== 4 || !/4 個到期日/.test(fourWeekOverview?.interpretation || '') || !/第4週到期/.test(fourWeekOverview?.interpretation || '')) failures.push('GEX market overview: four-expiration narrative failed');
}

if (await exists('data-model/coverage.html')) {
  const home = await read('data-model/coverage.html');
  if (!home.includes('partialChartTickers') || !home.includes('hasChartData')) failures.push('data-model/coverage.html: partial-safe chart navigation gate is missing');
  if (!home.includes('PROTOTYPE_COVERAGE_ROSTER') || !home.includes('PROTOTYPE_COVERAGE_BY_TICKER')) failures.push('data-model/coverage.html: canonical coverage registry is not wired');
}

const canonicalProxyMarker = 'AKfycbyfPXGRSZvSa8NOp6OguWNYgWEB1wHcr42E6e_uvleNb-ckI_Rei23PEWigi2Wx3CzQRg';
for (const file of ['chart-surface/index.html', 'data-model/coverage.html', 'scripts/public-smoke.mjs']) {
  if (!(await read(file)).includes(canonicalProxyMarker)) failures.push(`${file}: canonical read proxy marker is missing`);
}
const publicSmoke = await read('scripts/public-smoke.mjs');
for (const marker of ['attempts: 5', 'cacheBustOnRetry: true', "searchParams.set('smokeRetry'"]) {
  if (!publicSmoke.includes(marker)) failures.push(`scripts/public-smoke.mjs: Apps Script retry hardening is missing ${marker}`);
}
const universalRunner = await read('scripts/run-autonomous-universal-refresh.command');
const privateIngest = await read('scripts/ingest-private-analysis.mjs');
const personalCredentialWrapper = await read('scripts/with-tsaiandrew-source');
if (!universalRunner.includes('${ROOT}/scripts/with-tsaiandrew-source')) failures.push('Universal Refresh runner must use the repo-native credential wrapper by default');
for (const marker of ['git -C "$ROOT" fetch origin main', 'worktree add --detach "$RUNTIME_DIR" origin/main', 'ELLIOTT_PACKET_WAIT_SECONDS', 'reconciling the live proxy with public state', '$RUNTIME_DIR/scripts/ingest-private-analysis.mjs', '$RUNTIME_DIR/scripts/sync-universal-refresh.mjs']) {
  if (!universalRunner.includes(marker)) failures.push(`Universal Refresh runner latest-main recovery is missing ${marker}`);
}
for (const marker of ['definitiveBridgeRejection', 'REJECTED_BY_PRIVATE_BRIDGE', 'WRITE_NOT_READ_VISIBLE', 'failure receipt written']) {
  if (!privateIngest.includes(marker)) failures.push(`Private ingest failure receipt is missing ${marker}`);
}
for (const marker of ['auth token --user tsaiandrew-source', 'export GH_TOKEN=', 'export GITHUB_TOKEN=']) {
  if (!personalCredentialWrapper.includes(marker)) failures.push(`scripts/with-tsaiandrew-source: missing ${marker}`);
}
if (/ghp_|github_pat_/i.test(personalCredentialWrapper)) failures.push('scripts/with-tsaiandrew-source: credential material must never be committed');

if (await exists('data-model/home.html')) {
  const home = await read('data-model/home.html');
  if (!home.includes('window.ELLIOTT_CROSS_MARKET_DIGESTS') && !home.includes('digest-data.js')) failures.push('data-model/home.html: digest dataset is not wired');
  for (const forbidden of ['calendar-menu', 'calendarWeeks()', "query.get('date')", 'previous-day', 'next-day', 'today-button']) {
    if (home.includes(forbidden)) failures.push(`data-model/home.html: current-day-only Home still exposes ${forbidden}`);
  }
  for (const marker of ['<title>E+ 市場摘要</title>', 'day-summary', 'const selectedDate = today;', "weekend ? ['close'] : ['close', 'midday', 'morning']", '16:00 PT']) {
    if (!home.includes(marker)) failures.push(`data-model/home.html: current-day digest surface is missing ${marker}`);
  }
  if (!home.includes('edition-details') || !home.includes("button.getAttribute('aria-expanded') === 'true'")) failures.push('data-model/home.html: inline digest expansion is missing');
  if (!home.includes('.edition-card[aria-expanded="true"] .edition-copy span { display:none; }')) failures.push('data-model/home.html: expanded digest still repeats the list summary');
  if (!home.includes('reader-close') || !home.includes('scrollIntoView')) failures.push('data-model/home.html: inline reader does not provide a touch-friendly close-and-return action');
  if (!home.includes('aria-controls') || !home.includes('disclosure')) failures.push('data-model/home.html: digest expansion state is not discoverable or programmatically associated');
  if (home.includes('id="reader"') || home.includes('reader-toolbar')) failures.push('data-model/home.html: obsolete standalone digest reader remains');
  for (const marker of ['color-scheme:light dark', '--background:light-dark', '--foreground:light-dark', '--primary:light-dark', '--content-max:900px', '.shell { width:min(var(--content-max),100%); margin:0 auto;', '@media (max-width:1024px)', '@media (pointer:coarse)', 'safe-area-inset-top', 'safe-area-inset-bottom']) {
    if (!home.includes(marker)) failures.push(`data-model/home.html: standalone moomoo-style surface is missing ${marker}`);
  }
  for (const forbidden of ['class="masthead"', 'network-state', '<elliott-shared-menu', 'shared-menu.css', 'shared-menu.js', 'pwa-register-v27.js', 'manifest.webmanifest']) {
    if (home.includes(forbidden)) failures.push(`data-model/home.html: discarded app shell is still exposed via ${forbidden}`);
  }
  for (const marker of ['shared-topbar.css', 'shared-topbar.js', '<elliott-topbar', 'data-current="digest"', 'data-digest-href="home.html"', 'data-moomoo-href="../moomoo-patterns.html"']) {
    if (!home.includes(marker)) failures.push(`data-model/home.html: reusable top bar is missing ${marker}`);
  }
}

if (await exists('moomoo-patterns.html')) {
  const moomoo = await read('moomoo-patterns.html');
  for (const marker of ['shared-topbar.css', 'shared-topbar.js', '<elliott-topbar', 'data-current="moomoo"', 'data-digest-href="data-model/home.html"', 'data-moomoo-href="moomoo-patterns.html"', '<title>E+ 每日型態</title>', '&lt;h2&gt;E+ 每日型態&lt;/h2&gt;', 'assets/elliott-plus-icon-32.png', 'assets/elliott-plus-apple-touch-icon.png']) {
    if (!moomoo.includes(marker)) failures.push(`moomoo-patterns.html: reusable top bar is missing ${marker}`);
  }
  for (const marker of ["script-src 'self'", "style-src 'self'", "img-src 'self'", '--shared-topbar-height', 'safe-area-inset-top', 'safe-area-inset-bottom', '100dvh']) {
    if (!moomoo.includes(marker)) failures.push(`moomoo-patterns.html: responsive top bar shell is missing ${marker}`);
  }
}

if (await exists('shared-topbar.js') && await exists('shared-topbar.css')) {
  const topbarScript = await read('shared-topbar.js');
  const topbarStyle = await read('shared-topbar.css');
  for (const marker of ['class ElliottTopbar', "customElements.define('elliott-topbar'", "label:'市場摘要'", "label:'每日型態'", 'aria-current']) {
    if (!topbarScript.includes(marker)) failures.push(`shared-topbar.js: missing ${marker}`);
  }
  for (const marker of ['position:fixed', 'top:0', '--shared-topbar-height:36px', '--content-max,900px', 'safe-area-inset-top', '@media (pointer:coarse)', '--shared-topbar-height:44px']) {
    if (!topbarStyle.includes(marker)) failures.push(`shared-topbar.css: missing ${marker}`);
  }
}

if (await exists('shared-menu.js')) {
  const sharedMenu = await read('shared-menu.js');
  for (const marker of ['dock-home', 'dock-coverage', 'ticker-menu-toggle', 'ticker-menu-trigger', 'PROTOTYPE_COVERAGE_COMPANIES', 'item.append(ticker, company)', 'shared-ticker-sheet,.ticker-sheet', 'aria-current', 'safe-area-inset-bottom', "['home', 'coverage', 'ticker']", "addEventListener('touchstart'", "addEventListener('touchend'", 'grid-template-rows:auto minmax(0,1fr)', 'overscroll-behavior:contain', 'touch-action:pan-y', 'scroll-snap-type:none']) {
    if (!sharedMenu.includes(marker)) failures.push(`shared-menu.js: missing ${marker}`);
  }
  for (const file of ['data-model/coverage.html', 'data-model/app.html', 'chart-surface/index.html']) {
    const html = await read(file);
  if (!html.includes('shared-menu.css') || !html.includes('shared-menu.js') || !html.includes('<elliott-shared-menu')) failures.push(`${file}: shared menu component is not mounted with its static stylesheet`);
    if (!html.includes('data-ticker-page-href=')) failures.push(`${file}: shared swipe navigation destinations are incomplete`);
  }
}

if (await exists('chart-surface/index.html')) {
  const chart = await read('chart-surface/index.html');
  if (!chart.includes('window.__elliottSelectTicker = selectTicker')) failures.push('chart-surface/index.html: inline ticker rail does not have an in-place selector hook');
  if (!chart.includes('window.history.pushState({}, \'\', nextUrl)')) failures.push('chart-surface/index.html: ticker switching does not update browser history');
  if (!chart.includes('preserveScroll') || !chart.includes('previousScrollTop')) failures.push('chart-surface/index.html: ticker menu re-render does not preserve phone scroll position');
  if (!chart.includes('#gex-profile { position: relative;') || !chart.includes('<div id="gex-profile" aria-label="Gamma exposure graph" hidden></div>')) failures.push('chart-surface/index.html: GEX surface is not an independent layout region');
  if (chart.includes("$('ticker-wheel').addEventListener('scroll'") || chart.includes('wheelScrollTimer')) failures.push('chart-surface/index.html: ticker menu must not change ticker on scroll');
}

if (await exists('chart-surface/universal-refresh-gex-consumer.js')) {
  const gexConsumer = await read('chart-surface/universal-refresh-gex-consumer.js');
  for (const marker of ['unsigned_gamma_sensitivity', 'profileKind', 'unsigned-pressure']) {
    if (!gexConsumer.includes(marker)) failures.push(`chart-surface/universal-refresh-gex-consumer.js: missing ${marker}`);
  }
}

if (await exists('chart-surface/universal-refresh-gex-data.js')) {
  try {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(await read('chart-surface/universal-refresh-gex-data.js'), context);
    validatePacket(context.window.UNIVERSAL_REFRESH_GEX, 'UNIVERSAL_REFRESH_GEX');
  } catch (error) {
    failures.push(`Universal Refresh GEX packet: ${error.message}`);
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
  if (dailyGroups[1]?.items.map((item) => item.edition).join(',') !== 'close,midday,morning') failures.push('digest model: daily editions are not newest-first');
  if (weeklyGroups.length !== 1 || weeklyGroups[0]?.items[0]?.id !== 'w-1') failures.push('digest model: weekly grouping failed');
  if (fixture.records.length !== 5) failures.push('digest model: invalid or duplicate records were not filtered');
}

if (await exists('data-model/digests.json') && await exists('data-model/digest-data.js')) {
  const canonicalDigests = JSON.parse(await read('data-model/digests.json'));
  const context = { window:{} };
  vm.createContext(context);
  vm.runInContext(await read('data-model/digest-data.js'), context);
  if (JSON.stringify(canonicalDigests) !== JSON.stringify(context.window.ELLIOTT_CROSS_MARKET_DIGESTS)) failures.push('digest data: canonical JSON and browser bundle have drifted');
}

for (const file of ['chart-surface/data-contract.js', 'chart-surface/benchmark-data.js', 'chart-surface/analysis-details.js', 'chart-surface/analysis-localization.js', 'chart-surface/analysis-geometry.js']) {
  if (!(await exists(file))) continue;
  const source = await read(file);
  if (/\/Users\/|[A-Z]:\\\\|P F Social|shared_research/i.test(source)) failures.push(`${file}: contains a local workspace path`);
}

const activeTickerFiles = [
  'coverage-order.js',
  'data-model/app.html',
  'data-model/coverage.html',
  'chart-surface/index.html',
  'chart-surface/data-contract.js',
  'chart-surface/partial-market-data/MANIFEST.json',
  'scripts/sync-universal-refresh.mjs',
  'scripts/validate-universal-refresh-gex.mjs'
];

try {
  const registry = await readCoverageRegistry(root);
  const generatedCoverage = await read('coverage-order.js');
  if (generatedCoverage !== renderCoverageOrderBrowser(registry)) failures.push('coverage-order.js has drifted from coverage-roster.json');
  if (registry.tickers.map((entry) => entry.ticker).join(',') !== UNIVERSE.join(',')) failures.push('Universal Refresh validator has drifted from coverage-roster.json');
} catch (error) {
  failures.push(`coverage registry: ${error.message}`);
}
try {
  const event = JSON.parse(await read('docs/ticker-lifecycle-events/2026-09-16-remove-OKLO.json'));
  if (event.schemaVersion !== 'elliott-ticker-lifecycle-event-v1' || event.action !== 'remove' || event.ticker !== 'OKLO') failures.push('OKLO lifecycle event identity is invalid');
  if (event.liveSource?.legacyCoverage?.active !== false || event.liveSource?.coverageMembership?.some((row) => row.active !== false || row.status !== 'inactive')) failures.push('OKLO lifecycle event does not prove inactive live-source state');
  if (!event.producer?.commit || !event.publicApplication?.removalCommit) failures.push('OKLO lifecycle event lacks cross-plane commit evidence');
} catch (error) {
  failures.push(`OKLO lifecycle event: ${error.message}`);
}
for (const file of ['data-model/app.html', 'data-model/coverage.html', 'chart-surface/index.html']) {
  const source = await read(file);
  if (/const\s+(?:trackingTickers|explorationTickers|twseTickers)\s*=/.test(source)) failures.push(`${file}: contains a duplicate hard-coded ticker roster`);
}
for (const file of activeTickerFiles) {
  const source = await read(file);
  for (const ticker of retiredTickers) {
    if (new RegExp(`\\b${ticker}\\b`, 'i').test(source)) failures.push(`${file}: retired ticker ${ticker} is still active`);
  }
}

const partialDir = path.join(root, 'chart-surface/partial-market-data');
if (await exists('chart-surface/partial-market-data')) {
  const files = (await fs.readdir(partialDir)).filter((file) => file.endsWith('.json'));
  const { order } = await loadCoverageRoster(root);
  const expectedFiles = [...order.map((ticker) => `${ticker}.json`), 'MANIFEST.json'];
  const missingFiles = expectedFiles.filter((file) => !files.includes(file));
  const extraFiles = files.filter((file) => !expectedFiles.includes(file));
  if (missingFiles.length || extraFiles.length) failures.push(`partial-market-data roster drift; missing=${missingFiles.join(',') || 'none'} extra=${extraFiles.join(',') || 'none'}`);
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(partialDir, 'MANIFEST.json'), 'utf8'));
    if (manifest.schemaVersion !== 'elliott-completed-session-market-data-v1') failures.push('partial-market-data manifest schema is invalid');
    if ((manifest.tickerOrder || []).join(',') !== order.join(',')) failures.push('partial-market-data manifest ticker order does not match canonical roster');
    if (new Set(Object.keys(manifest.tickers || {})).size !== order.length || order.some((ticker) => !manifest.tickers?.[ticker])) failures.push('partial-market-data manifest ticker set does not match canonical roster');
  } catch (error) {
    failures.push(`invalid partial-market-data manifest: ${error.message}`);
  }
  for (const ticker of order) {
    const file = `${ticker}.json`;
    try {
      const contents = await fs.readFile(path.join(partialDir, file), 'utf8');
      const data = JSON.parse(contents);
      verifyMarketDataset(data, { ticker });
      const expected = manifest?.tickers?.[ticker];
      if (!expected || expected.dataThrough !== data.dataThrough) failures.push(`${ticker}: market manifest date mismatch`);
      if (expected?.sha256 !== createHash('sha256').update(contents).digest('hex')) failures.push(`${ticker}: market manifest hash mismatch`);
    } catch (error) {
      failures.push(`invalid partial dataset ${file}: ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', checkedFiles: requiredFiles.length, partialDatasets: (await fs.readdir(partialDir)).filter((file) => file.endsWith('.json') && file !== 'MANIFEST.json').length }, null, 2));
}
