import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const TIMEZONE = 'America/Los_Angeles';
const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const PUBLIC_BASE_URL = 'https://tsaiandrew-source.github.io/elliott-stock-analysis';

const localClock = (value = new Date()) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('now is invalid');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:TIMEZONE,
    weekday:'short',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { weekday:parts.weekday, minuteOfDay:Number(parts.hour) * 60 + Number(parts.minute) };
};

const modeAt = (minuteOfDay, primaryAt, recoveryAt) => {
  if (minuteOfDay < primaryAt) return null;
  return minuteOfDay < recoveryAt ? 'primary' : 'recovery';
};

export function dueDigestRuns(value = new Date()) {
  const { weekday, minuteOfDay } = localClock(value);
  if (weekday === 'Sat' || weekday === 'Sun') {
    const mode = modeAt(minuteOfDay, 16 * 60, 16 * 60 + 30);
    return mode ? [{ edition:'close', mode }] : [];
  }
  if (!WEEKDAYS.has(weekday)) return [];
  const routes = [];
  const morning = modeAt(minuteOfDay, 5 * 60 + 50, 6 * 60 + 20);
  const midday = modeAt(minuteOfDay, 11 * 60 + 50, 12 * 60 + 20);
  const close = modeAt(minuteOfDay, 16 * 60 + 20, 16 * 60 + 50);
  if (morning) routes.push({ edition:'morning', mode:morning });
  if (midday) routes.push({ edition:'midday', mode:midday });
  if (close) routes.push({ edition:'close', mode:close });
  return routes;
}

const defaults = (env = process.env) => ({
  repoRoot:env.ELLIOTT_APP_REPO || '/Users/andrtsai/src/elliott-stock-analysis',
  node:env.ELLIOTT_NODE || '/Users/andrtsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
  outbox:env.ELLIOTT_DIGEST_OUTBOX || '/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/outbox',
  stateDir:env.ELLIOTT_DIGEST_STATE_DIR || '/Users/andrtsai/Documents/ChatGPT/P F Social/handoffs/elliott-cross-market/consumer-state',
  githubWrapper:env.ELLIOTT_GITHUB_WRAPPER || '/Users/andrtsai/Library/Application Support/Elliott+/credentials/with-tsaiandrew-source',
  notifyFailures:env.ELLIOTT_DIGEST_NOTIFY_FAILURES === '1'
});

const commandRunner = async (command, args, options = {}) => execFileAsync(command, args, {
  cwd:options.cwd,
  env:{ ...process.env, ...options.env },
  maxBuffer:8 * 1024 * 1024
});

const appendRun = async (stateDir, value) => {
  await fs.mkdir(stateDir, { recursive:true });
  await fs.appendFile(path.join(stateDir, 'autonomous-runs.ndjson'), `${JSON.stringify(value)}\n`, 'utf8');
};

const notifyFailure = async (run = commandRunner) => {
  try {
    await run('/usr/bin/osascript', [
      '-e',
      'display notification "One or more scheduled digest releases failed. Review the Elliott digest log." with title "Elliott digest release"'
    ]);
  } catch (_) {}
};

export async function runAutonomousCrossMarketDigest({ now = new Date(), env = process.env, run = commandRunner } = {}) {
  const at = new Date(now);
  if (!Number.isFinite(at.getTime())) throw new Error('now is invalid');
  const config = defaults(env);
  const routes = dueDigestRuns(at);
  const runId = `digest-autonomous-${at.toISOString().replace(/[:.]/g, '-')}`;
  if (!routes.length) return { status:'NOOP', reason:'outside_release_window', runId, timezone:TIMEZONE };
  await fs.access(config.githubWrapper, constants.X_OK);
  await fs.access(config.node, constants.X_OK);
  const cycleScript = path.join(config.repoRoot, 'scripts', 'run-close-digest-cycle.mjs');
  await fs.access(cycleScript, constants.R_OK);
  const results = [];
  for (const route of routes) {
    const args = [
      config.node,
      cycleScript,
      '--edition', route.edition,
      '--mode', route.mode,
      '--repo-root', config.repoRoot,
      '--outbox', config.outbox,
      '--state-dir', config.stateDir,
      '--public-base-url', PUBLIC_BASE_URL,
      '--now', at.toISOString()
    ];
    try {
      const executed = await run(config.githubWrapper, args, { cwd:config.repoRoot });
      const output = String(executed.stdout || '').trim();
      const payload = output ? JSON.parse(output) : { status:'UNKNOWN' };
      results.push({ ...route, status:payload.status, outcome:payload.outcome || null, digestId:payload.digestId || null });
    } catch (error) {
      const stderr = String(error.stderr || '').trim();
      const stdout = String(error.stdout || '').trim();
      let reason = error.message;
      for (const candidate of [stderr, stdout]) {
        try { reason = JSON.parse(candidate).reason || reason; break; } catch (_) {}
      }
      results.push({ ...route, status:'FAILED_GATE', reason });
    }
  }
  const failures = results.filter((item) => item.status === 'FAILED_GATE');
  const receipt = {
    runId,
    checkedAt:at.toISOString(),
    timezone:TIMEZONE,
    status:failures.length ? 'FAILED_GATE' : 'COMPLETE',
    results
  };
  await appendRun(config.stateDir, receipt);
  if (failures.length && config.notifyFailures) await notifyFailure(run);
  if (failures.length) throw Object.assign(new Error(`${failures.length} scheduled digest release route(s) failed`), { receipt });
  return receipt;
}

function parseArgs(argv) {
  const options = { dryRun:false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--now') options.now = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const now = options.now ? new Date(options.now) : new Date();
  const task = options.dryRun
    ? Promise.resolve({ status:'DRY_RUN', timezone:TIMEZONE, routes:dueDigestRuns(now) })
    : runAutonomousCrossMarketDigest({ now });
  task.then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ status:'FAILED_GATE', reason:error.message, receipt:error.receipt || null }, null, 2));
    process.exitCode = 1;
  });
}
