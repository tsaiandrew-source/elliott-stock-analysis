import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dueDigestRuns, runAutonomousCrossMarketDigest } from './run-autonomous-cross-market-digest.mjs';

const at = (local) => new Date(`${local}-07:00`);
const routes = (local) => dueDigestRuns(at(local));

assert.deepEqual(routes('2026-09-14T05:49:00'), []);
assert.deepEqual(routes('2026-09-14T05:50:00'), [{ edition:'morning', mode:'primary' }]);
assert.deepEqual(routes('2026-09-14T06:20:00'), [{ edition:'morning', mode:'recovery' }]);
assert.deepEqual(routes('2026-09-14T11:50:00'), [
  { edition:'morning', mode:'recovery' },
  { edition:'midday', mode:'primary' }
]);
assert.deepEqual(routes('2026-09-14T12:20:00'), [
  { edition:'morning', mode:'recovery' },
  { edition:'midday', mode:'recovery' }
]);
assert.deepEqual(routes('2026-09-14T16:20:00'), [
  { edition:'morning', mode:'recovery' },
  { edition:'midday', mode:'recovery' },
  { edition:'close', mode:'primary' }
]);
assert.deepEqual(routes('2026-09-14T16:50:00'), [
  { edition:'morning', mode:'recovery' },
  { edition:'midday', mode:'recovery' },
  { edition:'close', mode:'recovery' }
]);
assert.deepEqual(routes('2026-09-19T15:59:00'), []);
assert.deepEqual(routes('2026-09-19T16:00:00'), [{ edition:'close', mode:'primary' }]);
assert.deepEqual(routes('2026-09-19T16:30:00'), [{ edition:'close', mode:'recovery' }]);
assert.deepEqual(routes('2026-09-20T15:59:00'), []);
assert.deepEqual(routes('2026-09-20T16:00:00'), [{ edition:'close', mode:'primary' }]);
assert.deepEqual(routes('2026-09-20T16:30:00'), [{ edition:'close', mode:'recovery' }]);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-autonomous-digest-qa-'));
const repoRoot = path.join(temporary, 'repo');
const stateDir = path.join(temporary, 'state');
const outbox = path.join(temporary, 'outbox');
const node = path.join(temporary, 'node');
const wrapper = path.join(temporary, 'with-personal-github');
await fs.mkdir(path.join(repoRoot, 'scripts'), { recursive:true });
await fs.mkdir(outbox, { recursive:true });
await fs.writeFile(node, '#!/bin/sh\n');
await fs.writeFile(wrapper, '#!/bin/sh\n');
await fs.writeFile(path.join(repoRoot, 'scripts', 'run-close-digest-cycle.mjs'), '// fixture\n');
await fs.chmod(node, 0o700);
await fs.chmod(wrapper, 0o700);
const calls = [];
const run = async (command, args) => {
  calls.push({ command, args:[...args] });
  const edition = args[args.indexOf('--edition') + 1];
  if (edition === 'morning') {
    const error = new Error('fixture failure');
    error.stderr = JSON.stringify({ status:'FAILED_GATE', reason:'morning fixture failed' });
    throw error;
  }
  return { stdout:JSON.stringify({ status:'PUBLISHED', digestId:`fixture-${edition}` }), stderr:'' };
};
let failureReceipt;
await assert.rejects(
  runAutonomousCrossMarketDigest({
    now:at('2026-09-14T16:20:00'),
    env:{
      ELLIOTT_APP_REPO:repoRoot,
      ELLIOTT_NODE:node,
      ELLIOTT_DIGEST_OUTBOX:outbox,
      ELLIOTT_DIGEST_STATE_DIR:stateDir,
      ELLIOTT_GITHUB_WRAPPER:wrapper
    },
    run
  }),
  (error) => {
    failureReceipt = error.receipt;
    return /scheduled digest release route/.test(error.message);
  }
);
assert.equal(calls.length, 3);
assert.deepEqual(failureReceipt.results.map((item) => item.edition), ['morning', 'midday', 'close']);
assert.equal(failureReceipt.results[0].reason, 'morning fixture failed');
assert.equal(failureReceipt.results[2].status, 'PUBLISHED');

console.log(JSON.stringify({
  status:'PASS',
  timezone:'America/Los_Angeles',
  weekdayCatchup:true,
  weekendEndOfDayAt1600:true,
  laterEditionsContinueAfterFailure:true
}, null, 2));
