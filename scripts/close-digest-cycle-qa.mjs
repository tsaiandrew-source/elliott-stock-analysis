import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCloseDigestCycle } from './run-close-digest-cycle.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-cycle-qa-'));
const stateDir = path.join(temporary, 'state');
const options = {
  mode:'primary', repoRoot:path.join(temporary, 'repo'), outbox:path.join(temporary, 'outbox'),
  stateDir, marketDate:'2026-09-10', now:'2026-09-10T16:20:00-07:00'
};

let releaseCalls = 0;
const quiet = await runCloseDigestCycle(options, {
  consume:async () => ({ status:'NOOP', reason:'packet_missing' }),
  release:async () => { releaseCalls += 1; }
});
assert.equal(quiet.status, 'NOOP');
assert.equal(releaseCalls, 0);

const ackPath = path.join(stateDir, 'acks', 'daily-2026-09-10-close.json');
await fs.mkdir(path.dirname(ackPath), { recursive:true });
const ack = { status:'INGESTED', digestId:'daily-2026-09-10-close' };
await fs.writeFile(ackPath, JSON.stringify(ack));
let consumeCalls = 0;
const recovered = await runCloseDigestCycle({ ...options, mode:'recovery', now:'2026-09-10T16:50:00-07:00' }, {
  consume:async () => { consumeCalls += 1; },
  release:async (releaseOptions) => {
    releaseCalls += 1;
    assert.equal(releaseOptions.consumerResult, ackPath);
    return { status:'PUBLISHED', outcome:'NOOP' };
  }
});
assert.equal(consumeCalls, 0);
assert.equal(recovered.status, 'PUBLISHED');
assert.equal(recovered.outcome, 'NOOP');

const publishedAck = {
  ...ack,
  revision:1,
  packetSha256:'published-packet-hash'
};
await fs.writeFile(ackPath, JSON.stringify(publishedAck));
const releaseStatePath = path.join(stateDir, 'releases', 'daily-2026-09-10-close-r1.json');
await fs.mkdir(path.dirname(releaseStatePath), { recursive:true });
await fs.writeFile(releaseStatePath, JSON.stringify({
  status:'PUBLISHED',
  digestId:publishedAck.digestId,
  revision:publishedAck.revision,
  packetSha256:publishedAck.packetSha256,
  publicSmokeDigestId:publishedAck.digestId
}));
const callsBeforePublishedReconcile = releaseCalls;
const alreadyPublished = await runCloseDigestCycle({ ...options, mode:'recovery', now:'2026-09-10T23:50:00-07:00' }, {
  consume:async () => { throw new Error('published recovery must not re-ingest'); },
  release:async () => { throw new Error('published recovery must not revalidate a stale packet'); }
});
assert.equal(alreadyPublished.status, 'PUBLISHED');
assert.equal(alreadyPublished.outcome, 'NOOP');
assert.equal(releaseCalls, callsBeforePublishedReconcile);
await fs.unlink(releaseStatePath);

await fs.unlink(ackPath);
let requirePresent = false;
await runCloseDigestCycle({ ...options, mode:'recovery', now:'2026-09-10T16:50:00-07:00' }, {
  consume:async (consumerOptions) => {
    requirePresent = consumerOptions.requirePresent;
    await fs.mkdir(path.dirname(ackPath), { recursive:true });
    await fs.writeFile(ackPath, JSON.stringify(ack));
    return ack;
  },
  release:async () => ({ status:'PUBLISHED' })
});
assert.equal(requirePresent, true);

console.log(JSON.stringify({
  status:'PASS', primaryMissingQuiet:true, recoveryReconcilesAck:true,
  recoveryAvoidsDuplicateIngest:true, publishedReceiptBypassesStaleRevalidation:true,
  recoveryRequiresPacketWhenUnacknowledged:true
}, null, 2));
