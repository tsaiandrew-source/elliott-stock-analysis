import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli as ingestUniversalRefreshGex } from './ingest-universal-refresh-gex.mjs';

const defaultOutput = 'chart-surface/universal-refresh-gex-data.js';

const exists = async (file) => {
  try { await fs.access(file); return true; } catch { return false; }
};

const runCommand = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
});

async function discoverPacket(outbox) {
  const entries = (await fs.readdir(outbox, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  if (!entries.length) return null;
  if (entries.length > 1) throw new Error(`outbox contains ${entries.length} packets; require exactly one for a deterministic cycle`);
  return path.join(outbox, entries[0].name);
}

async function replaceWithRollback(outputPath, publish, validate) {
  const backupPath = `${outputPath}.cycle-backup-${process.pid}`;
  const hadPrevious = await exists(outputPath);
  if (hadPrevious) await fs.copyFile(outputPath, backupPath);
  try {
    await publish();
    const qa = await validate();
    if (!qa.ok) throw new Error(qa.reason);
    if (hadPrevious) await fs.rm(backupPath, { force: true });
    return qa;
  } catch (error) {
    if (hadPrevious) await fs.copyFile(backupPath, outputPath);
    else await fs.rm(outputPath, { force: true });
    await fs.rm(backupPath, { force: true });
    throw error;
  }
}

export async function runUniversalRefreshGexCycle(options, dependencies = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const output = options.output || defaultOutput;
  const outputPath = path.resolve(repoRoot, output);
  const inputPath = options.input ? path.resolve(repoRoot, options.input) : await discoverPacket(path.resolve(repoRoot, options.outbox));
  if (!inputPath) return { status: 'NOOP', reason: 'no packet in outbox' };
  if (options.check) {
    const result = await ingestUniversalRefreshGex(['--input', inputPath, '--output', outputPath, '--check'], repoRoot);
    return { status: 'VALIDATED', input: inputPath, ...result };
  }

  const node = dependencies.node || process.execPath;
  const qa = dependencies.qa || (async () => {
    const staticQa = await runCommand(node, ['scripts/static-qa.mjs'], repoRoot);
    if (staticQa.code !== 0) return { ok: false, reason: `Static QA failed: ${staticQa.stderr || staticQa.stdout}` };
    const pwaQa = await runCommand(node, ['scripts/pwa-qa.mjs'], repoRoot);
    if (pwaQa.code !== 0) return { ok: false, reason: `PWA QA failed: ${pwaQa.stderr || pwaQa.stdout}` };
    return { ok: true, staticQa: staticQa.stdout, pwaQa: pwaQa.stdout };
  });
  const result = await replaceWithRollback(
    outputPath,
    () => ingestUniversalRefreshGex(['--input', inputPath, '--output', outputPath], repoRoot),
    qa
  );
  return { status: 'INGESTED', input: inputPath, output: outputPath, qa: result };
}

const parseArgs = (argv) => {
  const options = { check: false, output: defaultOutput };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--outbox') options.outbox = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--check') options.check = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.input && !options.outbox) throw new Error('usage: node scripts/run-universal-refresh-gex-cycle.mjs --input <packet.json> [--repo-root <path>] [--output <browser.js>] [--check]');
  if (options.input && options.outbox) throw new Error('choose --input or --outbox, not both');
  return options;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runUniversalRefreshGexCycle(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ status: 'FAILED_GATE', reason: error.message }, null, 2));
    process.exitCode = 1;
  });
}
