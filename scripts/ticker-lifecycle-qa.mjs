import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyTickerLifecycle, planTickerLifecycle, pruneTicker } from './ticker-lifecycle-lib.mjs';

const sourceRoot = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-ticker-lifecycle-'));
const fixtureRoot = path.join(tempRoot, 'repo');
await fs.mkdir(path.join(fixtureRoot, 'chart-surface/partial-market-data'), { recursive:true });
for (const relative of ['coverage-roster.json', 'coverage-order.js', 'chart-surface/data-contract.js', 'chart-surface/universal-refresh-gex-data.js', 'chart-surface/partial-market-data/MANIFEST.json', 'service-worker.js']) {
  await fs.copyFile(path.join(sourceRoot, relative), path.join(fixtureRoot, relative));
}
const gexSource = await fs.readFile(path.join(sourceRoot, 'chart-surface/universal-refresh-gex-data.js'), 'utf8');
const gexPacket = JSON.parse(gexSource.slice(gexSource.indexOf('{'), gexSource.lastIndexOf('}') + 1));
const liteGexPath = path.join(tempRoot, 'LITE-gex-record.json');
await fs.writeFile(liteGexPath, JSON.stringify(gexPacket.records.find((record) => record.ticker === 'LITE')), 'utf8');
const liteRefreshReceiptPath = path.join(tempRoot, 'LITE-refresh-receipt.json');
await fs.writeFile(liteRefreshReceiptPath, JSON.stringify({
  recordType:'universal_refresh_run',
  schemaVersion:'universal-refresh-run-v1',
  runId:'universal-refresh-ticker-add-LITE-2026-09-16',
  cycleKey:'ticker-add-LITE-2026-09-16',
  status:'READY',
  requestedTicker:'LITE',
  tickerCount:1,
  reportPath:'/protected/production_state/rob-stock-analysis/ticker-follow-ups/LITE/report.json',
  reportSha256:'a'.repeat(64),
  failedTickers:[],
  partialTickers:[]
}), 'utf8');
const roster = JSON.parse(await fs.readFile(path.join(sourceRoot, 'coverage-roster.json'), 'utf8'));
for (const { ticker } of roster.tickers) {
  await fs.copyFile(path.join(sourceRoot, 'chart-surface/partial-market-data', `${ticker}.json`), path.join(fixtureRoot, 'chart-surface/partial-market-data', `${ticker}.json`));
}

const nested = pruneTicker({ rows:[{ Ticker:'OKLO' }, { ticker:'LITE' }], maps:{ OKLO:{ ticker:'OKLO' }, LITE:{} } }, 'OKLO');
assert.equal(JSON.stringify(nested).includes('OKLO'), false);

const before = await fs.readFile(path.join(fixtureRoot, 'coverage-roster.json'), 'utf8');
await planTickerLifecycle({ repoRoot:fixtureRoot, action:'remove', ticker:'LITE', effectiveDate:'2026-09-16' });
assert.equal(await fs.readFile(path.join(fixtureRoot, 'coverage-roster.json'), 'utf8'), before, 'dry run changed the registry');

await applyTickerLifecycle({ repoRoot:fixtureRoot, action:'remove', ticker:'LITE', effectiveDate:'2026-09-16' });
const removedRoster = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'coverage-roster.json'), 'utf8'));
assert.equal(removedRoster.tickers.some((entry) => entry.ticker === 'LITE'), false);
await assert.rejects(fs.access(path.join(fixtureRoot, 'chart-surface/partial-market-data/LITE.json')));
const removedManifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'chart-surface/partial-market-data/MANIFEST.json'), 'utf8'));
assert.equal(Boolean(removedManifest.tickers.LITE), false);
assert.equal((await fs.readFile(path.join(fixtureRoot, 'chart-surface/data-contract.js'), 'utf8')).includes('LITE'), false);
assert.equal((await fs.readFile(path.join(fixtureRoot, 'chart-surface/universal-refresh-gex-data.js'), 'utf8')).includes('"ticker":"LITE"'), false);

