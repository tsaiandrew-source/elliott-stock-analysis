import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateClosePacket } from './consume-close-digest.mjs';

const execFileAsync = promisify(execFile);
const DATA_FILES = ['data-model/digests.json', 'data-model/digest-data.js'];
const REQUIRED_QA = ['scripts/digest-ingest-qa.mjs', 'scripts/static-qa.mjs', 'scripts/pwa-qa.mjs'];
const DEFAULT_BASE = 'main';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_PUBLIC_BASE = 'https://tsaiandrew-source.github.io/elliott-stock-analysis';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value, label) => {
  try { return JSON.parse(value); } catch { throw new Error(`${label} did not return valid JSON`); }
};
const clean = (value) => String(value ?? '').trim();
const safeKey = (value) => clean(value).replace(/[^a-zA-Z0-9._-]/g, '-');
const output = (result) => typeof result === 'string' ? result : String(result?.stdout ?? '');

export const releaseMetadata = (record, packetSha256) => ({
  key:`${record.id}-r${record.revision}`,
  branch:`codex/digest-${record.marketDate}-close-r${record.revision}`,
  title:`Publish close digest ${record.marketDate} (r${record.revision})`,
  body:[
    'Summary',
    '',
    `Publish the validated ${record.marketDate} close digest produced by the elliott-cross-market-digest-v1 handoff.`,
    '',
    'Validation',
    '',
    '- close packet identity, revision, timestamps, source URLs, and SHA-256 verified',
    '- consumer acknowledgement output hashes verified',
    '- digest ingestion QA: PASS',
    '- static QA: PASS',
    '- PWA QA: PASS',
    '',
    'Release identity',
    '',
    `- Digest: ${record.id}`,
    `- Revision: ${record.revision}`,
    `- Packet SHA-256: ${packetSha256}`,
    '',
    'Scope',
    '',
    '- data-model/digests.json',
    '- data-model/digest-data.js',
    '- No manual service-worker cache-version bump.',
    '- No producer outbox, Iris v2/AppSheet, social workflow, GitHub settings, or secrets changes.'
  ].join('\n')
});

export function assertAllowedChanges(statusText, allowed = DATA_FILES) {
  const files = String(statusText ?? '').replace(/\s+$/, '').split('\n').filter(Boolean).map((line) => line.slice(3).trim());
  const unexpected = files.filter((file) => !allowed.includes(file));
  if (unexpected.length) throw new Error(`unexpected repository changes: ${unexpected.join(', ')}`);
  return files;
}

export function validateConsumerAck(ack, record, packetHash) {
  if (!['INGESTED', 'UNCHANGED'].includes(ack?.status)) throw new Error('consumer result must be INGESTED or UNCHANGED');
  if (ack.digestId !== record.id || ack.marketDate !== record.marketDate || ack.edition !== 'close') throw new Error('consumer result identity does not match packet');
  if (ack.revision !== record.revision) throw new Error('consumer result revision does not match packet');
  if (ack.packetSha256 !== packetHash) throw new Error('consumer result packet hash does not match packet');
  if (!clean(ack.storeSha256) || !clean(ack.browserBundleSha256)) throw new Error('consumer result output hashes are required');
  const passed = new Set((ack.qa || []).filter((item) => item.status === 'PASS').map((item) => item.script));
  const missing = REQUIRED_QA.filter((script) => !passed.has(script));
  if (missing.length) throw new Error(`consumer QA acknowledgement is incomplete: ${missing.join(', ')}`);
  return ack;
}

const atomicWrite = async (target, value) => {
  await fs.mkdir(path.dirname(target), { recursive:true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
};

export const commandRunner = async (command, args, options = {}) => {
  const result = await execFileAsync(command, args, {
    cwd:options.cwd,
    env:{ ...process.env, ...options.env },
    maxBuffer:8 * 1024 * 1024
  });
  return { stdout:result.stdout, stderr:result.stderr };
};

async function readReleaseInputs(options, run) {
  const repoRoot = path.resolve(options.repoRoot);
  const stateDir = path.resolve(options.stateDir);
  const ackPath = path.resolve(options.consumerResult);
  const ack = json(await fs.readFile(ackPath, 'utf8'), 'consumer result');
  const packetSource = clean(options.packet || ack.archivedPath);
  if (!packetSource) throw new Error('packet path is required');
  const packetPath = path.resolve(packetSource);
  const packetText = await fs.readFile(packetPath, 'utf8');
  const packet = json(packetText, 'close packet');
  const record = validateClosePacket(packet, {
    marketDate:ack.marketDate,
    now:options.now ? new Date(options.now) : new Date(),
    maxAgeMinutes:options.maxAgeMinutes
  });
  const packetHash = sha256(packetText);
  validateConsumerAck(ack, record, packetHash);
  const storeHash = sha256(await fs.readFile(path.join(repoRoot, DATA_FILES[0])));
  const browserHash = sha256(await fs.readFile(path.join(repoRoot, DATA_FILES[1])));
  if (storeHash !== ack.storeSha256 || browserHash !== ack.browserBundleSha256) throw new Error('consumer output hashes no longer match repository data');
  const status = output(await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd:repoRoot }));
  const changed = assertAllowedChanges(status);
  const metadata = releaseMetadata(record, packetHash);
  const statePath = path.join(stateDir, 'releases', `${safeKey(metadata.key)}.json`);
  return { repoRoot, stateDir, ackPath, packetPath, packetHash, record, ack, metadata, statePath, changed };
}

