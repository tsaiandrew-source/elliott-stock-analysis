import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ingestPayload, renderBrowserDataset, validateDataset, validateRecord } from './ingest-digests.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_MAX_AGE_MINUTES = 180;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const timestamp = (value, label) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
};
const localParts = (value, timeZone = DEFAULT_TIMEZONE) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
);
const localDate = (value, timeZone = DEFAULT_TIMEZONE) => {
  const parts = localParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const dateInZone = (value = new Date(), timeZone = DEFAULT_TIMEZONE) => localDate(value, timeZone);
const atomicWrite = async (target, contents) => {
  await fs.mkdir(path.dirname(target), { recursive:true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, contents, 'utf8');
  await fs.rename(temporary, target);
};
const appendJsonLine = async (target, value) => {
  await fs.mkdir(path.dirname(target), { recursive:true });
  await fs.appendFile(target, `${JSON.stringify(value)}\n`, 'utf8');
};

export function validateClosePacket(payload, { marketDate, now = new Date(), maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDate || '')) throw new Error('marketDate is required');
  const records = payload?.schemaVersion ? validateDataset(payload, 'packet').records : [validateRecord(payload, 'packet')];
  if (records.length !== 1) throw new Error('packet must contain exactly one record');
  const record = records[0];
  if (record.cadence !== 'daily' || record.edition !== 'close') throw new Error('packet must be the daily close edition');
  if (record.marketDate !== marketDate) throw new Error(`packet marketDate must be ${marketDate}`);
  if (record.id !== `daily-${marketDate}-close`) throw new Error(`packet id must be daily-${marketDate}-close`);
  if (record.timezone !== DEFAULT_TIMEZONE) throw new Error(`packet timezone must be ${DEFAULT_TIMEZONE}`);
  if (record.status !== 'complete') throw new Error('packet status must be complete');
  if (!Number.isInteger(record.revision) || record.revision < 1) throw new Error('packet revision must be a positive integer');
  if (!Array.isArray(record.sources) || !record.sources.length) throw new Error('packet sources must be non-empty');
  const publishedAt = timestamp(record.publishedAt, 'packet.publishedAt');
  const sourceCutoffAt = timestamp(record.sourceCutoffAt, 'packet.sourceCutoffAt');
  const retrievedAt = timestamp(record.retrievedAt, 'packet.retrievedAt');
  const nowAt = timestamp(now, 'now');
  const publishedLocal = localParts(record.publishedAt, record.timezone);
  if (localDate(record.publishedAt, record.timezone) !== marketDate || Number(publishedLocal.hour) < 16) {
    throw new Error('packet.publishedAt must be on the market date at or after 16:00 PT');
  }
  if (localDate(record.sourceCutoffAt, record.timezone) !== marketDate) throw new Error('packet.sourceCutoffAt must match the market date');
  if (sourceCutoffAt > retrievedAt) throw new Error('packet retrieval cannot precede its source cutoff');
  if (sourceCutoffAt > publishedAt + 60 * 60 * 1000) throw new Error('packet source cutoff is implausibly later than publication');
  const freshest = Math.max(publishedAt, retrievedAt);
  if (nowAt < freshest) throw new Error('packet timestamps cannot be in the future');
  if (nowAt - freshest > maxAgeMinutes * 60 * 1000) throw new Error(`packet is older than ${maxAgeMinutes} minutes`);
  return record;
}

const parsePayload = (text) => JSON.parse(text);
const packetRecords = (payload) => payload?.schemaVersion ? payload.records : [payload];
const looksLikeSlot = (payload, marketDate) => packetRecords(payload).some(
  (record) => record?.cadence === 'daily' && record?.edition === 'close' && record?.marketDate === marketDate
);

export async function discoverClosePacket(outbox, marketDate) {
  let names = [];
  try { names = await fs.readdir(outbox); } catch (error) {
    if (error.code === 'ENOENT') return { matches:[], malformed:[] };
    throw error;
  }
  const matches = [];
  const malformed = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const file = path.join(outbox, name);
    let text;
    let payload;
    try {
      text = await fs.readFile(file, 'utf8');
      payload = parsePayload(text);
    } catch (error) {
      malformed.push({ file, error:error.message });
      continue;
    }
    if (looksLikeSlot(payload, marketDate)) matches.push({ file, text, payload, hash:sha256(text) });
  }
  return { matches, malformed };
}

async function runQa(repoRoot) {
  const scripts = ['scripts/digest-ingest-qa.mjs', 'scripts/static-qa.mjs', 'scripts/pwa-qa.mjs'];
  const results = [];
  for (const script of scripts) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script], { cwd:repoRoot, maxBuffer:8 * 1024 * 1024 });
    results.push({ script, output:(stdout || stderr).trim() });
  }
  return results;
}

