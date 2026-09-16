import fs from 'node:fs';
import { readCoverageRegistry } from './coverage-registry.mjs';
import { verifyMarketDataset } from './sync-market-data.mjs';

const ticker = String(process.argv[2] || '').trim().toUpperCase();
if (!/^[A-Z0-9.:-]+$/.test(ticker)) {
  console.error('Usage: node scripts/validate-ticker-onboarding.mjs <TICKER>');
  process.exit(2);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];
const registry = await readCoverageRegistry(process.cwd());
if (!registry.tickers.some((entry) => entry.ticker === ticker)) failures.push('coverage-roster.json: ticker missing');
if (!new RegExp(`"ticker": "${ticker}"`).test(read('coverage-order.js'))) failures.push('coverage-order.js: generated ticker missing');
for (const file of ['data-model/app.html', 'data-model/coverage.html', 'chart-surface/index.html']) {
  if (!read(file).includes('PROTOTYPE_COVERAGE_ROSTER')) failures.push(`${file}: canonical registry is not wired`);
}

const contract = read('chart-surface/data-contract.js');
const tickerStart = contract.indexOf(`"ticker": "${ticker}"`);
if (tickerStart >= 0) {
  const row = contract.slice(tickerStart, tickerStart + 1200);
  for (const field of ['company', 'exchange', 'marketSource', 'gexSource', 'freshness']) {
    if (!row.includes(`"${field}"`)) failures.push(`data-contract.js: ${ticker} missing ${field}`);
  }
}
try {
  verifyMarketDataset(JSON.parse(read(`chart-surface/partial-market-data/${ticker}.json`)), { ticker });
} catch (error) {
  failures.push(`partial market data: ${error.message}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', ticker, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', ticker, checks: ['registry', 'generated-browser-bundle', 'UI-registry-wiring', 'contract', 'market-data'] }, null, 2));
