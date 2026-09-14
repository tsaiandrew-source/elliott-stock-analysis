import fs from 'node:fs';

const ticker = String(process.argv[2] || '').trim().toUpperCase();
if (!/^[A-Z0-9.:-]+$/.test(ticker)) {
  console.error('Usage: node scripts/validate-ticker-onboarding.mjs <TICKER>');
  process.exit(2);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const checks = [
  ['coverage-order.js', new RegExp(`['"]${ticker}['"]`)],
  ['data-model/app.html', new RegExp(`['"]${ticker}['"]`)],
  ['data-model/coverage.html', new RegExp(`['"]${ticker}['"]`)],
  ['chart-surface/index.html', new RegExp(`['"]${ticker}['"]`)],
  ['chart-surface/data-contract.js', new RegExp(`"ticker": "${ticker}"`)],
];
const failures = [];
for (const [file, pattern] of checks) {
  if (!pattern.test(read(file))) failures.push(`${file}: ticker missing`);
}

const contract = read('chart-surface/data-contract.js');
const tickerStart = contract.indexOf(`"ticker": "${ticker}"`);
if (tickerStart >= 0) {
  const row = contract.slice(tickerStart, tickerStart + 1200);
  for (const field of ['company', 'exchange', 'marketSource', 'gexSource', 'freshness']) {
    if (!row.includes(`"${field}"`)) failures.push(`data-contract.js: ${ticker} missing ${field}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', ticker, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', ticker, checks: checks.map(([file]) => file) }, null, 2));
