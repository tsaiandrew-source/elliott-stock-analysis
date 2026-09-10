import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { consumeCloseDigest, discoverClosePacket, validateClosePacket } from './consume-close-digest.mjs';

const marketDate = '2026-09-10';
const now = '2026-09-10T16:20:00-07:00';
const record = {
  id:'daily-2026-09-10-close',
  cadence:'daily',
  edition:'close',
  marketDate,
  publishedAt:'2026-09-10T16:05:00-07:00',
  timezone:'America/Los_Angeles',
  sourceCutoffAt:'2026-09-10T16:00:00-07:00',
  retrievedAt:'2026-09-10T16:04:00-07:00',
  status:'complete',
  revision:1,
  title:'收盤綜合判讀｜2026-09-10',
  summary:'完整交易時段結束後的跨市場摘要。',
  sections:[{ heading:'收盤', paragraphs:['測試內容。'] }],
  sources:[{ label:'Primary source', url:'https://example.com/source' }]
};

assert.equal(validateClosePacket(record, { marketDate, now }).id, record.id);
assert.throws(() => validateClosePacket({ ...record, edition:'midday' }, { marketDate, now }), /close edition/);
assert.throws(() => validateClosePacket({ ...record, id:'unstable' }, { marketDate, now }), /packet id/);
assert.throws(() => validateClosePacket({ ...record, timezone:'UTC' }, { marketDate, now }), /timezone/);
assert.throws(() => validateClosePacket({ ...record, sources:[] }, { marketDate, now }), /sources/);
assert.throws(() => validateClosePacket({ ...record, sources:[{ label:'unsafe', url:'javascript:alert(1)' }] }, { marketDate, now }), /http or https/);
assert.throws(() => validateClosePacket(record, { marketDate, now:'2026-09-11T00:00:00-07:00', maxAgeMinutes:60 }), /older than/);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-close-consumer-'));
const outbox = path.join(temporary, 'outbox');
await fs.mkdir(outbox);
await fs.writeFile(path.join(outbox, 'close.json'), JSON.stringify({ schemaVersion:'elliott-cross-market-digest-v1', records:[record] }));
await fs.writeFile(path.join(outbox, 'other.json'), JSON.stringify({ ...record, edition:'midday', id:'daily-2026-09-10-midday' }));
await fs.writeFile(path.join(outbox, 'broken.json'), '{');
const discovery = await discoverClosePacket(outbox, marketDate);
assert.equal(discovery.matches.length, 1);
assert.equal(discovery.malformed.length, 1);
const dryRun = await consumeCloseDigest({
  repoRoot:process.cwd(),
  outbox,
  stateDir:path.join(temporary, 'state'),
  marketDate,
  now,
  dryRun:true
});
assert.equal(dryRun.status, 'READY');
assert.equal(dryRun.digestId, record.id);

const liveRoot = path.join(temporary, 'repo');
const liveOutbox = path.join(temporary, 'live-outbox');
const liveState = path.join(temporary, 'live-state');
await fs.mkdir(path.join(liveRoot, 'data-model'), { recursive:true });
await fs.mkdir(liveOutbox);
const emptyStore = { schemaVersion:'elliott-cross-market-digest-v1', generatedAt:null, records:[] };
await fs.writeFile(path.join(liveRoot, 'data-model/digests.json'), `${JSON.stringify(emptyStore, null, 2)}\n`);
await fs.writeFile(path.join(liveRoot, 'data-model/digest-data.js'), 'window.ELLIOTT_CROSS_MARKET_DIGESTS = {"schemaVersion":"elliott-cross-market-digest-v1","generatedAt":null,"records":[]};\n');
const livePacket = JSON.stringify({ schemaVersion:'elliott-cross-market-digest-v1', records:[record] });
await fs.writeFile(path.join(liveOutbox, 'close.json'), livePacket);
const ingested = await consumeCloseDigest({ repoRoot:liveRoot, outbox:liveOutbox, stateDir:liveState, marketDate, now, qa:false });
assert.equal(ingested.status, 'INGESTED');
assert.equal(JSON.parse(await fs.readFile(path.join(liveRoot, 'data-model/digests.json'), 'utf8')).records[0].id, record.id);
assert.equal(JSON.parse(await fs.readFile(path.join(liveState, 'acks', `${record.id}.json`), 'utf8')).packetSha256, ingested.packetSha256);
await fs.writeFile(path.join(liveOutbox, 'close.json'), livePacket);
const replay = await consumeCloseDigest({ repoRoot:liveRoot, outbox:liveOutbox, stateDir:liveState, marketDate, now, qa:false });
assert.equal(replay.status, 'UNCHANGED');

console.log(JSON.stringify({
  status:'PASS',
  closeOnly:true,
  stableIdentity:true,
  timezoneAndFreshness:true,
  sourceSafety:true,
  discovery:true,
  dryRun:true,
  atomicIngestAndAck:true,
  unchangedReplay:true
}, null, 2));
