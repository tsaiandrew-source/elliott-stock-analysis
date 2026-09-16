import { fileURLToPath } from 'node:url';
import { readCoverageRegistry } from './coverage-registry.mjs';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));

export async function loadCoverageRoster(repoRoot = defaultRoot) {
  const registry = await readCoverageRegistry(repoRoot);
  const entries = registry.tickers.map((entry) => ({ ...entry }));
  const order = entries.map((entry) => entry.ticker);
  const companies = Object.fromEntries(entries.map((entry) => [entry.ticker, entry.company]));
  const coverageGroups = Object.fromEntries(entries.map((entry) => [entry.ticker, entry.coverageGroup]));
  const marketGroups = Object.fromEntries(entries.map((entry) => [entry.ticker, entry.marketGroup]));
  const exchanges = Object.fromEntries(entries.map((entry) => [entry.ticker, entry.exchange]));
  const defaultViews = Object.fromEntries(entries.map((entry) => [entry.ticker, entry.defaultView]));
  return { order, companies, coverageGroups, marketGroups, exchanges, defaultViews, entries, registry };
}
