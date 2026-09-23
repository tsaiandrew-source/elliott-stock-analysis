#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = path.join(root, 'data-model');
const rosterPath = path.join(modelDir, 'social-exploration-roster.json');
const digestPath = path.join(modelDir, 'social-exploration-news-digests.json');
const currentPath = path.join(modelDir, 'social-exploration.json');
const bundlePath = path.join(modelDir, 'social-exploration-data.js');
const historyDir = path.join(modelDir, 'social-exploration-history');
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(value);
  return match ? [match[1], match[2] ?? true] : [value, true];
}));
const requestedAsOf = typeof args['as-of'] === 'string' ? args['as-of'] : new Date().toISOString().slice(0, 10);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const rounded = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const isoDate = (value) => {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};
const addDays = (value, days) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const cjk = (value) => /[\u3400-\u9fff]/.test(String(value || ''));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsTerm = (text, term) => new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:$|[^a-z0-9])`, 'i').test(text);
let editorialDigests = new Map();

function automaticNewsDigest(entry, headline) {
  const text = String(headline || '').toLowerCase();
  const company = entry.company;
  if (/earnings|results|revenue|profit|quarter|guidance|outlook/.test(text)) {
    return `市場焦點轉向 ${company} 最新營運數字與展望。這類消息的意義在於檢驗成長是否同時改善獲利與現金流，後續仍要用下一季實績確認趨勢。`;
  }
  if (/analyst|rating|price target|upgrade|downgrade|buy|sell/.test(text)) {
    return `${company} 近期的注意力主要來自分析師評級或估值調整。這反映市場預期正在重新定價，並非公司營運本身已改變，仍需由財報與訂單驗證。`;
  }
  if (/partner|partnership|contract|customer|deal|collaborat|agreement/.test(text)) {
    return `${company} 的合作、客戶或合約進展成為近期焦點。市場在意這項進展能否轉成可辨識的收入與訂單，而不只是策略性消息。`;
  }
  if (/launch|product|platform|service|chip|model|ai\b|artificial intelligence/.test(text)) {
    return `${company} 的產品或技術進展正在吸引市場注意。短線題材有助提高能見度，但真正影響仍取決於採用速度、商業化收入與利潤貢獻。`;
  }
  if (/offering|financ|debt|convertible|capital|funding|acqui|merger/.test(text)) {
    return `${company} 的融資、資本配置或企業交易成為近期焦點。市場會衡量成長資源增加的效益，是否足以抵銷稀釋、負債或整合風險。`;
  }
  if (/lawsuit|court|regulat|investigat|antitrust|approval/.test(text)) {
    return `${company} 近期受到法律或監管進展影響。這類事件可能改變成本與執行風險，在結果明朗前不宜直接視為營運趨勢反轉。`;
  }
  if (/dividend|buyback|repurchase/.test(text)) {
    return `${company} 的股東回饋或資本配置受到關注。這可支持投資人信心，但不取代對營收、獲利與自由現金流持續性的檢驗。`;
  }
  return `${company} 出現新的公司相關報導並提高市場討論度。目前較像注意力事件，是否改變中期判讀仍要由後續營運數字、訂單或正式公司進展確認。`;
}

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) result = (value - result) * multiplier + result;
  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(0, change)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(0, -change)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

function normalizeBars(payload, asOf) {
  const deduped = new Map();
  for (const entry of payload?.data?.chart || []) {
    const row = entry?.z || entry;
    const date = isoDate(row?.dateTime || row?.date);
    const bar = {
      date,
      open:number(row?.open),
      high:number(row?.high),
      low:number(row?.low),
      close:number(row?.close),
      volume:number(row?.volume) ?? 0
    };
    if (date && date <= asOf && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) deduped.set(date, bar);
  }
  return [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeBars(bars) {
  if (bars.length < 51) throw new Error(`insufficient completed-session history (${bars.length} bars)`);
  const latest = bars.at(-1);
  const previous = bars.at(-2);
  const closes = bars.map((bar) => bar.close);
  const lookback = bars.slice(-20);
  const priorVolumes = bars.slice(-21, -1).map((bar) => bar.volume).filter((value) => value > 0);
  const averageVolume20 = priorVolumes.length ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length : null;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const high20 = Math.max(...lookback.map((bar) => bar.high));
  const low20 = Math.min(...lookback.map((bar) => bar.low));
  const dayChangePct = previous.close ? ((latest.close / previous.close) - 1) * 100 : null;
  const relativeVolume20 = averageVolume20 ? latest.volume / averageVolume20 : null;
  const rangePosition20 = high20 === low20 ? 50 : ((latest.close - low20) / (high20 - low20)) * 100;
  let signal = 'neutral';
  if (latest.close > ema20 && ema20 > ema50 && rsi14 >= 55) signal = 'positive';
  if (latest.close < ema20 && ema20 < ema50 && rsi14 <= 45) signal = 'negative';
  let momentum = 'neutral';
  if (rsi14 >= 70) momentum = 'overbought';
  else if (rsi14 >= 55) momentum = 'strong';
  else if (rsi14 <= 30) momentum = 'oversold';
  else if (rsi14 <= 45) momentum = 'weak';
  return {
    dataThrough:latest.date,
    close:rounded(latest.close),
    previousClose:rounded(previous.close),
    dayChangePct:rounded(dayChangePct),
    volume:latest.volume,
    averageVolume20:rounded(averageVolume20, 0),
    relativeVolume20:rounded(relativeVolume20),
    rsi14:rounded(rsi14, 1),
    ema20:rounded(ema20),
    ema50:rounded(ema50),
    high20:rounded(high20),
    low20:rounded(low20),
    rangePosition20:rounded(rangePosition20, 0),
    signal,
    momentum
  };
}

async function fetchTicker(entry) {
  const fromDate = addDays(requestedAsOf, -420);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(entry.ticker)}/chart?assetclass=stocks&fromdate=${fromDate}&todate=${requestedAsOf}`;
  const response = await fetch(url, {
    cache:'no-store',
    headers:{
      accept:'application/json, text/plain, */*',
      'accept-language':'en-US,en;q=0.9',
      origin:'https://www.nasdaq.com',
      referer:`https://www.nasdaq.com/market-activity/stocks/${entry.ticker.toLowerCase()}`,
      'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36'
    },
    signal:AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Nasdaq HTTP ${response.status}`);
  const bars = normalizeBars(await response.json(), requestedAsOf);
  const market = summarizeBars(bars);
  const newsUrl = `https://api.nasdaq.com/api/news/topic/articlebysymbol?q=${encodeURIComponent(`${entry.ticker}|stocks`)}&limit=30&offset=0`;
  let news = { newsFreshness:'unavailable', newsError:'No recent symbol news returned' };
  try {
    const newsResponse = await fetch(newsUrl, {
      cache:'no-store',
      headers:{
        accept:'application/json, text/plain, */*',
        'accept-language':'en-US,en;q=0.9',
        origin:'https://www.nasdaq.com',
        referer:`https://www.nasdaq.com/market-activity/stocks/${entry.ticker.toLowerCase()}/news-headlines`,
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36'
      },
      signal:AbortSignal.timeout(25_000)
    });
    if (!newsResponse.ok) throw new Error(`Nasdaq news HTTP ${newsResponse.status}`);
    const rows = (await newsResponse.json())?.data?.rows || [];
    const ticker = entry.ticker.toLowerCase();
    const companyTokens = entry.company.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !['group','technology','technologies','systems','platforms'].includes(token));
    const score = (row) => {
      const primary = String(row.primarysymbol || '').toLowerCase();
      const haystack = `${row.title || ''} ${row.description || ''}`.toLowerCase();
      const related = (row.related_symbols || []).some((symbol) => String(symbol).toLowerCase().split('|')[0] === ticker);
      return (primary === ticker ? 8 : 0) + (containsTerm(haystack, ticker) ? 4 : 0) + (companyTokens.some((token) => containsTerm(haystack, token)) ? 3 : 0) + (related ? 1 : 0);
    };
    const editorial = editorialDigests.get(entry.ticker);
    const sourceOverride = editorial?.replaceSource && requestedAsOf <= editorial.expiresAfter ? {
      title:editorial.sourceHeadline,
      url:editorial.sourceUrl,
      publisher:editorial.publisher,
      created:editorial.publishedLabel,
      description:''
    } : null;
    const selected = sourceOverride || [...rows].map((row, index) => ({ row, index, score:score(row) })).filter((item) => item.score > 1).sort((a, b) => b.score - a.score || a.index - b.index)[0]?.row;
    if (selected) {
      const articleUrl = String(selected.url || '').startsWith('http') ? selected.url : `https://www.nasdaq.com${selected.url || ''}`;
      const sourceHeadline = String(selected.title || '').trim();
      const matchingEditorial = editorial?.sourceHeadline === sourceHeadline && cjk(editorial.digest) ? editorial : null;
      const newsDigest = matchingEditorial?.digest || automaticNewsDigest(entry, sourceHeadline);
      news = {
        newsFreshness:'current',
        newsHeadline:sourceHeadline,
        newsDigest,
        newsDigestLanguage:'zh-Hant',
        newsDigestMethod:matchingEditorial ? 'editorial' : 'rule-based-zh-Hant',
        newsPublisher:String(selected.publisher || 'Nasdaq').trim(),
        newsPublishedLabel:String(selected.created || selected.ago || '').trim(),
        newsUrl:articleUrl,
        newsSourceUrl:newsUrl,
        newsAttentionBasis:'Nasdaq symbol-news results: newest exact-symbol item, otherwise newest related-symbol item; visible digest is a Traditional Chinese event-category summary and never copies the headline'
      };
    }
  } catch (error) {
    news = { newsFreshness:'unavailable', newsError:error.message, newsSourceUrl:newsUrl };
  }
  return { ...entry, ...market, ...news, freshness:'current', sourceUrl:url };
}

