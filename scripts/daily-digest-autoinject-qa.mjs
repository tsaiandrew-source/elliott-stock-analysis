import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  consumeDailyDigest,
  discoverDailyPacket,
  validateDailyPacket
} from './consume-close-digest.mjs';
import { releaseMetadata, validateConsumerAck } from './release-close-digest.mjs';
import { runDailyDigestCycle } from './run-close-digest-cycle.mjs';

const marketDate = '2026-09-11';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const recordFor = (edition, publishedAt) => ({
  id:`daily-${marketDate}-${edition}`,
  cadence:'daily',
  edition,
  marketDate,
  publishedAt,
  updatedAt:publishedAt,
  timezone:'America/Los_Angeles',
  sourceCutoffAt:publishedAt,
  retrievedAt:publishedAt,
  status:'complete',
  revision:1,
  title:`${edition} digest`,
  summary:'可獨立閱讀的市場摘要。',
  sections:[{ heading:'摘要', paragraphs:['測試內容。'] }],
  sources:[{ label:'Primary source', url:'https://example.com/source' }]
});

const morning = recordFor('morning', `${marketDate}T05:31:00-07:00`);
const midday = recordFor('midday', `${marketDate}T11:31:00-07:00`);
const close = recordFor('close', `${marketDate}T16:01:00-07:00`);

assert.equal(validateDailyPacket(morning, { edition:'morning', marketDate, now:`${marketDate}T05:50:00-07:00` }).id, morning.id);
assert.equal(validateDailyPacket(midday, { edition:'midday', marketDate, now:`${marketDate}T11:50:00-07:00` }).id, midday.id);
assert.equal(validateDailyPacket(close, { edition:'close', marketDate, now:`${marketDate}T16:20:00-07:00` }).id, close.id);
assert.throws(() => validateDailyPacket({ ...morning, publishedAt:`${marketDate}T05:29:00-07:00` }, {
  edition:'morning', marketDate, now:`${marketDate}T05:50:00-07:00`
}), /05:30 PT/);
assert.throws(() => validateDailyPacket(midday, { edition:'morning', marketDate, now:`${marketDate}T11:50:00-07:00` }), /morning edition/);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-daily-autoinject-'));
const outbox = path.join(temporary, 'outbox');
const stateDir = path.join(temporary, 'state');
const repoRoot = path.join(temporary, 'repo');
await fs.mkdir(outbox, { recursive:true });
await fs.mkdir(path.join(repoRoot, 'data-model'), { recursive:true });
const emptyStore = { schemaVersion:'elliott-cross-market-digest-v1', generatedAt:null, records:[] };
await fs.writeFile(path.join(repoRoot, 'data-model/digests.json'), `${JSON.stringify(emptyStore, null, 2)}\n`);
await fs.writeFile(path.join(repoRoot, 'data-model/digest-data.js'), `window.ELLIOTT_CROSS_MARKET_DIGESTS = ${JSON.stringify(emptyStore)};\n`);

for (const record of [morning, midday, close]) {
  await fs.writeFile(path.join(outbox, `${record.edition}.json`), JSON.stringify({
    schemaVersion:'elliott-cross-market-digest-v1', records:[record]
  }));
}
const discovery = await discoverDailyPacket(outbox, marketDate, 'midday');
assert.equal(discovery.matches.length, 1);
assert.equal(path.basename(discovery.matches[0].file), 'midday.json');

const ingested = await consumeDailyDigest({
  edition:'midday', repoRoot, outbox, stateDir, marketDate,
  now:`${marketDate}T11:50:00-07:00`, qa:false
});
assert.equal(ingested.status, 'INGESTED');
assert.equal(ingested.edition, 'midday');
const ackPath = path.join(stateDir, 'acks', `${midday.id}.json`);
const ack = JSON.parse(await fs.readFile(ackPath, 'utf8'));
assert.equal(ack.digestId, midday.id);
assert.equal(ack.edition, 'midday');

const packetText = await fs.readFile(ack.archivedPath, 'utf8');
const packetHash = sha256(packetText);
const releaseAck = {
  ...ack,
  qa:[
    { script:'scripts/digest-ingest-qa.mjs', status:'PASS' },
    { script:'scripts/static-qa.mjs', status:'PASS' },
    { script:'scripts/pwa-qa.mjs', status:'PASS' }
  ]
};
validateConsumerAck(releaseAck, midday, packetHash);
const metadata = releaseMetadata(midday, packetHash);
assert.equal(metadata.branch, 'codex/digest-2026-09-11-midday-r1');
assert.equal(metadata.title, 'Publish midday digest 2026-09-11 (r1)');

let observedEdition;
let observedAckPath;
const cycleState = path.join(temporary, 'cycle-state');
const cycleAckPath = path.join(cycleState, 'acks', `${morning.id}.json`);
const cycle = await runDailyDigestCycle({
  edition:'morning', mode:'primary', repoRoot, outbox, stateDir:cycleState,
  marketDate, now:`${marketDate}T05:50:00-07:00`
}, {
  consume:async (options) => {
    observedEdition = options.edition;
    await fs.mkdir(path.dirname(cycleAckPath), { recursive:true });
    await fs.writeFile(cycleAckPath, JSON.stringify({ status:'INGESTED', digestId:morning.id }));
    return { status:'INGESTED', digestId:morning.id };
  },
  release:async (options) => {
    observedAckPath = options.consumerResult;
    return { status:'PUBLISHED', outcome:'RELEASED' };
  }
});
assert.equal(observedEdition, 'morning');
assert.equal(observedAckPath, cycleAckPath);
assert.equal(cycle.edition, 'morning');

console.log(JSON.stringify({
  status:'PASS',
  editionSchedules:true,
  editionScopedDiscovery:true,
  editionScopedLockAckArchive:true,
  deterministicReleaseMetadata:true,
  editionAwareCycle:true
}, null, 2));
