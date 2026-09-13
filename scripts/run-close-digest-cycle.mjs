import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { consumeDigest, DAILY_EDITIONS, DIGEST_EDITIONS, weekStartInZone } from './consume-close-digest.mjs';
import { releaseDigest } from './release-close-digest.mjs';

const TIMEZONE = 'America/Los_Angeles';
export const dateInLosAngeles = (value = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function runDigestCycle(options, dependencies = {}) {
  const consume = dependencies.consume || consumeDigest;
  const release = dependencies.release || releaseDigest;
  const edition = options.edition || 'close';
  const config = DIGEST_EDITIONS[edition];
  if (!config) throw new Error(`unsupported digest edition: ${edition}`);
  const now = options.now ? new Date(options.now) : new Date();
  const slotDate = options.slotDate || (config.cadence === 'weekly'
    ? options.weekStart || weekStartInZone(now)
    : options.marketDate || dateInLosAngeles(now));
  const digestId = config.cadence === 'weekly' ? `weekly-${slotDate}` : `daily-${slotDate}-${edition}`;
  const identity = { cadence:config.cadence, slotDate, [config.dateField]:slotDate };
  const ackPath = path.join(path.resolve(options.stateDir), 'acks', `${digestId}.json`);
  let consumer;

  if (options.mode === 'recovery' && await exists(ackPath)) {
    consumer = JSON.parse(await fs.readFile(ackPath, 'utf8'));
  } else {
    consumer = await consume({
      repoRoot:options.repoRoot,
      outbox:options.outbox,
      stateDir:options.stateDir,
      edition,
      ...identity,
      now,
      requirePresent:options.mode === 'recovery'
    });
  }

  if (consumer.status === 'NOOP') return { status:'NOOP', reason:consumer.reason, ...identity, edition };
  if (!['INGESTED', 'UNCHANGED'].includes(consumer.status)) throw new Error(`consumer did not succeed: ${consumer.status}`);
  if (!await exists(ackPath)) throw new Error('successful consumer acknowledgement is missing');
  const promoted = await release({
    repoRoot:options.repoRoot,
    stateDir:options.stateDir,
    consumerResult:ackPath,
    publicBaseUrl:options.publicBaseUrl,
    now,
    maxAgeMinutes:options.maxAgeMinutes
  });
  return { status:promoted.status, outcome:promoted.outcome, ...identity, edition, digestId:consumer.digestId, release:promoted };
}

export const runDailyDigestCycle = (options, dependencies = {}) => {
  const edition = options.edition || 'close';
  if (!DAILY_EDITIONS[edition]) throw new Error(`unsupported daily edition: ${edition}`);
  return runDigestCycle({ ...options, edition }, dependencies);
};
export const runWeeklyDigestCycle = (options, dependencies = {}) => runDigestCycle({ ...options, edition:'weekly' }, dependencies);
export const runCloseDigestCycle = (options, dependencies = {}) => runDailyDigestCycle({ ...options, edition:'close' }, dependencies);

function parseArgs(argv) {
  const options = { edition:'close', maxAgeMinutes:180 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--edition') options.edition = argv[++index];
    else if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--outbox') options.outbox = argv[++index];
    else if (arg === '--state-dir') options.stateDir = argv[++index];
    else if (arg === '--public-base-url') options.publicBaseUrl = argv[++index];
    else if (arg === '--market-date') options.marketDate = argv[++index];
    else if (arg === '--week-start') options.weekStart = argv[++index];
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--max-age-minutes') options.maxAgeMinutes = Number(argv[++index]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!['primary', 'recovery'].includes(options.mode) || !options.repoRoot || !options.outbox || !options.stateDir) {
    throw new Error('usage: run-close-digest-cycle.mjs --edition morning|midday|close|weekly --mode primary|recovery --repo-root <path> --outbox <path> --state-dir <path>');
  }
  if (!DIGEST_EDITIONS[options.edition]) throw new Error(`unsupported digest edition: ${options.edition}`);
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDigestCycle(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ status:'FAILED_GATE', reason:error.message }, null, 2));
    process.exitCode = 1;
  });
}
