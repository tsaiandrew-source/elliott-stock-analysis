import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readCoverageRegistry, renderCoverageOrderBrowser } from './coverage-registry.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'coverage-order.js');
const expected = renderCoverageOrderBrowser(await readCoverageRegistry(root));
if (process.argv.includes('--check')) {
  const actual = await fs.readFile(output, 'utf8');
  if (actual !== expected) throw new Error('coverage-order.js is stale; run node scripts/generate-coverage-order.mjs');
  console.log(JSON.stringify({ status:'PASS', output:'coverage-order.js' }, null, 2));
} else {
  await fs.writeFile(output, expected, 'utf8');
  console.log(JSON.stringify({ status:'UPDATED', output:'coverage-order.js' }, null, 2));
}
