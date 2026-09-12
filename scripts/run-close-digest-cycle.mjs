import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { consumeDailyDigest, DAILY_EDITIONS } from './consume-close-digest.mjs';
import { releaseDailyDigest } from './release-close-digest.mjs';

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

export async function runDailyDigestCycle(options, dependencies = {}) {
  const consume = dependencies.consume || consumeDailyDigest;
  const release = dependencies.release || releaseDailyDigest;
  const edition = options.edition || 'close';
  if (!DAILY_EDITIONS[edition]) throw new Error(`unsupported daily edition: ${edition}`);
  const now = options.now ? new Date(options.now) : new Date();
  const marketDate = options.marketDate || dateInLosAngeles(now);
  const ackPath = path.join(path.resolve(options.stateDir), 'acks', `daily-${marketDate}-${edition}.json`);
  let consumer;

  if (options.mode === 'recovery' && await exists(ackPath)) {
    consumer = JSON.parse(await fs.readFile(ackPath, 'utf8'));
  } else {
    consumer = await consume({
      repoRoot:options.repoRoot,
      outbox:options.outbox,
      stateDir:options.stateDir,
      edition,
      marketDate,
      now,
      requirePresent:options.mode === 'recovery'
    });
  }

  if (consumer.status === 'NOOP') return { status:'NOOP', reason:consumer.reason, marketDate, edition };
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
  return { status:promoted.status, outcome:promoted.outcome, marketDate, edition, digestId:consumer.digestId, release:promoted };
}

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
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--max-age-minutes') options.maxAgeMinutes = Number(argv[++index]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!['primary', 'recovery'].includes(options.mode) || !options.repoRoot || !options.outbox || !options.stateDir) {
    throw new Error('usage: run-close-digest-cycle.mjs --edition morning|midday|close --mode primary|recovery --repo-root <path> --outbox <path> --state-dir <path>');
  }
  if (!DAILY_EDITIONS[options.edition]) throw new Error(`unsupported daily edition: ${options.edition}`);
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDailyDigestCycle(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ status:'FAILED_GATE', reason:error.message }, null, 2));
    process.exitCode = 1;
  });
}