async function loadState(statePath) {
  try { return json(await fs.readFile(statePath, 'utf8'), 'release state'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function saveState(context, state, patch) {
  const next = { ...state, ...patch, updatedAt:new Date().toISOString() };
  await atomicWrite(context.statePath, next);
  return next;
}

function assertStateIdentity(state, context) {
  if (!state) return;
  if (state.digestId !== context.record.id || state.revision !== context.record.revision || state.packetSha256 !== context.packetHash) {
    throw new Error('existing release state conflicts with requested packet');
  }
}

async function runQa(run, cwd) {
  for (const script of REQUIRED_QA) await run(process.execPath, [script], { cwd });
}

async function prepare(context, state, options, run) {
  if (state?.commitSha) return state;
  if (context.changed.length !== DATA_FILES.length || DATA_FILES.some((file) => !context.changed.includes(file))) {
    throw new Error(`release requires exactly these consumer changes: ${DATA_FILES.join(', ')}`);
  }
  await run('git', ['fetch', context.remote, context.base], { cwd:context.repoRoot });
  const sourceHead = clean(output(await run('git', ['rev-parse', 'HEAD'], { cwd:context.repoRoot })));
  const baseHead = clean(output(await run('git', ['rev-parse', `${context.remote}/${context.base}`], { cwd:context.repoRoot })));
  if (sourceHead !== baseHead) throw new Error(`consumer repository HEAD must equal latest ${context.remote}/${context.base}`);
  const worktree = path.join(context.stateDir, 'release-worktrees', safeKey(context.metadata.key));
  try {
    await fs.access(worktree);
  } catch {
    await fs.mkdir(path.dirname(worktree), { recursive:true });
    await run('git', ['worktree', 'add', '--detach', worktree, `${context.remote}/${context.base}`], { cwd:context.repoRoot });
  }
  const worktreeHead = clean(output(await run('git', ['rev-parse', 'HEAD'], { cwd:worktree })));
  if (worktreeHead !== baseHead) throw new Error('release worktree is not based on latest origin/main');
  const existingBranch = clean(output(await run('git', ['branch', '--list', context.metadata.branch], { cwd:worktree })));
  if (existingBranch) await run('git', ['switch', context.metadata.branch], { cwd:worktree });
  else await run('git', ['switch', '-c', context.metadata.branch], { cwd:worktree });
  for (const file of DATA_FILES) await fs.copyFile(path.join(context.repoRoot, file), path.join(worktree, file));
  const copiedStoreHash = sha256(await fs.readFile(path.join(worktree, DATA_FILES[0])));
  const copiedBrowserHash = sha256(await fs.readFile(path.join(worktree, DATA_FILES[1])));
  if (copiedStoreHash !== context.ack.storeSha256 || copiedBrowserHash !== context.ack.browserBundleSha256) throw new Error('staged digest hashes do not match acknowledgement');
  const stagedStatus = output(await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd:worktree }));
  const stagedFiles = assertAllowedChanges(stagedStatus);
  if (stagedFiles.length !== DATA_FILES.length) throw new Error('staged release does not contain both digest outputs');
  await runQa(run, worktree);
  await run('git', ['add', '--', ...DATA_FILES], { cwd:worktree });
  await run('git', ['diff', '--cached', '--check'], { cwd:worktree });
  await run('git', ['commit', '-m', context.metadata.title], { cwd:worktree });
  const commitSha = clean(output(await run('git', ['rev-parse', 'HEAD'], { cwd:worktree })));
  return saveState(context, state || {}, {
    version:1,
    status:'PREPARED',
    digestId:context.record.id,
    marketDate:context.record.marketDate,
    revision:context.record.revision,
    packetSha256:context.packetHash,
    storeSha256:context.ack.storeSha256,
    browserBundleSha256:context.ack.browserBundleSha256,
    branch:context.metadata.branch,
    title:context.metadata.title,
    body:context.metadata.body,
    worktree,
    baseHead,
    commitSha
  });
}

async function findExistingPr(context, run) {
  const text = output(await run('gh', ['pr', 'list', '--head', context.metadata.branch, '--state', 'all', '--json', 'url,state,mergedAt,mergeCommit'], { cwd:context.repoRoot }));
  const prs = json(text || '[]', 'gh pr list');
  if (prs.length > 1) throw new Error('multiple PRs exist for deterministic release branch');
  return prs[0] || null;
}

async function promote(context, state, options, run, sleep) {
  if (state.status === 'PUBLISHED') return { ...state, outcome:'NOOP' };
  await run('gh', ['auth', 'status'], { cwd:state.worktree });
  if (!state.pushedAt) {
    await run('git', ['push', '--set-upstream', context.remote, state.branch], { cwd:state.worktree });
    state = await saveState(context, state, { status:'PUSHED', pushedAt:new Date().toISOString() });
  }
  let pr = await findExistingPr(context, run);
  if (!pr) {
    const created = await run('gh', ['pr', 'create', '--base', context.base, '--head', state.branch, '--title', state.title, '--body', state.body], { cwd:state.worktree });
    pr = { url:clean(output(created)), state:'OPEN' };
    if (!pr.url.startsWith('https://')) throw new Error('gh pr create did not return a PR URL');
  }
  state = await saveState(context, state, { status:'PR_OPEN', prUrl:pr.url, prObservedState:pr.state });
  if (pr.state !== 'MERGED') {
    await run('gh', ['pr', 'checks', pr.url, '--watch', '--interval', '10'], { cwd:state.worktree });
    const view = json(output(await run('gh', ['pr', 'view', pr.url, '--json', 'mergeable,mergeStateStatus,state'], { cwd:state.worktree })), 'gh pr view');
    if (view.state !== 'OPEN' || view.mergeable !== 'MERGEABLE' || view.mergeStateStatus !== 'CLEAN') throw new Error('PR is not cleanly mergeable after checks');
    await run('gh', ['pr', 'merge', pr.url, '--squash'], { cwd:state.worktree });
  }
  const merged = json(output(await run('gh', ['pr', 'view', pr.url, '--json', 'state,mergedAt,mergeCommit'], { cwd:state.worktree })), 'merged PR');
  if (merged.state !== 'MERGED' || !merged.mergeCommit?.oid) throw new Error('PR did not reach merged state');
  state = await saveState(context, state, { status:'MERGED', mergedAt:merged.mergedAt, mergeCommit:merged.mergeCommit.oid });
  let pages;
  const attempts = options.pagesLookupAttempts || 30;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const runs = json(output(await run('gh', ['run', 'list', '--commit', state.mergeCommit, '--workflow', 'pages-build-deployment', '--limit', '5', '--json', 'databaseId,status,conclusion,url,headSha'], { cwd:state.worktree })), 'Pages run list');
    pages = runs.find((item) => item.headSha === state.mergeCommit);
    if (pages) break;
    if (attempt + 1 < attempts) await sleep(options.pagesLookupIntervalMs || 5000);
  }
  if (!pages) throw new Error('Pages deployment run was not found for merge commit before timeout');
  if (pages.status !== 'completed') await run('gh', ['run', 'watch', String(pages.databaseId), '--exit-status'], { cwd:state.worktree });
  else if (pages.conclusion !== 'success') throw new Error(`Pages deployment failed: ${pages.conclusion}`);
  state = await saveState(context, state, { status:'PAGES_PASSED', pagesRunId:pages.databaseId, pagesUrl:pages.url });
  await run(process.execPath, ['scripts/public-smoke.mjs'], {
    cwd:state.worktree,
    env:{ PUBLIC_BASE_URL:context.publicBaseUrl, EXPECTED_DIGEST_ID:context.record.id, PUBLIC_SMOKE_SKIP_PROXY:'1' }
  });
  return saveState(context, state, { status:'PUBLISHED', publicSmokeDigestId:context.record.id, publishedAt:new Date().toISOString() });
}

