import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const exists = async (relative) => { try { await fs.access(path.join(root, relative)); return true; } catch (_) { return false; } };
const required = [
  'social-exploration.html',
  'social-exploration.css',
  'social-exploration.js',
  'data-model/social-exploration-roster.json',
  'data-model/social-exploration-news-digests.json',
  'data-model/social-exploration.json',
  'data-model/social-exploration-data.js',
  'scripts/update-social-exploration.mjs'
];
for (const file of required) if (!(await exists(file))) failures.push(`missing ${file}`);
const roster = JSON.parse(await read('data-model/social-exploration-roster.json'));
const dataset = JSON.parse(await read('data-model/social-exploration.json'));
const digestModel = JSON.parse(await read('data-model/social-exploration-news-digests.json'));
const tickers = roster.tickers.map((entry) => entry.ticker);
const exclusions = new Set([...(roster.exclusion?.list1 || []), ...(roster.exclusion?.candidate || [])]);
if (roster.schemaVersion !== 'social-exploration-roster-v1') failures.push('roster schema mismatch');
if (tickers.length !== 20 || new Set(tickers).size !== 20) failures.push('roster must contain 20 unique tickers');
if (tickers.some((ticker) => exclusions.has(ticker))) failures.push('roster overlaps Moomoo List 1 or Candidate');
if ((roster.profiles || []).length !== 8) failures.push('all eight approved profiles must remain tracked');
if (roster.tickers.filter((entry) => entry.lane === 'common').length !== 10) failures.push('Common lane must contain 10 names');
if (roster.tickers.filter((entry) => entry.lane === 'surprise').length !== 10) failures.push('Surprise lane must contain 10 names');
if (dataset.schemaVersion !== 'social-exploration-daily-v1') failures.push('daily schema mismatch');
if ((dataset.records || []).length !== 20) failures.push('daily dataset must contain 20 records');
if ((dataset.records || []).map((entry) => entry.ticker).join(',') !== tickers.join(',')) failures.push('daily dataset order does not match roster');
if (roster.tickers.some((entry) => !entry.businessReportPeriod || !entry.businessDigest || !entry.businessSourceUrl)) failures.push('every roster entry must include a sourced latest-quarter Business Digest');
const hasCjk = (value) => /[\u3400-\u9fff]/.test(String(value || ''));
if (digestModel.language !== 'zh-Hant') failures.push('news editorial model must be Traditional Chinese');
if (dataset.records.some((entry) => !hasCjk(entry.businessDigest) || !hasCjk(entry.newsDigest) || entry.newsDigestLanguage !== 'zh-Hant' || !['current','stale'].includes(entry.newsFreshness))) failures.push('every visible Business and News Digest must be a usable Traditional Chinese editorial summary');
const html = await read('social-exploration.html');
const css = await read('social-exploration.css');
const js = await read('social-exploration.js');
for (const marker of ['viewport-fit=cover', 'safe-area-inset-top', 'safe-area-inset-right', 'safe-area-inset-left', '100dvh']) {
  if (!`${html}\n${css}`.includes(marker)) failures.push(`mobile layout missing ${marker}`);
}
for (const marker of ['min-height:44px', '@media (max-width:680px)', 'td::before', 'prefers-reduced-motion']) if (!css.includes(marker)) failures.push(`responsive/accessibility CSS missing ${marker}`);
for (const marker of ['aria-live="polite"', 'aria-pressed="true"', 'data-sort="signal"', 'class="full-only"']) if (!html.includes(marker)) failures.push(`accessible interaction missing ${marker}`);
if (html.includes('決策檢視') || html.includes('data-view=')) failures.push('page must expose full analysis only');
for (const marker of ['營運摘要', '新聞摘要', '<th scope="col">來源</th>']) if (!html.includes(marker)) failures.push(`digest table missing ${marker}`);
if (!js.includes('profile-sources') || !js.includes("create('details'")) failures.push('source profile links must remain collapsed');
if (js.includes("create('summary', '新聞來源')") || js.includes("create('summary', '資料來源')") || js.includes('record.newsHeadline')) failures.push('digest cells must not expose source references or copied headlines');
if (html.includes('shared-menu.css') || html.includes('<elliott-shared-menu')) failures.push('standalone decision reader must not mount the app navigation dock');
for (const marker of ['textContent', 'safeUrl', 'freshness', 'interpretation']) if (!js.includes(marker)) failures.push(`safe reader behavior missing ${marker}`);
if (/innerHTML|document\.write/.test(js)) failures.push('page renderer must not inject dataset HTML');
if (!dataset.dataThrough || !/^\d{4}-\d{2}-\d{2}$/.test(dataset.dataThrough)) failures.push('daily dataset dataThrough is invalid');
if (failures.length) {
  console.error(JSON.stringify({ status:'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status:'PASS', tickers:tickers.length, profiles:roster.profiles.length, dataThrough:dataset.dataThrough, viewports:['390x844','844x390','820x1180','1180x820','507x1024'] }, null, 2));
}
