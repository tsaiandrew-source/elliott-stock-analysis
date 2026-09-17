import assert from 'node:assert/strict';
import { marketHistoryProfile, normalizeMarketArtifact, verifyInitialMarketDataset, verifyMarketDataset } from './sync-market-data.mjs';

const yahoo = {
  chart: {
    result: [{
      timestamp: [Date.parse('2026-09-14T00:00:00Z') / 1000, Date.parse('2026-09-15T00:00:00Z') / 1000],
      indicators: { quote: [{
        open: [10, 11], high: [12, 13], low: [9, 10], close: [11.5, 12.25], volume: [100, 120]
      }] }
    }]
  }
};
const yahooBars = normalizeMarketArtifact(yahoo, '2026-09-14');
assert.equal(yahooBars.length, 1, 'future or in-progress bars must be excluded by packet dataThrough');
assert.equal(yahooBars[0].date, '2026-09-14');

const nasdaq = { data: { chart: [
  { z: { dateTime: '09/12/2026', open: '20', high: '22', low: '19', close: '21', volume: '1,000' } },
  { z: { dateTime: '09/14/2026', open: '21', high: '23', low: '20', close: '22.5', volume: '1,200' } }
] } };
const nasdaqBars = normalizeMarketArtifact(nasdaq, '2026-09-14');
assert.equal(nasdaqBars.at(-1).date, '2026-09-14');
assert.equal(nasdaqBars.at(-1).volume, 1200);

verifyMarketDataset({ dataThrough: '2026-09-14', bars: nasdaqBars }, {
  ticker: 'TEST', expectedDate: '2026-09-14', expectedClose: 22.5
});
assert.throws(() => verifyMarketDataset({ dataThrough: '2026-09-13', bars: nasdaqBars }, { ticker: 'TEST' }), /does not equal final OHLCV bar/);
assert.throws(() => verifyMarketDataset({ dataThrough: '2026-09-14', bars: nasdaqBars }, {
  ticker: 'TEST', expectedDate: '2026-09-14', expectedClose: 99
}), /does not equal final OHLCV close/);

const completeBars = Array.from({ length: 260 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 0, 6 + index * 2));
  const iso = date.toISOString().slice(0, 10);
  return { time: date.getTime() / 1000, date: iso, open: 10, high: 12, low: 9, close: 11, volume: 100 };
});
const complete = { dataThrough: completeBars.at(-1).date, bars: completeBars };
assert.equal(marketHistoryProfile(complete).dailyBars, 260);
verifyInitialMarketDataset(complete, { ticker: 'COMPLETE', minimums:{ dailyBars:252, weeklyBars:52 } });
assert.throws(
  () => verifyInitialMarketDataset({ dataThrough:nasdaqBars.at(-1).date, bars:nasdaqBars }, { ticker:'SHORT' }),
  /initial sync requires at least 252 daily candles/
);

console.log(JSON.stringify({
  status: 'PASS',
  checks: ['Yahoo normalization and cutoff', 'Nasdaq normalization', 'date equality gate', 'close equality gate', 'initial daily/weekly history gate']
}, null, 2));
