import assert from 'node:assert/strict';
import { unresolvedVisiblePackets } from './ingest-private-analysis.mjs';

const batch = {
  dailyPackets: [{ ticker:'NBIS', runId:'NBIS-20260914-EOD-V1-D', analysisDate:'2026-09-14', dataThrough:'2026-09-14' }],
  weeklyPackets: [
    { ticker:'NBIS', runId:'NBIS-20260911-EOW-CARRY-20260914-V1-W', analysisDate:'2026-09-11', dataThrough:'2026-09-11' },
    { ticker:'PLTR', runId:'PLTR-20260911-EOW-V1-W', analysisDate:'2026-09-11', dataThrough:'2026-09-11' }
  ]
};

const visibleRuns = [
  { ticker:'NBIS', runId:'NBIS-20260914-EOD-V1-D', runType:'daily', dataThrough:'2026-09-14' },
  { ticker:'NBIS', runId:'NBIS-20260911-EOW-V1', runType:'weekly', dataThrough:'2026-09-11' },
  { ticker:'PLTR', runId:'PLTR-20260911-EOW-V1-W', runType:'weekly', dataThrough:'2026-09-11' }
];

assert.deepEqual(unresolvedVisiblePackets(batch, visibleRuns), []);

const missingDaily = unresolvedVisiblePackets(batch, visibleRuns.slice(1));
assert.equal(missingDaily.length, 1);
assert.equal(missingDaily[0].lane, 'daily');

const wrongCarryDate = visibleRuns.map((row) => row.ticker === 'NBIS' && row.runType === 'weekly'
  ? { ...row, dataThrough:'2026-09-10' }
  : row);
assert.equal(unresolvedVisiblePackets(batch, wrongCarryDate).some((item) => item.runId.includes('-CARRY-')), true);

const wrongFinalRun = visibleRuns.map((row) => row.ticker === 'PLTR'
  ? { ...row, runId:'PLTR-20260911-EOW-OTHER' }
  : row);
assert.equal(unresolvedVisiblePackets(batch, wrongFinalRun).some((item) => item.ticker === 'PLTR'), true);

console.log(JSON.stringify({
  status:'PASS',
  strictDailyRunIdentity:true,
  strictFinalWeeklyRunIdentity:true,
  equivalentWeeklyCarryVisibility:true,
  carryDateMismatchRejected:true
}, null, 2));
