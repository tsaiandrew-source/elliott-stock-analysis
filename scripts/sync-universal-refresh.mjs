import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCoverageRoster } from './coverage-roster.mjs';

const READ_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyfPXGRSZvSa8NOp6OguWNYgWEB1wHcr42E6e_uvleNb-ckI_Rei23PEWigi2Wx3CzQRg/exec';
const PUBLIC_BASE = 'https://tsaiandrew-source.github.io/elliott-stock-analysis';
const GITHUB_REPOSITORY = 'tsaiandrew-source/elliott-stock-analysis';
const DATA_FILE = 'chart-surface/data-contract.js';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safe = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '-');

const run = (command, args, { cwd, env = {}, input = '' } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr || stdout}`)));
  child.stdin.end(input);
});

async function readBrowserContract(file) {
  const source = await fs.readFile(file, 'utf8');
  const sandbox = { window: { addEventListener() {} } };
  vm.runInNewContext(source, sandbox, { filename: file });
  if (!sandbox.window.PROTOTYPE_DATA_CONTRACT) throw new Error(`${file} does not define PROTOTYPE_DATA_CONTRACT`);
  return sandbox.window.PROTOTYPE_DATA_CONTRACT;
}

async function fetchLiveContract() {
  const delays = [0, 5_000, 15_000];
  let lastError = null;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    try {
      const url = new URL(READ_ENDPOINT);
      url.searchParams.set('format', 'json');
      url.searchParams.set('refresh', String(Date.now()));
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: 'no-store', headers: { 'User-Agent': 'elliott-stock-analysis/autonomous-refresh' } });
      const text = await response.text();
      if (!response.ok) throw new Error(`read proxy returned HTTP ${response.status}`);
      if (/^\s*</.test(text)) throw new Error('read proxy returned HTML instead of JSON');
      return JSON.parse(text);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('read proxy was unavailable');
}

const runKey = (row) => row?.runId || row?.RunID || [row?.ticker || row?.Ticker, row?.analysisDate || row?.AnalysisDate, row?.runType || row?.RunType].filter(Boolean).join('|');
const usableArray = (candidate, fallback) => Array.isArray(candidate) && candidate.length ? candidate : (Array.isArray(fallback) ? fallback : []);
const profileUsable = (value) => value && typeof value === 'object' && (Array.isArray(value.strikes) ? value.strikes.length > 0 : Object.keys(value).length > 0);

function sanitizeLocalValues(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeLocalValues(item, key));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /(?:\/Users\/|\/private\/tmp|file:\/\/|P F Social|shared_research|coverage_analysis_packets)/i.test(value)) return '';
    return value;
  }
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (/^(?:LocalArtifact|SourceArtifact|ManifestPath|ChartSourcePath|SHA256)$/i.test(childKey)) continue;
    output[childKey] = sanitizeLocalValues(childValue, childKey);
  }
  return output;
}

export async function buildCandidate(live, previous, repoRoot) {
  const { order, companies } = await loadCoverageRoster(repoRoot);
  const liveCoverage = Array.isArray(live.coverage) ? live.coverage : [];
  const liveActive = liveCoverage.filter((item) => item.active !== false).map((item) => String(item.ticker || item.Ticker || '').toUpperCase());
  const missing = order.filter((ticker) => !liveActive.includes(ticker));
  const extra = liveActive.filter((ticker) => !order.includes(ticker));
  if (missing.length || extra.length) throw new Error(`live Coverage roster mismatch; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  if (!Array.isArray(live.analysisRuns) || !live.analysisRuns.length) throw new Error('live proxy has no analysisRuns');

  const previousCoverage = new Map((previous.coverage || []).map((item) => [String(item.ticker || '').toUpperCase(), item]));
  const currentCoverage = new Map(liveCoverage.map((item) => [String(item.ticker || item.Ticker || '').toUpperCase(), item]));
  const coverage = order.map((ticker) => {
    const prior = previousCoverage.get(ticker) || {};
    const fresh = currentCoverage.get(ticker) || {};
    return {
      ...prior,
      ...fresh,
      ticker,
      company: fresh.company || fresh.Company || prior.company || companies[ticker] || ticker,
      exchange: fresh.exchange || fresh.Exchange || prior.exchange || (ticker === 'OKLO' ? 'NYSE' : ''),
      active: true,
      chartSource: `public-contract://chart-source/${ticker}`
    };
  });

  const runs = new Map();
  for (const item of [...(previous.analysisRuns || []), ...(live.analysisRuns || [])]) {
    const key = runKey(item);
    if (key) runs.set(key, { ...item, chartSource: `public-contract://chart-source/${item.ticker || item.Ticker || 'unknown'}` });
  }

  const previousBenchmark = previous.datasets?.benchmark || {};
  const liveBenchmark = live.datasets?.benchmark || {};
  const benchmark = {};
  for (const ticker of order) {
    const prior = previousBenchmark[ticker] || {};
    const fresh = liveBenchmark[ticker] || {};
    const priorGex = prior.gexViews || {};
    const freshGex = fresh.gexViews || {};
    benchmark[ticker] = {
      ...prior,
      ...fresh,
      bars: usableArray(fresh.bars, prior.bars),
      gexViews: {
        ...priorGex,
        ...freshGex,
        current: profileUsable(freshGex.current) ? freshGex.current : priorGex.current,
        next: profileUsable(freshGex.next) ? freshGex.next : priorGex.next
      },
      chartSource: `public-contract://chart-source/${ticker}`
    };
  }

  const previousTables = previous.tables || {};
  const liveTables = live.tables || {};
  const tables = {};
  for (const name of new Set([...Object.keys(previousTables), ...Object.keys(liveTables)])) tables[name] = usableArray(liveTables[name], previousTables[name]);
  const candidate = sanitizeLocalValues({
    ...previous,
    ...live,
    mode: 'sanitized-public-contract',
    source: {
      marketDataLayer: live.source?.marketDataLayer || previous.source?.marketDataLayer || 'Google Sheets market data',
      optionsDataLayer: live.source?.optionsDataLayer || previous.source?.optionsDataLayer || 'Dated options benchmark snapshots'
    },
    coverage,
    analysisRuns: [...runs.values()],
    tables,
    datasets: {
      ...(previous.datasets || {}),
      ...(live.datasets || {}),
      benchmark,
      weeklyHistory: { ...(previous.datasets?.weeklyHistory || {}), ...(live.datasets?.weeklyHistory || {}) },
      analysisDetails: { ...(previous.datasets?.analysisDetails || {}), ...(live.datasets?.analysisDetails || {}) }
    }
  });
  const gexRows = candidate.tables?.GEXSnapshots || [];
  if (!gexRows.length && !order.every((ticker) => candidate.datasets?.benchmark?.[ticker]?.gexViews)) throw new Error('candidate has neither GEX snapshot rows nor last-good GEX views');
  return candidate;
}