export async function releaseCloseDigest(options, dependencies = {}) {
  const run = dependencies.run || commandRunner;
  const sleep = dependencies.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const context = await readReleaseInputs(options, run);
  context.remote = options.remote || DEFAULT_REMOTE;
  context.base = options.base || DEFAULT_BASE;
  context.publicBaseUrl = options.publicBaseUrl || DEFAULT_PUBLIC_BASE;
  let state = await loadState(context.statePath);
  assertStateIdentity(state, context);
  if (state?.status === 'PUBLISHED') return { ...state, outcome:'NOOP' };
  state = await prepare(context, state, options, run);
  if (options.prepareOnly) return { ...state, outcome:'PREPARED' };
  return promote(context, state, options, run, sleep);
}

function parseArgs(argv) {
  const options = { maxAgeMinutes:180, prepareOnly:false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--state-dir') options.stateDir = argv[++index];
    else if (arg === '--consumer-result') options.consumerResult = argv[++index];
    else if (arg === '--packet') options.packet = argv[++index];
    else if (arg === '--remote') options.remote = argv[++index];
    else if (arg === '--base') options.base = argv[++index];
    else if (arg === '--public-base-url') options.publicBaseUrl = argv[++index];
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--max-age-minutes') options.maxAgeMinutes = Number(argv[++index]);
    else if (arg === '--prepare-only') options.prepareOnly = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.repoRoot || !options.stateDir || !options.consumerResult) {
    throw new Error('usage: release-close-digest.mjs --repo-root <path> --state-dir <path> --consumer-result <ack.json> [--packet <archive.json>] [--prepare-only]');
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releaseCloseDigest(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ status:'FAILED_GATE', reason:error.message }, null, 2));
    process.exitCode = 1;
  });
}
