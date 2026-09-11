import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertAllowedChanges, releaseCloseDigest, releaseMetadata, validateConsumerAck } from './release-close-digest.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const marketDate = '2026-09-10';
const record = {
  id:`daily-${marketDate}-close`, cadence:'daily', edition:'close', marketDate,
  publishedAt:`${marketDate}T16:01:00-07:00`, updatedAt:`${marketDate}T16:01:00-07:00`,
  timezone:'America/Los_Angeles', sourceCutoffAt:`${marketDate}T16:00:00-07:00`,
  retrievedAt:`${marketDate}T16:01:00-07:00`, status:'complete', revision:1,
  title:'收盤綜合判讀', summary:'測試摘要', sections:[{ heading:'摘要', paragraphs:['測試內容'] }],
  sources:[{ label:'Source', url:'https://example.com/source' }]
};
const packetText = JSON.stringify({ schemaVersion:'elliott-cross-market-digest-v1', records:[record] }, null, 2);
const packetHash = sha256(packetText);
const qa = [
  { script:'scripts/digest-ingest-qa.mjs', status:'PASS' },
  { script:'scripts/static-qa.mjs', status:'PASS' },
  { script:'scripts/pwa-qa.mjs', status:'PASS' }
];

assert.deepEqual(assertAllowedChanges(' M data-model/digests.json\n M data-model/digest-data.js\n'), [
  'data-model/digests.json', 'data-model/digest-data.js'
]);
assert.throws(() => assertAllowedChanges(' M service-worker.js\n'), /unexpected repository changes/);
const metadata = releaseMetadata(record, packetHash);
assert.equal(metadata.branch, 'codex/digest-2026-09-10-close-r1');
assert.equal(metadata.title, 'Publish close digest 2026-09-10 (r1)');
assert.match(metadata.body, new RegExp(packetHash));

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-release-qa-'));
const repoRoot = path.join(temporary, 'repo');
const stateDir = path.join(temporary, 'state');
const packetPath = path.join(temporary, 'packet.json');
const ackPath = path.join(temporary, 'ack.json');
await fs.mkdir(path.join(repoRoot, 'data-model'), { recursive:true });
const storeText = `${JSON.stringify({ schemaVersion:'elliott-cross-market-digest-v1', records:[record] })}\n`;
const browserText = 'window.ELLIOTT_CROSS_MARKET_DIGESTS = {};\n';
await fs.writeFile(path.join(repoRoot, 'data-model/digests.json'), storeText);
await fs.writeFile(path.join(repoRoot, 'data-model/digest-data.js'), browserText);
await fs.writeFile(packetPath, packetText);
const ack = {
  status:'INGESTED', digestId:record.id, marketDate, edition:'close', revision:1,
  packetSha256:packetHash, storeSha256:sha256(storeText), browserBundleSha256:sha256(browserText),
  qa, archivedPath:packetPath
};
await fs.writeFile(ackPath, JSON.stringify(ack));
validateConsumerAck(ack, record, packetHash);
assert.throws(() => validateConsumerAck({ ...ack, qa:qa.slice(1) }, record, packetHash), /incomplete/);

const worktree = path.join(stateDir, 'release-worktrees', `${record.id}-r1`);
await fs.mkdir(path.join(worktree, 'data-model'), { recursive:true });
const concurrentMorning = {
  ...record,
  id:`daily-${marketDate}-morning`,
  edition:'morning',
  publishedAt:`${marketDate}T05:31:00-07:00`,
  updatedAt:`${marketDate}T05:31:00-07:00`,
  sourceCutoffAt:`${marketDate}T05:30:00-07:00`,
  retrievedAt:`${marketDate}T05:31:00-07:00`
};
const baseStoreText = `${JSON.stringify({ schemaVersion:'elliott-cross-market-digest-v1', records:[concurrentMorning] })}\n`;
await fs.writeFile(path.join(worktree, 'data-model/digests.json'), baseStoreText);
await fs.writeFile(path.join(worktree, 'data-model/digest-data.js'), browserText);
let worktreeRevParseCount = 0;
let prViewCount = 0;
const calls = [];
const fakeRun = async (command, args, options = {}) => {
  calls.push({ command, args:[...args], cwd:options.cwd, env:options.env });
  if (command === 'git' && args[0] === 'status') return { stdout:' M data-model/digests.json\n M data-model/digest-data.js\n' };
  if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'origin/main') return { stdout:'base-sha\n' };
  if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
    if (options.cwd === worktree) return { stdout:`${worktreeRevParseCount++ === 0 ? 'base-sha' : 'release-sha'}\n` };
    return { stdout:'base-sha\n' };
  }
  if (command === 'git' && args[0] === 'branch') return { stdout:'' };
  if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') return { stdout:'[]' };
  if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') return { stdout:'https://github.com/example/repo/pull/1\n' };
  if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
    prViewCount += 1;
    return { stdout:prViewCount === 1
      ? '{"state":"OPEN","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}'
      : '{"state":"MERGED","mergedAt":"2026-09-10T23:00:00Z","mergeCommit":{"oid":"merge-sha"}}' };
  }
  if (command === 'gh' && args[0] === 'run' && args[1] === 'list') {
    return { stdout:'[{"databaseId":42,"status":"completed","conclusion":"success","url":"https://github.com/example/actions/42","headSha":"merge-sha"}]' };
  }
  return { stdout:'' };
};

const result = await releaseCloseDigest({
  repoRoot, stateDir, consumerResult:ackPath, packet:packetPath,
  now:'2026-09-10T16:20:00-07:00'
}, { run:fakeRun });
assert.equal(result.status, 'PUBLISHED');
assert.equal(result.publicSmokeDigestId, record.id);
const releasedRecords = JSON.parse(await fs.readFile(path.join(worktree, 'data-model/digests.json'), 'utf8')).records;
assert.deepEqual(new Set(releasedRecords.map((item) => item.id)), new Set([concurrentMorning.id, record.id]));
assert.equal(calls.filter((call) => call.command === 'gh' && call.args[1] === 'create').length, 1);
assert.equal(calls.filter((call) => call.command === 'gh' && call.args[1] === 'merge').length, 1);
const smoke = calls.find((call) => call.command === process.execPath && call.args[0] === 'scripts/public-smoke.mjs');
assert.equal(smoke.env.EXPECTED_DIGEST_ID, record.id);
assert.equal(smoke.env.PUBLIC_SMOKE_SKIP_PROXY, '1');

const retry = await releaseCloseDigest({
  repoRoot, stateDir, consumerResult:ackPath, packet:packetPath,
  now:'2026-09-10T16:20:00-07:00'
}, { run:fakeRun });
assert.equal(retry.outcome, 'NOOP');
assert.equal(calls.filter((call) => call.command === 'gh' && call.args[1] === 'create').length, 1);

console.log(JSON.stringify({
  status:'PASS', allowedDiff:true, deterministicMetadata:true, ackBinding:true,
  mockedGitHubBoundary:true, latestBaseReplay:true, concurrentDigestPreserved:true,
  exactPublicSmoke:true, duplicateSafeRecovery:true
}, null, 2));
