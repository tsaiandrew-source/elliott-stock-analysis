import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validatePacket } from './validate-universal-refresh-gex.mjs';

const atomicWrite = async (target, contents) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temporary, contents, 'utf8');
  await fs.rename(temporary, target);
};

export const renderBrowserPacket = (packet) => [
  `// Universal Refresh GEX v1; append-only batch ${packet.batchId}.`,
  `window.UNIVERSAL_REFRESH_GEX = ${JSON.stringify(packet)};`,
  ''
].join('\n');

const parseArgs = (argv) => {
  const options = { output: 'chart-surface/universal-refresh-gex-data.js', check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--check') options.check = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.input) throw new Error('usage: node scripts/ingest-universal-refresh-gex.mjs --input <packet.json> [--output <browser.js>] [--check]');
  return options;
};

export async function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const inputPath = path.resolve(cwd, options.input);
  const outputPath = path.resolve(cwd, options.output);
  const packet = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  validatePacket(packet, 'input');
  if (!options.check) await atomicWrite(outputPath, renderBrowserPacket(packet));
  return { checked: options.check, written: !options.check, output: options.check ? null : outputPath, tickerCount: packet.records.length, batchId: packet.batchId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((result) => console.log(JSON.stringify({ status: 'PASS', ...result }, null, 2))).catch((error) => {
    console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
