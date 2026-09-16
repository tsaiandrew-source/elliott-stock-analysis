import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COVERAGE_SCHEMA_VERSION = 'elliott-coverage-roster-v1';
const moduleRoot = fileURLToPath(new URL('..', import.meta.url));
const tickerPattern = /^[A-Z0-9.:-]+$/;
const allowedGroups = new Set(['tracking', 'exploration']);
const allowedMarkets = new Set(['us', 'twse']);
const allowedViews = new Set(['daily', 'weekly', 'gex']);

export function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

export function validateCoverageRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== COVERAGE_SCHEMA_VERSION) failures.push(`schemaVersion must be ${COVERAGE_SCHEMA_VERSION}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(registry?.updatedAt || ''))) failures.push('updatedAt must be YYYY-MM-DD');
  if (!Array.isArray(registry?.tickers) || !registry.tickers.length) failures.push('tickers must be a non-empty array');
  const seen = new Set();
  for (const [index, raw] of (registry?.tickers || []).entries()) {
    const location = `tickers[${index}]`;
    const ticker = normalizeTicker(raw?.ticker);
    if (!tickerPattern.test(ticker)) failures.push(`${location}.ticker is invalid`);
    if (seen.has(ticker)) failures.push(`${location}.ticker duplicates ${ticker}`);
    seen.add(ticker);
    if (raw?.ticker !== ticker) failures.push(`${location}.ticker must be normalized uppercase`);
    if (!String(raw?.company || '').trim()) failures.push(`${location}.company is required`);
    if (!String(raw?.exchange || '').trim()) failures.push(`${location}.exchange is required`);
    if (!allowedGroups.has(raw?.coverageGroup)) failures.push(`${location}.coverageGroup is invalid`);
    if (!allowedMarkets.has(raw?.marketGroup)) failures.push(`${location}.marketGroup is invalid`);
    if (!allowedViews.has(raw?.defaultView)) failures.push(`${location}.defaultView is invalid`);
    if (raw?.marketGroup === 'twse' && String(raw?.exchange || '').toUpperCase() !== 'TWSE') failures.push(`${location}.exchange must be TWSE for marketGroup twse`);
  }
  if (failures.length) throw new Error(`Invalid coverage registry:\n${failures.join('\n')}`);
  return registry;
}

export async function readCoverageRegistry(repoRoot = moduleRoot) {
  const file = path.join(repoRoot, 'coverage-roster.json');
  return validateCoverageRegistry(JSON.parse(await fs.readFile(file, 'utf8')));
}

export function renderCoverageOrderBrowser(registry) {
  validateCoverageRegistry(registry);
  const entries = JSON.stringify(registry.tickers, null, 2);
  return `// Generated from coverage-roster.json by scripts/generate-coverage-order.mjs.\n(() => {\n  const entries = Object.freeze(${entries}.map((entry) => Object.freeze(entry)));\n  const byTicker = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry])));\n  const order = Object.freeze(entries.map((entry) => entry.ticker));\n  const companies = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.company])));\n  const groups = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.coverageGroup])));\n  const markets = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.marketGroup])));\n  const exchanges = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.exchange])));\n  const defaultViews = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.defaultView])));\n  const rankByTicker = new Map(order.map((ticker, index) => [ticker, index]));\n  const normalizeTicker = (value) => String(value ?? '').trim().toUpperCase();\n  const rank = (item) => {\n    const position = rankByTicker.get(normalizeTicker(item?.ticker));\n    return position === undefined ? order.length : position;\n  };\n  const sort = (items) => items\n    .map((item, index) => ({ item, index }))\n    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)\n    .map(({ item }) => item);\n\n  window.PROTOTYPE_COVERAGE_ROSTER = entries;\n  window.PROTOTYPE_COVERAGE_BY_TICKER = byTicker;\n  window.PROTOTYPE_COVERAGE_ORDER = order;\n  window.PROTOTYPE_COVERAGE_COMPANIES = companies;\n  window.PROTOTYPE_COVERAGE_GROUPS = groups;\n  window.PROTOTYPE_COVERAGE_MARKETS = markets;\n  window.PROTOTYPE_COVERAGE_EXCHANGES = exchanges;\n  window.PROTOTYPE_COVERAGE_DEFAULT_VIEWS = defaultViews;\n  window.PROTOTYPE_COVERAGE_SORT_RANK = rank;\n  window.PROTOTYPE_SORT_COVERAGE = sort;\n})();\n`;
}

export async function writeCoverageOrderBrowser(repoRoot = moduleRoot, registry = null) {
  const value = registry || await readCoverageRegistry(repoRoot);
  const contents = renderCoverageOrderBrowser(value);
  await fs.writeFile(path.join(repoRoot, 'coverage-order.js'), contents, 'utf8');
  return contents;
}