const comparable = (contract) => {
  const copy = structuredClone(contract);
  delete copy.generatedAt;
  delete copy.contractVersion;
  return JSON.stringify(copy);
};

export function parsePorcelainPaths(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const pathValue = line.slice(3);
    const renameSeparator = pathValue.lastIndexOf(' -> ');
    return renameSeparator >= 0 ? pathValue.slice(renameSeparator + 4) : pathValue;
  });
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, contents, 'utf8');
  await fs.rename(temporary, file);
}

async function fileSha256(file) {
  return sha256(await fs.readFile(file));
}

async function verifyPublishedContract(repoRoot, expectedHash) {
  return run(process.execPath, ['scripts/public-smoke.mjs'], {
    cwd: repoRoot,
    env: { PUBLIC_BASE_URL: PUBLIC_BASE, EXPECTED_DATA_CONTRACT_SHA256: expectedHash }
  });
}

async function synchronize(repoRoot, check) {
  const output = path.join(repoRoot, DATA_FILE);
  const previous = await readBrowserContract(output);
  const live = await fetchLiveContract();
  const candidate = await buildCandidate(live, previous, repoRoot);
  const unchanged = sha256(comparable(candidate)) === sha256(comparable(previous));
  const summary = {
    status: unchanged ? 'NO_CHANGE' : (check ? 'CANDIDATE_VALIDATED' : 'UPDATED'),
    liveContractVersion: live.contractVersion || null,
    generatedAt: live.generatedAt || null,
    tickerCount: candidate.coverage.length,
    analysisRuns: candidate.analysisRuns.length,
    gexRows: candidate.tables?.GEXSnapshots?.length || 0,
    oklo: candidate.coverage.find((item) => item.ticker === 'OKLO') || null
  };
  if (!check && !unchanged) {
    const json = JSON.stringify(candidate, null, 2);
    await atomicWrite(output, `// Sanitized Universal Refresh contract; generated by scripts/sync-universal-refresh.mjs\nwindow.PROTOTYPE_DATA_CONTRACT = ${json};\n`);
  }
  return summary;
}

