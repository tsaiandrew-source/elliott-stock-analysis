import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadCoverageRoster } from './coverage-roster.mjs';

const execFileAsync = promisify(execFile);
const WRITE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzwzSxjpp4maw3AUz6TaTjzHn7izQGzE03lsgOyBT01aTvjsEo0ZarZc8MlBDCyUuQo3A/exec';
const READ_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyfPXGRSZvSa8NOp6OguWNYgWEB1wHcr42E6e_uvleNb-ckI_Rei23PEWigi2Wx3CzQRg/exec';
const REQUIRED_PACKET_FIELDS = [
  'ticker', 'analysisDate', 'dataThrough', 'patternLabel', 'status', 'dataStatus',
  'primaryCandidate', 'secondaryCandidate', 'confirmation', 'invalidation',
  'thesis', 'fundamentalsNews', 'businessEvidence', 'dailyDigest', 'weeklyDigest',
  'wyckoffPhase', 'gexSummary', 'sourceEvidence', 'missingFields', 'recoveryTiming',
  'runId', 'laneStatus', 'priceSnapshot'
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safeName = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '-');
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

async function readKeychainToken() {
  const attempts = [
    ['find-generic-password', '-a', 'INGEST_TOKEN', '-s', 'elliott-ingest-token', '-w'],
    ['find-generic-password', '-a', process.env.USER || '', '-s', 'Elliott Iris v2 ingest', '-w']
  ];
  for (const args of attempts) {
    try {
      const { stdout } = await execFileAsync('/usr/bin/security', args, { maxBuffer: 1024 * 1024 });
      if (stdout.trim()) return { token: stdout.trim(), source: args[2] === 'INGEST_TOKEN' ? 'canonical-keychain' : 'compatibility-keychain' };
    } catch (_) { /* Try the compatibility item. */ }
  }
  throw new Error('macOS Keychain credential elliott-ingest-token / INGEST_TOKEN is unavailable.');
}

function validateBatch(batch, roster) {
  if (!isObject(batch) || batch.schemaVersion !== 'iris-analysis-contract-v2') throw new Error('packet schemaVersion must be iris-analysis-contract-v2');
  if (!String(batch.batchId || '').trim()) throw new Error('packet batchId is required');
  for (const lane of ['dailyPackets', 'weeklyPackets']) {
    if (!Array.isArray(batch[lane])) throw new Error(`${lane} must be an array`);
    const byTicker = new Set();
    for (const packet of batch[lane]) {
      if (!isObject(packet)) throw new Error(`${lane} contains a non-object packet`);
      for (const field of REQUIRED_PACKET_FIELDS) if (!(field in packet)) throw new Error(`${lane}/${packet.ticker || 'unknown'} is missing ${field}`);
      if (byTicker.has(packet.ticker)) throw new Error(`${lane} contains duplicate ${packet.ticker}`);
      byTicker.add(packet.ticker);
      if (!Array.isArray(packet.sourceEvidence) || !Array.isArray(packet.missingFields)) throw new Error(`${lane}/${packet.ticker} has invalid evidence or missingFields`);
      if (!isObject(packet.priceSnapshot) || !Array.isArray(packet.priceSnapshot.sourceEvidence)) throw new Error(`${lane}/${packet.ticker} has invalid priceSnapshot`);
    }
    const missing = roster.filter((ticker) => !byTicker.has(ticker));
    const extra = [...byTicker].filter((ticker) => !roster.includes(ticker));
    if (missing.length || extra.length) throw new Error(`${lane} roster mismatch; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }
  return batch;
}

async function postBatch(batch, token) {
  const response = await fetch(WRITE_ENDPOINT, {
    method: 'POST',
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'elliott-stock-analysis/private-ingest' },
    body: JSON.stringify({ action: 'append_v2_batch', token, batch })
  });
  const body = await response.text();
  let result = null;
  try { result = JSON.parse(body); } catch (_) { /* Read-side verification decides uncertain outcomes. */ }
  if (result?.status === 'error') throw new Error(`private bridge rejected batch: ${result.message || 'unknown error'}`);
  return { httpStatus: response.status, acknowledged: response.ok && result?.status !== 'error' };
}

const packetDate = (packet) => String(packet?.dataThrough || packet?.analysisDate || '');
const rowDate = (row) => String(row?.dataThrough || row?.DataThrough || row?.analysisDate || row?.AnalysisDate || '');
const rowType = (row) => String(row?.runType || row?.RunType || '').toLowerCase();
const tickerOf = (value) => String(value?.ticker || value?.Ticker || '').toUpperCase();

export function unresolvedVisiblePackets(batch, runs) {
  const expected = [
    ...batch.dailyPackets.map((packet) => ({ ...packet, lane: 'daily' })),
    ...batch.weeklyPackets.map((packet) => ({ ...packet, lane: 'weekly' }))
  ];
  return expected.filter((packet) => !runs.some((row) => {
    if (tickerOf(row) !== tickerOf(packet)) return false;
    const observedRunId = String(row.runId || row.RunID || '');
    if (observedRunId === packet.runId || observedRunId.startsWith(`${packet.runId}-`)) return true;
    const isCarryForward = packet.lane === 'weekly' && /-CARRY-/i.test(String(packet.runId || ''));
    return isCarryForward && rowType(row) === 'weekly' && rowDate(row) === packetDate(packet);
  })).map((packet) => ({
    ticker: packet.ticker,
    runId: packet.runId,
    lane: packet.lane,
    dataThrough: packetDate(packet)
  }));
}

async function verifyVisible(batch, attempts = 8) {
  const expectedCount = batch.dailyPackets.length + batch.weeklyPackets.length;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(READ_ENDPOINT);
      url.searchParams.set('format', 'json');
      url.searchParams.set('refresh', `${Date.now()}-${attempt}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: 'no-store' });
      const contract = response.ok ? await response.json() : {};
      const runs = Array.isArray(contract.analysisRuns) ? contract.analysisRuns : [];
      const missing = unresolvedVisiblePackets(batch, runs);
      last = { attempt, visible: expectedCount - missing.length, expected: expectedCount, missing };
      if (!missing.length) return last;
    } catch (error) {
      last = { attempt, error: error.message, visible: 0, expected: expectedCount };
    }
    if (attempt < attempts) await sleep(10_000);
  }
  throw new Error(`batch is not read-visible after verification: ${JSON.stringify(last)}`);
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

