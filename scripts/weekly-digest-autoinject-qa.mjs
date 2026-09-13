import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  consumeWeeklyDigest,
  discoverWeeklyPacket,
  validateWeeklyPacket,
  weekStartInZone
} from './consume-close-digest.mjs';
import { releaseMetadata, releaseWeeklyDigest, validateConsumerAck } from './release-close-digest.mjs';
import { runWeeklyDigestCycle } from './run-close-digest-cycle.mjs';

const weekStart = '2026-09-07';
const publicationDate = '2026-09-13';
const publishedAt = `${publicationDate}T16:01:00-07:00`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const record = {
  id:`weekly-${weekStart}`,
  cadence:'weekly',
  edition:'weekly',
  weekStart,
  publishedAt,
  updatedAt:publishedAt,
  timezone:'America/Los_Angeles',
  sourceCutoffAt:`${publicationDate}T16:00:00-07:00`,
  retrievedAt:publishedAt,
  status:'complete',
  revision:1,
  title:'每週總結與展望',
  summary:'可獨立閱讀的每週市場摘要。',
  sections:[{ heading:'摘要', paragraphs:['測試內容。'] }],
  sources:[{ label:'Primary source', url:'https://example.com/source' }]
};
const packet = { schemaVersion:'elliott-cross-market-digest-v1', records:[record] };

assert.equal(weekStartInZone(`${publicationDate}T16:20:00-07:00`), weekStart);
assert.equal(validateWeeklyPacket(packet, {
  weekStart, now:`${publicationDate}T16:20:00-07:00`
}).id, record.id);
assert.throws(() => validateWeeklyPacket({ ...packet, records:[{ ...record, publishedAt:`${publicationDate}T15:59:00-07:00` }] }, {
  weekStart, now:`${publicationDate}T16:20:00-07:00`
}), /16:00 PT/);
assert.throws(() => validateWeeklyPacket({ ...packet, records:[{ ...record, weekStart:'2026-09-08' }] }, {
  weekStart, now:`${publicationDate}T16:20:00-07:00`
}), /weekStart/);
assert.throws(() => validateWeeklyPacket({ ...packet, records:[{ ...record, id:'weekly-2026-09-08', weekStart:'2026-09-08' }] }, {
  weekStart:'2026-09-08', now:`${publicationDate}T16:20:00-07:00`
}), /Monday/);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-weekly-autoinject-'));
const outbox = path.join(temporary, 'outbox');
const stateDir = path.join(temporary, 'state');
const repoRoot = path.join(temporary, 'repo');
await fs.mkdir(outbox, { recursive:true });
await fs.mkdir(path.join(repoRoot, 'data-model'), { recursive:true });
const emptyStore = { schemaVersion:'elliott-cross-market-digest-v1', generatedAt:null, records:[] };
await fs.writeFile(path.join(repoRoot, 'data-model/digests.json'), `${JSON.stringify(emptyStore, null, 2)}\n`);
await fs.writeFile(path.join(repoRoot, 'data-model/digest-data.js'), `window.ELLIOTT_CROSS_MARKET_DIGESTS = ${JSON.stringify(emptyStore)};\n`);
await fs.writeFile(path.join(outbox, `${record.id}.json`), JSON.stringify(packet));

const discovery = await discoverWeeklyPacket(outbox, weekStart);
assert.equal(discovery.matches.length, 1);
const ingested = await consumeWeeklyDigest({
  repoRoot, outbox, stateDir, weekStart,
  now:`${publicationDate}T16:20:00-07:00`, qa:false
});
assert.equal(ingested.status, 'INGESTED');
assert.equal(ingested.cadence, 'weekly');
assert.equal(ingested.weekStart, weekStart);
const ackPath = path.join(stateDir, 'acks', `${record.id}.json`);
const ack = JSON.parse(await fs.readFile(ackPath, 'utf8'));
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
validateConsumerAck(releaseAck, record, packetHash);
const metadata = releaseMetadata(record, packetHash);
assert.equal(metadata.branch, 'codex/digest-2026-09-07-weekly-r1');
assert.equal(metadata.title, 'Publish weekly digest 2026-09-07 (r1)');

await fs.writeFile(ackPath, JSON.stringify(releaseAck));
const releaseWorktree = path.join(stateDir, 'release-worktrees', `${record.id}-r1`);
await fs.mkdir(path.join(releaseWorktree, 'data-model'), { recursive:true });
await fs.writeFile(path.join(releaseWorktree, 'data-model/digests.json'), `${JSON.stringify(emptyStore)}\n`);
await fs.writeFile(path.join(releaseWorktree, 'data-model/digest-data.js'), `window.ELLIOTT_CROSS_MARKET_DIGESTS = ${JSON.stringify(emptyStore)};\n`);
let worktreeRevParseCount = 0;
const fakeRun = async (command, args, options = {}) => {
  if (command === 'git' && args[0] === 'status') return { stdout:' M data-model/digests.json\n M data-model/digest-data.js\n' };
  if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'origin/main') return { stdout:'base-sha\n' };
  if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
    if (options.cwd === releaseWorktree) return { stdout:`${worktreeRevParseCount++ === 0 ? 'base-sha' : 'release-sha'}\n` };
    return { stdout:'base-sha\n' };
  }
  if (command === 'git' && args[0] === 'branch') return { stdout:'' };
  return { stdout:'' };
};
const preparedRelease = await releaseWeeklyDigest({
  repoRoot, stateDir, consumerResult:ackPath, packet:ack.archivedPath,
  now:`${publicationDate}T16:20:00-07:00`, prepareOnly:true
}, { run:fakeRun });
assert.equal(preparedRelease.status, 'PREPARED');
assert.equal(preparedRelease.cadence, 'weekly');
assert.equal(preparedRelease.weekStart, weekStart);
assert.equal(preparedRelease.marketDate, undefined);
const replayed = JSON.parse(await fs.readFile(path.join(releaseWorktree, 'data-model/digests.json'), 'utf8'));
assert.equal(replayed.records[0].id, record.id);

const cycleState = path.join(temporary, 'cycle-state');
const cycleAckPath = path.join(cycleState, 'acks', `${record.id}.json`);
let observedWeekStart;
const cycle = await runWeeklyDigestCycle({
  mode:'primary', repoRoot, outbox, stateDir:cycleState,
  weekStart, now:`${publicationDate}T16:20:00-07:00`
}, {
  consume:async (options) => {
    observedWeekStart = options.weekStart;
    await fs.mkdir(path.dirname(cycleAckPath), { recursive:true });
    await fs.writeFile(cycleAckPath, JSON.stringify({ status:'INGESTED', digestId:record.id }));
    return { status:'INGESTED', digestId:record.id };
  },
  release:async (options) => {
    assert.equal(options.consumerResult, cycleAckPath);
    return { status:'PUBLISHED', outcome:'RELEASED' };
  }
});
assert.equal(observedWeekStart, weekStart);
assert.equal(cycle.weekStart, weekStart);
assert.equal(cycle.edition, 'weekly');

console.log(JSON.stringify({
  status:'PASS',
  sundayPublicationGate:true,
  mondayWeekIdentity:true,
  weeklyScopedDiscoveryLockAckArchive:true,
  deterministicWeeklyReleaseMetadata:true,
  latestBaseWeeklyReplay:true,
  weeklyAwareCycle:true
}, null, 2));