export async function consumeCloseDigest(options) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const outbox = path.resolve(options.outbox);
  const stateDir = path.resolve(options.stateDir);
  const now = options.now ? new Date(options.now) : new Date();
  const marketDate = options.marketDate || dateInZone(now);
  const runId = `close-${marketDate}-${now.toISOString().replace(/[:.]/g, '-')}`;
  const baseResult = { runId, marketDate, edition:'close', checkedAt:now.toISOString() };
  const lockPath = path.join(stateDir, 'locks', `${marketDate}-close.lock`);
  let lock;
  let candidate;
  if (!options.dryRun) {
    await fs.mkdir(path.dirname(lockPath), { recursive:true });
    try { lock = await fs.open(lockPath, 'wx'); } catch (error) {
      if (error.code === 'EEXIST') return { ...baseResult, status:'NOOP', reason:'consumer_locked' };
      throw error;
    }
  }
  try {
    const discovered = await discoverClosePacket(outbox, marketDate);
    if (discovered.matches.length === 0) {
      const result = { ...baseResult, status:options.requirePresent ? 'FAILED_GATE' : 'NOOP', reason:'packet_missing', malformed:discovered.malformed };
      if (!options.dryRun) await appendJsonLine(path.join(stateDir, 'runs.ndjson'), result);
      if (options.requirePresent) throw Object.assign(new Error('required close packet is missing'), { result });
      return result;
    }
    if (discovered.matches.length > 1) throw new Error('multiple packets claim the same close slot');
    candidate = discovered.matches[0];
    const record = validateClosePacket(candidate.payload, { marketDate, now, maxAgeMinutes:options.maxAgeMinutes });
    const storePath = path.join(repoRoot, 'data-model/digests.json');
    const browserPath = path.join(repoRoot, 'data-model/digest-data.js');
    const existingText = await fs.readFile(storePath, 'utf8');
    const browserBefore = await fs.readFile(browserPath, 'utf8');
    const existing = JSON.parse(existingText);
    const prepared = ingestPayload(existing, candidate.payload, now.toISOString());
    if (options.dryRun) return { ...baseResult, status:'READY', digestId:record.id, packetSha256:candidate.hash, stats:prepared.stats };

    const processingDir = path.join(stateDir, 'processing');
    await fs.mkdir(processingDir, { recursive:true });
    const claimedPath = path.join(processingDir, `${runId}-${path.basename(candidate.file)}`);
    await fs.rename(candidate.file, claimedPath);
    try {
      if (prepared.stats.added || prepared.stats.updated) {
        await atomicWrite(storePath, `${JSON.stringify(prepared.dataset, null, 2)}\n`);
        await atomicWrite(browserPath, renderBrowserDataset(prepared.dataset));
      }
      const qa = options.qa === false ? [] : await runQa(repoRoot);
      const archiveDir = path.join(stateDir, 'archive', marketDate);
      await fs.mkdir(archiveDir, { recursive:true });
      const archivedPath = path.join(archiveDir, `${candidate.hash}-${path.basename(candidate.file)}`);
      await fs.rename(claimedPath, archivedPath);
      const result = {
        ...baseResult,
        status:prepared.stats.added || prepared.stats.updated ? 'INGESTED' : 'UNCHANGED',
        digestId:record.id,
        revision:record.revision,
        packetSha256:candidate.hash,
        storeSha256:sha256(await fs.readFile(storePath)),
        browserBundleSha256:sha256(await fs.readFile(browserPath)),
        stats:prepared.stats,
        qa:qa.map(({ script }) => ({ script, status:'PASS' })),
        archivedPath
      };
      await atomicWrite(path.join(stateDir, 'acks', `${record.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
      await appendJsonLine(path.join(stateDir, 'runs.ndjson'), result);
      return result;
    } catch (error) {
      await atomicWrite(storePath, existingText);
      await atomicWrite(browserPath, browserBefore);
      const quarantineDir = path.join(stateDir, 'quarantine');
      await fs.mkdir(quarantineDir, { recursive:true });
      const quarantinedPath = path.join(quarantineDir, `${runId}-${path.basename(candidate.file)}`);
      try { await fs.rename(claimedPath, quarantinedPath); } catch (_) {}
      const result = { ...baseResult, status:'FAILED_GATE', reason:error.message, digestId:record.id, packetSha256:candidate.hash, quarantinedPath };
      await appendJsonLine(path.join(stateDir, 'runs.ndjson'), result);
      throw Object.assign(error, { result });
    }
  } catch (error) {
    if (!options.dryRun && !error.result) {
      let quarantinedPath = null;
      if (candidate?.file) {
        const quarantineDir = path.join(stateDir, 'quarantine');
        await fs.mkdir(quarantineDir, { recursive:true });
        quarantinedPath = path.join(quarantineDir, `${runId}-${path.basename(candidate.file)}`);
        try { await fs.rename(candidate.file, quarantinedPath); } catch (_) { quarantinedPath = null; }
      }
      const result = { ...baseResult, status:'FAILED_GATE', reason:error.message, quarantinedPath };
      await appendJsonLine(path.join(stateDir, 'runs.ndjson'), result);
      throw Object.assign(error, { result });
    }
    throw error;
  } finally {
    if (lock) {
      await lock.close();
      await fs.unlink(lockPath).catch(() => {});
    }
  }
}

function parseArgs(argv) {
  const options = { maxAgeMinutes:DEFAULT_MAX_AGE_MINUTES, dryRun:false, requirePresent:false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--outbox') options.outbox = argv[++index];
    else if (arg === '--state-dir') options.stateDir = argv[++index];
    else if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--market-date') options.marketDate = argv[++index];
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--max-age-minutes') options.maxAgeMinutes = Number(argv[++index]);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--require-present') options.requirePresent = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.outbox || !options.stateDir) throw new Error('usage: consume-close-digest.mjs --outbox <dir> --state-dir <dir> [--market-date YYYY-MM-DD] [--dry-run] [--require-present]');
  if (!Number.isFinite(options.maxAgeMinutes) || options.maxAgeMinutes <= 0) throw new Error('--max-age-minutes must be positive');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  consumeCloseDigest(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify(error.result || { status:'FAILED_GATE', reason:error.message }, null, 2));
    process.exitCode = 1;
  });
}
