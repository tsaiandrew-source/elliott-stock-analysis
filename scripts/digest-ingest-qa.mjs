import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { ingestPayload, runCli, SCHEMA_VERSION } from './ingest-digests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'scripts/fixtures/digests-complete-day.json'), 'utf8'));
const empty = { schemaVersion:SCHEMA_VERSION, generatedAt:null, records:[] };
let sequential = empty;
for (const record of fixture.records) sequential = ingestPayload(sequential, record, record.publishedAt).dataset;
assert.deepEqual(sequential.records.map((record) => record.edition), ['close', 'midday', 'morning']);
const first = ingestPayload(empty, fixture, '2026-01-15T16:15:00-08:00');
assert.deepEqual(first.stats, { added:3, updated:0, unchanged:0 });
assert.deepEqual(first.dataset.records.map((record) => record.edition), ['close', 'midday', 'morning']);

const repeated = ingestPayload(first.dataset, fixture, '2026-01-15T16:20:00-08:00');
assert.deepEqual(repeated.stats, { added:0, updated:0, unchanged:3 });
assert.equal(repeated.dataset.generatedAt, first.dataset.generatedAt);

const correction = { ...fixture.records[1], updatedAt:'2026-01-15T12:00:00-08:00', summary:'Corrected fixture.' };
const corrected = ingestPayload(first.dataset, correction, '2026-01-15T12:01:00-08:00');
assert.deepEqual(corrected.stats, { added:0, updated:1, unchanged:0 });
assert.equal(corrected.dataset.records.find((record) => record.id === correction.id).summary, 'Corrected fixture.');
assert.throws(() => ingestPayload(corrected.dataset, fixture.records[1]), /stale/);
assert.throws(() => ingestPayload(first.dataset, { ...fixture.records[1], id:'different-id' }), /already owned/);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'elliott-digest-ingest-'));
const store = path.join(temporary, 'digests.json');
const browserOutput = path.join(temporary, 'digest-data.js');
await fs.writeFile(store, `${JSON.stringify(empty, null, 2)}\n`, 'utf8');
const cli = await runCli(['--input', path.join(root, 'scripts/fixtures/digests-complete-day.json'), '--store', store, '--browser-output', browserOutput], root);
assert.deepEqual(cli, { added:3, updated:0, unchanged:0, checked:false, records:3 });
const browserSource = await fs.readFile(browserOutput, 'utf8');
const context = { window:{} };
vm.createContext(context);
vm.runInContext(browserSource, context);
assert.equal(context.window.ELLIOTT_CROSS_MARKET_DIGESTS.records.length, 3);

await assert.rejects(() => runCli(['--input', path.join(root, 'scripts/fixtures/digest-invalid.json'), '--store', store, '--check'], root), /edition must be morning/);
console.log(JSON.stringify({ status:'PASS', sequentialCompleteDay:true, batchCompleteDay:true, idempotent:true, correctionGuard:true, atomicOutputs:true }, null, 2));