async function mapLimited(entries, limit, mapper) {
  const output = new Array(entries.length);
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      try { output[index] = await mapper(entries[index], index); }
      catch (error) { output[index] = { ...entries[index], freshness:'unavailable', error:error.message }; }
      await sleep(160);
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, entries.length) }, worker));
  return output;
}

async function readExisting() {
  try { return JSON.parse(await fs.readFile(currentPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomicWrite(file, content) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, file);
}

const roster = JSON.parse(await fs.readFile(rosterPath, 'utf8'));
const digestModel = JSON.parse(await fs.readFile(digestPath, 'utf8'));
editorialDigests = new Map(Object.entries(digestModel.digests || {}));
const existing = await readExisting();
const existingByTicker = new Map((existing?.records || []).map((record) => [record.ticker, record]));
const fetched = await mapLimited(roster.tickers, 4, fetchTicker);
const records = fetched.map((record) => {
  if (record.freshness !== 'unavailable') {
    if (record.newsFreshness === 'current') return record;
    const lastGood = existingByTicker.get(record.ticker);
    return lastGood?.newsHeadline && cjk(lastGood.newsDigest)
      ? { ...record, newsFreshness:'stale', newsHeadline:lastGood.newsHeadline, newsDigest:lastGood.newsDigest, newsDigestLanguage:'zh-Hant', newsPublisher:lastGood.newsPublisher, newsPublishedLabel:lastGood.newsPublishedLabel, newsUrl:lastGood.newsUrl, newsAttentionBasis:lastGood.newsAttentionBasis }
      : record;
  }
  const lastGood = existingByTicker.get(record.ticker);
  return lastGood ? { ...lastGood, rank:record.rank, lane:record.lane, company:record.company, profileIds:record.profileIds, freshness:'stale', error:record.error } : record;
});
const completed = records.filter((record) => record.freshness === 'current' && record.dataThrough);
const newsCompleted = records.filter((record) => record.newsFreshness === 'current' && record.newsDigest);
const dates = completed.map((record) => record.dataThrough);
const dataThrough = dates.sort((a, b) => dates.filter((date) => date === b).length - dates.filter((date) => date === a).length || b.localeCompare(a))[0] || existing?.dataThrough || null;
const dataset = {
  schemaVersion:'social-exploration-daily-v1',
  rosterId:roster.rosterId,
  generatedAt:new Date().toISOString(),
  requestedAsOf,
  dataThrough,
  status:completed.length === roster.tickers.length && newsCompleted.length === roster.tickers.length ? 'PASS' : completed.length || newsCompleted.length ? 'PARTIAL_PASS' : 'BLOCKED',
  completeness:{ marketData:`${completed.length}/${roster.tickers.length}`, newsDigests:`${newsCompleted.length}/${roster.tickers.length}` },
  method:'social_exploration',
  records,
  profiles:roster.profiles,
  exclusion:roster.exclusion,
  sourceDisclosure:'價格與成交量採用 Nasdaq 完成交易資料，技術指標於本機計算；社群帳號僅作為探索線索，不直接視為投資結論。新聞欄為繁中編輯摘要，不複製原文。'
};
const json = `${JSON.stringify(dataset, null, 2)}\n`;
await fs.mkdir(historyDir, { recursive:true });
await atomicWrite(currentPath, json);
await atomicWrite(bundlePath, `window.ELLIOTT_SOCIAL_EXPLORATION = ${JSON.stringify(dataset)};\n`);
if (dataThrough) {
  const historyPath = path.join(historyDir, `${dataThrough}.json`);
  try { await fs.access(historyPath); }
  catch (error) { if (error.code === 'ENOENT') await atomicWrite(historyPath, json); else throw error; }
}
console.log(JSON.stringify({ status:dataset.status, rosterId:dataset.rosterId, dataThrough, current:completed.length, stale:records.filter((record) => record.freshness === 'stale').length, unavailable:records.filter((record) => record.freshness === 'unavailable').length }, null, 2));
