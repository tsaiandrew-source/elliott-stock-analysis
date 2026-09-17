import assert from 'node:assert/strict';
import { normalizeRunForPublic } from './sync-universal-refresh.mjs';

const market = { LITE:{ dataThrough:'2026-09-16' } };
const stale = {
  ticker:'LITE',
  runType:'latest',
  analysisDate:'2026-09-16',
  dataThrough:'2026-09-16',
  thesis:'主型態延續觀察；今日收盤 838.96。',
  confirmation:'收盤站上確認線。',
  invalidation:'收盤跌破失效線。',
  dailyDigest:{
    dataThrough:'2026-09-16',
    endOfDay:{
      date:'2026-09-16 · 收盤',
      sections:[{ heading:'摘要與市場脈絡', points:['雙重底形成中延續觀察；9/16 收 919.40 美元，較 9/15 上漲 9.59%。'] }]
    }
  }
};
const normalized = normalizeRunForPublic(stale, market);
assert.match(normalized.thesis, /9\/16 收 919\.40/);
assert.doesNotMatch(normalized.thesis, /838\.96/);
assert.match(normalized.thesis, /確認：收盤站上確認線/);
assert.match(normalized.thesis, /失效：收盤跌破失效線/);

const older = normalizeRunForPublic({ ...stale, dataThrough:'2026-09-15' }, market);
assert.equal(older.thesis, stale.thesis);
const weekly = normalizeRunForPublic({ ...stale, runType:'weekly' }, market);
assert.equal(weekly.thesis, stale.thesis);

console.log(JSON.stringify({
  status:'PASS',
  currentDailyThesisUsesCompletedSessionDigest:true,
  staleCloseTextRemoved:true,
  olderAndWeeklyRunsPreserved:true
}, null, 2));