async function githubEnvironment(cwd) {
  if (!process.env.GH_TOKEN) throw new Error(`exact tsaiandrew-source credential wrapper is required for release from ${cwd}`);
  const env = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GH_TOKEN };
  const login = (await run('gh', ['api', 'user', '--jq', '.login'], { cwd, env })).stdout.trim();
  if (login !== 'tsaiandrew-source') throw new Error(`release credential resolved to ${login || 'unknown'} instead of tsaiandrew-source`);
  return env;
}

function gitWriteEnvironment(githubEnv) {
  const authorization = Buffer.from(`x-access-token:${githubEnv.GH_TOKEN}`).toString('base64');
  return {
    ...githubEnv,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`
  };
}

async function release(options) {
  const stateDir = options.stateDir;
  await fs.mkdir(stateDir, { recursive: true });
  const lock = path.join(stateDir, 'release.lock');
  let handle;
  try { handle = await fs.open(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'LOCKED', lock }; throw error; }
  let worktree = '';
  try {
    await run('/usr/bin/git', ['fetch', 'origin', 'main'], { cwd: options.repoRoot });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const branch = `codex/universal-refresh-${safe(options.slot)}-${stamp}`;
    worktree = path.join(stateDir, 'worktrees', safe(branch));
    await fs.mkdir(path.dirname(worktree), { recursive: true });
    await run('/usr/bin/git', ['worktree', 'add', '-b', branch, worktree, 'origin/main'], { cwd: options.repoRoot });
    const sync = await synchronize(worktree, false);
    const expectedDataContractSha256 = await fileSha256(path.join(worktree, DATA_FILE));
    if (sync.status === 'NO_CHANGE') {
      await verifyPublishedContract(worktree, expectedDataContractSha256);
      const result = { status: 'NOOP_VERIFIED', slot: options.slot, expectedDataContractSha256, ...sync, completedAt: new Date().toISOString() };
      await atomicWrite(path.join(stateDir, 'last-release.json'), `${JSON.stringify(result, null, 2)}\n`);
      await fs.rm(path.join(stateDir, 'pending-release.json'), { force: true });
      return result;
    }
    await run(process.execPath, ['scripts/static-qa.mjs'], { cwd: worktree });
    await run(process.execPath, ['scripts/pwa-qa.mjs'], { cwd: worktree });
    const statusOutput = (await run('/usr/bin/git', ['status', '--porcelain=v1'], { cwd: worktree })).stdout;
    const changed = parsePorcelainPaths(statusOutput);
    if (changed.length !== 1 || changed[0] !== DATA_FILE) throw new Error(`release scope drift: ${changed.join(', ')}`);
    await run('/usr/bin/git', ['add', '--', DATA_FILE], { cwd: worktree });
    await run('/usr/bin/git', ['diff', '--cached', '--check'], { cwd: worktree });
    const githubEnv = await githubEnvironment(worktree);
    await run('/usr/bin/git', ['commit', '-m', `Publish Universal Refresh ${options.slot}`], { cwd: worktree });
    await run('/usr/bin/git', ['push', '--set-upstream', 'origin', branch], { cwd: worktree, env: gitWriteEnvironment(githubEnv) });
    const title = `Publish Universal Refresh ${options.slot} ${new Date().toISOString().slice(0, 10)}`;
    const body = [
      'Summary', '',
      `Publish the validated ${options.slot} Universal Refresh candidate from the canonical read proxy.`, '',
      'Gates', '',
      `- canonical roster: ${sync.tickerCount} tickers`,
      `- analysis runs: ${sync.analysisRuns}`,
      `- GEX rows: ${sync.gexRows}`,
      '- optional missing lanes preserve the bundled last-good value',
      '- static QA: PASS',
      '- PWA QA: PASS', '',
      'Scope', '',
      `- ${DATA_FILE}`
    ].join('\n');
    const prUrl = (await run('gh', ['pr', 'create', '--repo', GITHUB_REPOSITORY, '--base', 'main', '--head', branch, '--title', title, '--body', body], { cwd: worktree, env: githubEnv })).stdout.trim();
    let mergeable = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      mergeable = JSON.parse((await run('gh', ['pr', 'view', prUrl, '--repo', GITHUB_REPOSITORY, '--json', 'state,mergeable,mergeStateStatus'], { cwd: stateDir, env: githubEnv })).stdout);
      if (mergeable.state === 'OPEN' && mergeable.mergeable === 'MERGEABLE' && !['BLOCKED', 'DIRTY'].includes(mergeable.mergeStateStatus)) break;
      await sleep(10_000);
    }
    if (mergeable?.mergeable !== 'MERGEABLE') throw new Error(`PR did not become mergeable: ${JSON.stringify(mergeable)}`);
    try { await run('gh', ['pr', 'checks', prUrl, '--repo', GITHUB_REPOSITORY, '--watch', '--interval', '10'], { cwd: stateDir, env: githubEnv }); }
    catch (error) { if (!/no checks reported/i.test(error.message)) throw error; }
    try { await run('gh', ['pr', 'merge', prUrl, '--repo', GITHUB_REPOSITORY, '--squash', '--delete-branch'], { cwd: stateDir, env: githubEnv }); }
    catch (_) { /* The API may merge successfully before a local cleanup error; verify state below. */ }
    const merged = JSON.parse((await run('gh', ['pr', 'view', prUrl, '--repo', GITHUB_REPOSITORY, '--json', 'state,mergedAt,mergeCommit'], { cwd: stateDir, env: githubEnv })).stdout);
    if (merged.state !== 'MERGED' || !merged.mergeCommit?.oid) throw new Error('PR did not reach MERGED state');
    await atomicWrite(path.join(stateDir, 'pending-release.json'), `${JSON.stringify({
      status: 'PENDING_PUBLIC_VERIFICATION',
      slot: options.slot,
      prUrl,
      mergeCommit: merged.mergeCommit.oid,
      expectedDataContractSha256,
      mergedAt: merged.mergedAt
    }, null, 2)}\n`);
    let pages = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const list = JSON.parse((await run('gh', ['run', 'list', '--repo', GITHUB_REPOSITORY, '--commit', merged.mergeCommit.oid, '--workflow', 'pages-build-deployment', '--limit', '5', '--json', 'databaseId,status,conclusion,url,headSha'], { cwd: stateDir, env: githubEnv })).stdout || '[]');
      pages = list.find((item) => item.headSha === merged.mergeCommit.oid) || null;
      if (pages) break;
      await sleep(10_000);
    }
    if (!pages) throw new Error('Pages deployment was not found for the merge commit');
    if (pages.status !== 'completed') await run('gh', ['run', 'watch', String(pages.databaseId), '--repo', GITHUB_REPOSITORY, '--exit-status'], { cwd: stateDir, env: githubEnv });
    else if (pages.conclusion !== 'success') throw new Error(`Pages deployment failed: ${pages.conclusion}`);
    await verifyPublishedContract(worktree, expectedDataContractSha256);
    const result = { status: 'PUBLISHED_AND_VERIFIED', slot: options.slot, prUrl, mergeCommit: merged.mergeCommit.oid, pagesUrl: pages.url, expectedDataContractSha256, ...sync, completedAt: new Date().toISOString() };
    await atomicWrite(path.join(stateDir, 'last-release.json'), `${JSON.stringify(result, null, 2)}\n`);
    await fs.rm(path.join(stateDir, 'pending-release.json'), { force: true });
    return result;
  } finally {
    if (worktree) {
      try { await run('/usr/bin/git', ['worktree', 'remove', '--force', worktree], { cwd: options.repoRoot }); } catch (_) { /* Preserve the primary result. */ }
    }
    await handle?.close();
    await fs.rm(lock, { force: true });
  }
}

function parseArgs(argv) {
  const options = { repoRoot: fileURLToPath(new URL('..', import.meta.url)), slot: 'manual', check: false, release: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') options.repoRoot = path.resolve(argv[++index]);
    else if (arg === '--state-dir') options.stateDir = path.resolve(argv[++index]);
    else if (arg === '--slot') options.slot = argv[++index];
    else if (arg === '--check') options.check = true;
    else if (arg === '--release') options.release = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (options.release && !options.stateDir) throw new Error('--state-dir is required with --release');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const task = options.release ? release(options) : synchronize(options.repoRoot, options.check);
  task.then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(JSON.stringify({ status: 'FAILED_GATE', reason: error.message }, null, 2));
    process.exitCode = 1;
  });
}
