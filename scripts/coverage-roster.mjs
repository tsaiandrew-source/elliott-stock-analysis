import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));

export async function loadCoverageRoster(repoRoot = defaultRoot) {
  const source = await fs.readFile(path.join(repoRoot, 'coverage-order.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'coverage-order.js' });
  const order = Array.from(sandbox.window.PROTOTYPE_COVERAGE_ORDER || []);
  const companies = { ...(sandbox.window.PROTOTYPE_COVERAGE_COMPANIES || {}) };
  if (!order.length || new Set(order).size !== order.length) throw new Error('coverage-order.js has an empty or duplicate roster.');
  return { order, companies };
}