export async function ingestInbox({ inbox, stateDir, check = false }) {
  await fs.mkdir(inbox, { recursive: true });
  const files = (await fs.readdir(inbox)).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) return { status: 'NOOP', reason: 'no validated analysis packet in inbox', inbox };
  const roster = (await loadCoverageRoster()).order;
  const credential = check ? { token: '', source: 'not-read-in-check-mode' } : await readKeychainToken();
  const results = [];
  for (const name of files) {
    const packetPath = path.join(inbox, name);
    const text = await fs.readFile(packetPath, 'utf8');
    const batch = validateBatch(JSON.parse(text), roster);
    const packetHash = sha256(text);
    if (check) {
      results.push({ batchId: batch.batchId, packetHash, status: 'VALIDATED' });
      continue;
    }
    let post;
    try { post = await postBatch(batch, credential.token); }
    catch (error) { post = { acknowledged: false, uncertain: true, error: error.message }; }
    const visibility = await verifyVisible(batch);
    const processedDir = path.join(stateDir, 'processed');
    await fs.mkdir(processedDir, { recursive: true });
    const archivedPath = path.join(processedDir, `${safeName(batch.batchId)}-${packetHash.slice(0, 12)}.json`);
    await fs.rename(packetPath, archivedPath);
    results.push({ batchId: batch.batchId, packetHash, status: 'INGESTED_AND_READ_VISIBLE', post, visibility, archivedPath });
  }
  const record = { status: check ? 'VALIDATED' : 'COMPLETE', credentialSource: credential.source, completedAt: new Date().toISOString(), results };
  await atomicJson(path.join(stateDir, 'last-ingest.json'), record);
  return record;
}

function parseArgs(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--inbox') options.inbox = path.resolve(argv[++index]);
    else if (arg === '--state-dir') options.stateDir = path.resolve(argv[++index]);
    else if (arg === '--check') options.check = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.inbox || !options.stateDir) throw new Error('usage: ingest-private-analysis.mjs --inbox <dir> --state-dir <dir> [--check]');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ingestInbox(parseArgs(process.argv.slice(2))).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(JSON.stringify({ status: 'FAILED_GATE', reason: error.message }, null, 2));
    process.exitCode = 1;
  });
}
