import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDigestSnapshot,
  createMarketSnapshot,
  parseWindowAssignment,
  selectFreshestSnapshot,
  snapshotFingerprint
} from '../desktop/tauri-fresh-data-core.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const manifest = JSON.parse(await read('chart-surface/partial-market-data/MANIFEST.json'));
const payloadSources = Object.fromEntries(await Promise.all(manifest.tickerOrder.map(async (ticker) => [
  ticker,
  await read(`chart-surface/partial-market-data/${ticker}.json`)
])));
const market = await createMarketSnapshot({
  contractSource: await read('chart-surface/data-contract.js'),
  manifest,
  payloadSources
});
const digests = createDigestSnapshot(JSON.parse(await read('data-model/digests.json')));

assert.equal(Object.keys(market.datasets).length, manifest.tickerOrder.length);
assert.equal(market.dataThrough, manifest.tickers[manifest.tickerOrder[0]].dataThrough);
assert.ok(market.contract.coverage.length >= manifest.tickerOrder.length);
assert.ok(digests.dataset.records.length > 0);
assert.deepEqual(parseWindowAssignment('window.TEST = {"ready":true};\n', 'TEST'), { ready: true });

const current = { schemaVersion: 1, fetchedAt: '2026-09-15T00:00:00Z', market, digests };
const staleRemote = {
  ...current,
  fetchedAt: '2026-09-16T00:00:00Z',
  market: { ...market, dataThrough: '2026-09-01', fingerprint: 'stale-market' },
  digests: { ...digests, generatedAt: '2026-09-01T00:00:00Z', fingerprint: 'stale-digests' }
};
const selected = selectFreshestSnapshot(current, staleRemote);
assert.equal(selected.market.fingerprint, market.fingerprint, 'A remote market snapshot must never downgrade the accepted cache.');
assert.equal(selected.digests.fingerprint, digests.fingerprint, 'A remote digest snapshot must never downgrade the accepted cache.');
assert.equal(snapshotFingerprint(selected), snapshotFingerprint(current));

const badPayloadSources = { ...payloadSources, [manifest.tickerOrder[0]]: `${payloadSources[manifest.tickerOrder[0]]}\n` };
await assert.rejects(
  createMarketSnapshot({ contractSource: await read('chart-surface/data-contract.js'), manifest, payloadSources: badPayloadSources }),
  /hash does not match/
);

const mixedManifest = structuredClone(manifest);
const mixedTicker = mixedManifest.tickerOrder[0];
const mixedPayloadSources = { ...payloadSources };
const mixedPayload = JSON.parse(mixedPayloadSources[mixedTicker]);
mixedPayload.bars = mixedPayload.bars.slice(0, -1);
mixedPayload.dataThrough = mixedPayload.bars.at(-1).date;
mixedManifest.tickers[mixedTicker].dataThrough = mixedPayload.dataThrough;
mixedManifest.tickers[mixedTicker].close = mixedPayload.bars.at(-1).close;
mixedPayloadSources[mixedTicker] = JSON.stringify(mixedPayload);
mixedManifest.tickers[mixedTicker].sha256 = createHash('sha256').update(mixedPayloadSources[mixedTicker]).digest('hex');
const mixedContract = structuredClone(market.contract);
mixedContract.coverage.find((item) => item.ticker === mixedTicker).latestChartDate = mixedPayload.dataThrough;
await assert.rejects(
  createMarketSnapshot({
    contractSource: `window.PROTOTYPE_DATA_CONTRACT = ${JSON.stringify(mixedContract)};`,
    manifest: mixedManifest,
    payloadSources: mixedPayloadSources
  }),
  /mixed completed-session dates/
);

console.log(JSON.stringify({
  status: 'PASS',
  tickerCount: manifest.tickerOrder.length,
  marketDataThrough: market.dataThrough,
  digestGeneratedAt: digests.generatedAt,
  downgradeProtection: true,
  sha256Gate: true,
  atomicSessionGate: true
}, null, 2));
