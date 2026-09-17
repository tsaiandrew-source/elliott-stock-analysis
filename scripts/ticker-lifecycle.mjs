#!/usr/bin/env node
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { applyTickerLifecycle, planTickerLifecycle } from './ticker-lifecycle-lib.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const action = args.shift();
const ticker = args.shift();
const values = {};
let apply = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--apply') { apply = true; continue; }
  if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
  values[arg.slice(2)] = args[++index];
}
if (!action || !ticker) {
  console.error('Usage: ticker-lifecycle.mjs add|remove TICKER [options] [--apply]');
  process.exit(2);
}
const effectiveDate = values['effective-date'] || new Date().toISOString().slice(0, 10);
const options = {
  repoRoot, action, ticker, effectiveDate,
  marketDataPath: values['market-data'],
  gexRecordPath: values['gex-record'],
  refreshReceiptPath: values['refresh-receipt'],
  after: values.after,
  metadata: {
    company: values.company,
    exchange: values.exchange,
    coverageGroup: values.group,
    marketGroup: values.market,
    defaultView: values['default-view'],
    marketSource: values['market-source'],
    gexSource: values['gex-source']
  }
};
const result = apply ? await applyTickerLifecycle(options) : { status:'DRY_RUN', ...(await planTickerLifecycle(options)) };
console.log(JSON.stringify(result, null, 2));
