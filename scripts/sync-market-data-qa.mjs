import assert from 'node:assert/strict';
import { normalizeMarketArtifact, verifyMarketDataset } from './sync-market-data.mjs';

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

console.log(JSON.stringify({
  status: 'PASS',
  checks: ['Yahoo normalization and cutoff', 'Nasdaq normalization', 'date equality gate', 'close equality gate']
}, null, 2));
