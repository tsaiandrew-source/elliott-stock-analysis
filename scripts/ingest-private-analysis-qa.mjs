import assert from 'node:assert/strict';
import { selectInboxPackets, unresolvedVisiblePackets } from './ingest-private-analysis.mjs';

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

const rosterCorrection = {
  correctionScope:'roster-only',
  supersedesBatchId:'COVERAGE-OLD',
  dailyPackets:[{
    ticker:'MU',
    runId:'MU-20260916-EOD-CORRECTION-V2-D',
    supersedesRunId:'MU-20260916-EOD-V1-D',
    analysisDate:'2026-09-16',
    dataThrough:'2026-09-16',
    priceSnapshot:{ value:926.55 }
  }],
  weeklyPackets:[{
    ticker:'MU',
    runId:'MU-20260911-EOW-CARRY-20260916-CORRECTION-V2-W',
    supersedesRunId:'MU-20260911-EOW-CARRY-20260916-V1-W',
    analysisDate:'2026-09-11',
    dataThrough:'2026-09-11'
  }]
};
const supersededVisible = [
  { ticker:'MU', runId:'MU-20260916-EOD-V1-D', runType:'latest', dataThrough:'2026-09-16', priceSnapshot:{ value:926.55 } },
  { ticker:'MU', runId:'MU-20260911-EOW-CARRY-20260916-V1-W', runType:'weekly', dataThrough:'2026-09-11' }
];
assert.deepEqual(unresolvedVisiblePackets(rosterCorrection, supersededVisible), []);
assert.equal(unresolvedVisiblePackets(rosterCorrection, supersededVisible.map((row) => row.runType === 'latest'
  ? { ...row, priceSnapshot:{ value:900 } }
  : row)).some((item) => item.lane === 'daily'), true);
const contentCorrectionMissing = unresolvedVisiblePackets({ ...rosterCorrection, correctionScope:'content-correction' }, supersededVisible);
assert.equal(contentCorrectionMissing.length, 1);
assert.equal(contentCorrectionMissing[0].lane, 'daily');

const selection = selectInboxPackets([
  { name:'v1.json', text:JSON.stringify({ batchId:'COVERAGE-V1' }) },
  { name:'v2.json', text:JSON.stringify({ batchId:'COVERAGE-V2', supersedesBatchId:'COVERAGE-V1' }) }
]);
assert.deepEqual(selection.active.map(({ batch: item }) => item.batchId), ['COVERAGE-V2']);
assert.deepEqual(selection.superseded.map(({ batch: item }) => item.batchId), ['COVERAGE-V1']);
assert.throws(() => selectInboxPackets([
  { name:'a.json', text:JSON.stringify({ batchId:'A' }) },
  { name:'b.json', text:JSON.stringify({ batchId:'B' }) }
]), /active packets/);

console.log(JSON.stringify({
  status:'PASS',
  strictDailyRunIdentity:true,
  strictFinalWeeklyRunIdentity:true,
  equivalentWeeklyCarryVisibility:true,
  carryDateMismatchRejected:true,
  rosterOnlyCorrectionCanReuseExactSupersededRows:true,
  rosterOnlyCorrectionRequiresMatchingCompletedClose:true,
  contentCorrectionsCannotReuseSupersededRows:true,
  newestSupersessionHeadSelected:true,
  ambiguousHeadsRejected:true
}, null, 2));