await assert.rejects(
  planTickerLifecycle({ repoRoot:fixtureRoot, action:'add', ticker:'TEST', effectiveDate:'2026-09-16', metadata:{} }),
  /required/
);
await assert.rejects(
  planTickerLifecycle({
    repoRoot:fixtureRoot,
    action:'add', ticker:'LITE', effectiveDate:'2026-09-16', after:'NBIS',
    marketDataPath:path.join(sourceRoot, 'chart-surface/partial-market-data/LITE.json'),
    gexRecordPath:liteGexPath,
    metadata:{ company:'Lumentum Holdings', exchange:'NASDAQ', coverageGroup:'tracking', marketGroup:'us', defaultView:'daily', marketSource:'https://example.invalid/LITE' }
  }),
  /refresh-receipt/
);
const shortHistoryPath = path.join(tempRoot, 'short-market-data.json');
const shortBars = Array.from({ length:102 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 2, 16 + index));
  return { time:date.getTime() / 1000, date:date.toISOString().slice(0, 10), open:10, high:12, low:9, close:11, volume:100 };
});
await fs.writeFile(shortHistoryPath, JSON.stringify({ dataThrough:shortBars.at(-1).date, bars:shortBars }), 'utf8');
await assert.rejects(
  planTickerLifecycle({
    repoRoot:fixtureRoot,
    action:'add', ticker:'LITE', effectiveDate:'2026-09-16', after:'NBIS',
    marketDataPath:shortHistoryPath,
    gexRecordPath:liteGexPath,
    refreshReceiptPath:liteRefreshReceiptPath,
    metadata:{ company:'Lumentum Holdings', exchange:'NASDAQ', coverageGroup:'tracking', marketGroup:'us', defaultView:'daily', marketSource:'https://example.invalid/LITE' }
  }),
  /initial sync requires at least 252 daily candles/
);
const addResult = await applyTickerLifecycle({
  repoRoot:fixtureRoot,
  action:'add', ticker:'LITE', effectiveDate:'2026-09-16', after:'NBIS',
  marketDataPath:path.join(sourceRoot, 'chart-surface/partial-market-data/LITE.json'),
  gexRecordPath:liteGexPath,
  refreshReceiptPath:liteRefreshReceiptPath,
  metadata:{ company:'Lumentum Holdings', exchange:'NASDAQ', coverageGroup:'tracking', marketGroup:'us', defaultView:'daily', marketSource:'https://example.invalid/LITE' }
});
assert.equal(addResult.oneOffRefresh.requestedTicker, 'LITE');
assert.equal(addResult.oneOffRefresh.status, 'READY');
assert.ok(addResult.marketHistory.dailyBars >= 252);
assert.ok(addResult.marketHistory.weeklyBars >= 52);
const restoredRoster = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'coverage-roster.json'), 'utf8'));
assert.equal(restoredRoster.tickers.findIndex((entry) => entry.ticker === 'LITE'), restoredRoster.tickers.findIndex((entry) => entry.ticker === 'NBIS') + 1);
assert.equal((await fs.readFile(path.join(fixtureRoot, 'coverage-order.js'), 'utf8')).includes('"ticker": "LITE"'), true);
assert.equal((await fs.readFile(path.join(fixtureRoot, 'chart-surface/data-contract.js'), 'utf8')).includes('"ticker": "LITE"'), true);
assert.equal((await fs.readFile(path.join(fixtureRoot, 'chart-surface/universal-refresh-gex-data.js'), 'utf8')).includes('"ticker":"LITE"'), true);

await fs.rm(tempRoot, { recursive:true, force:true });
console.log(JSON.stringify({ status:'PASS', checks:['dry-run-no-write', 'recursive-remove', 'manifest-prune', 'gex-roster-sync', 'missing-input-fail-closed', 'post-add-refresh-required', 'initial-history-required', 'add-round-trip'] }, null, 2));
