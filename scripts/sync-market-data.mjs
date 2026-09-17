import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCoverageRoster } from './coverage-roster.mjs';

const moduleRoot = fileURLToPath(new URL('..', import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
export const INITIAL_MARKET_HISTORY_MINIMUMS = Object.freeze({
  dailyBars: 252,
  weeklyBars: 52
});

function isoDate(value) {
  const text = String(value || '').trim();
  if (isoPattern.test(text)) return text;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return '';
}

function unixTime(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedBar({ date, time, open, high, low, close, volume }) {
  const normalizedDate = isoDate(date) || (Number.isFinite(Number(time)) ? new Date(Number(time) * 1000).toISOString().slice(0, 10) : '');
  const values = [open, high, low, close].map(finite);
  if (!normalizedDate || values.some((value) => value === null)) return null;
  return {
    time: Number.isFinite(Number(time)) ? Number(time) : unixTime(normalizedDate),
    date: normalizedDate,
    open: values[0],
    high: values[1],
    low: values[2],
    close: values[3],
    volume: finite(volume) ?? 0
  };
}

function normalizeYahoo(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  return timestamps.map((time, index) => normalizedBar({
    time,
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index]
  })).filter(Boolean);
}

function normalizeNasdaq(payload) {
  return (payload?.data?.chart || []).map((entry) => {
    const row = entry?.z || entry;
    return normalizedBar({
      date: row?.dateTime || row?.date,
      open: row?.open,
      high: row?.high,
      low: row?.low,
      close: row?.close,
      volume: String(row?.volume ?? '').replace(/,/g, '')
    });
  }).filter(Boolean);
}

export function normalizeMarketArtifact(payload, expectedDate) {
  const sourceBars = Array.isArray(payload?.bars)
    ? payload.bars.map(normalizedBar).filter(Boolean)
    : (payload?.chart?.result ? normalizeYahoo(payload) : normalizeNasdaq(payload));
  const deduped = new Map();
  for (const bar of sourceBars) if (!expectedDate || bar.date <= expectedDate) deduped.set(bar.date, bar);
  const bars = [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!bars.length) throw new Error('source artifact has no completed-session OHLCV bars');
  return bars;
}

export function verifyMarketDataset(dataset, { ticker, expectedDate, expectedClose }) {
  if (!dataset || !Array.isArray(dataset.bars) || !dataset.bars.length) throw new Error(`${ticker}: normalized OHLCV is empty`);
  const last = dataset.bars.at(-1);
  if (!isoPattern.test(String(dataset.dataThrough || ''))) throw new Error(`${ticker}: dataThrough is not an ISO date`);
  if (last.date !== dataset.dataThrough) throw new Error(`${ticker}: dataThrough ${dataset.dataThrough} does not equal final OHLCV bar ${last.date}`);
  if (expectedDate && dataset.dataThrough !== expectedDate) throw new Error(`${ticker}: packet dataThrough ${expectedDate} does not equal final OHLCV bar ${last.date}`);
  if (Number.isFinite(Number(expectedClose))) {
    const tolerance = Math.max(0.011, Math.abs(Number(expectedClose)) * 0.000001);
    if (Math.abs(Number(last.close) - Number(expectedClose)) > tolerance) {
      throw new Error(`${ticker}: packet close ${expectedClose} does not equal final OHLCV close ${last.close}`);
    }
  }
  for (let index = 0; index < dataset.bars.length; index += 1) {
    const bar = dataset.bars[index];
    if (!isoPattern.test(String(bar.date || '')) || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every((value) => Number.isFinite(Number(value)))) {
      throw new Error(`${ticker}: invalid OHLCV bar at index ${index}`);
    }
    if (index && dataset.bars[index - 1].date >= bar.date) throw new Error(`${ticker}: OHLCV dates are not strictly increasing`);
  }
  return dataset;
}

function weekStart(date) {
  const monday = new Date(`${date}T00:00:00Z`);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

export function marketHistoryProfile(dataset) {
  const bars = Array.isArray(dataset?.bars) ? dataset.bars : [];
  return {
    dailyBars: bars.length,
    weeklyBars: new Set(bars.map((bar) => weekStart(bar.date))).size,
    firstDate: bars[0]?.date || '',
    lastDate: bars.at(-1)?.date || ''
  };
}

export function verifyInitialMarketDataset(dataset, options) {
  const verified = verifyMarketDataset(dataset, options);
  const profile = marketHistoryProfile(verified);
  const minimums = options.minimums || INITIAL_MARKET_HISTORY_MINIMUMS;
  if (profile.dailyBars < minimums.dailyBars) {
    throw new Error(`${options.ticker}: initial sync requires at least ${minimums.dailyBars} daily candles; found ${profile.dailyBars}`);
  }
  if (profile.weeklyBars < minimums.weeklyBars) {
    throw new Error(`${options.ticker}: initial sync requires at least ${minimums.weeklyBars} weekly candles; found ${profile.weeklyBars}`);
  }
  return verified;
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, contents, 'utf8');
  await fs.rename(temporary, file);
}

async function writeIfChanged(file, contents) {
  try {
    if (await fs.readFile(file, 'utf8') === contents) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await atomicWrite(file, contents);
  return true;
}

async function readLastPacket(stateDir) {
  const receipt = JSON.parse(await fs.readFile(path.join(stateDir, 'last-ingest.json'), 'utf8'));
  const result = [...(receipt.results || [])].reverse().find((item) => item.status === 'INGESTED_AND_READ_VISIBLE' && item.archivedPath);
  if (!result) throw new Error('last-ingest.json has no read-visible archived packet');
  return JSON.parse(await fs.readFile(result.archivedPath, 'utf8'));
}

function evidenceCandidates(packet) {
  return [...(packet?.priceSnapshot?.sourceEvidence || []), ...(packet?.sourceEvidence || [])]
    .filter((item) => item && item.path)
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.path === item.path) === index);
}

async function sourceDataset(packet, ticker) {
  const expectedDate = String(packet.dataThrough || packet.analysisDate || '').slice(0, 10);
  if (!isoPattern.test(expectedDate)) throw new Error(`${ticker}: packet dataThrough is invalid`);
  const errors = [];
  for (const evidence of evidenceCandidates(packet)) {
    try {
      const source = await fs.readFile(evidence.path);
      if (evidence.sha256 && sha256(source) !== evidence.sha256) throw new Error('SHA-256 mismatch');
      const payload = JSON.parse(source.toString('utf8'));
      const bars = normalizeMarketArtifact(payload, expectedDate);
      const dataset = {
        company: packet.company || ticker,
        exchange: packet.exchange || '',
        dataThrough: expectedDate,
        sourceCutoff: expectedDate,
        chartSource: evidence.url || packet.priceSnapshot?.sourceEvidence?.find((item) => item.url)?.url || '',
        bars
      };
      return verifyInitialMarketDataset(dataset, { ticker, expectedDate, expectedClose: packet.priceSnapshot?.value });
    } catch (error) {
      errors.push(`${evidence.path}: ${error.message}`);
    }
  }
  throw new Error(`${ticker}: no hash-valid completed-session OHLCV artifact matched the packet (${errors.join('; ') || 'no source path'})`);
}

export async function readMarketDatasets(repoRoot = moduleRoot) {
  const { order } = await loadCoverageRoster(repoRoot);
  const result = {};
  for (const ticker of order) {
    const file = path.join(repoRoot, 'chart-surface', 'partial-market-data', `${ticker}.json`);
    const dataset = JSON.parse(await fs.readFile(file, 'utf8'));
    result[ticker] = verifyInitialMarketDataset(dataset, { ticker });
  }
  return result;
}

export async function synchronizeMarketData({ repoRoot = moduleRoot, stateDir }) {
  if (!stateDir) throw new Error('stateDir is required to synchronize market data');
  const { order, companies } = await loadCoverageRoster(repoRoot);
  const batch = await readLastPacket(stateDir);
  const packets = new Map((batch.dailyPackets || []).map((packet) => [String(packet.ticker || '').toUpperCase(), packet]));
  const missing = order.filter((ticker) => !packets.has(ticker));
  const extra = [...packets.keys()].filter((ticker) => !order.includes(ticker));
  if (missing.length || extra.length) throw new Error(`market-data packet roster mismatch; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);

  const datasets = {};
  for (const ticker of order) {
    const packet = packets.get(ticker);
    const dataset = await sourceDataset(packet, ticker);
    dataset.company = packet.company || companies[ticker] || ticker;
    datasets[ticker] = dataset;
  }

  const directory = path.join(repoRoot, 'chart-surface', 'partial-market-data');
  await fs.mkdir(directory, { recursive: true });
  const changedFiles = [];
  const manifestTickers = {};
  for (const ticker of order) {
    const relative = `chart-surface/partial-market-data/${ticker}.json`;
    const contents = `${JSON.stringify(datasets[ticker])}\n`;
    if (await writeIfChanged(path.join(repoRoot, relative), contents)) changedFiles.push(relative);
    manifestTickers[ticker] = {
      dataThrough: datasets[ticker].dataThrough,
      close: datasets[ticker].bars.at(-1).close,
      sha256: sha256(contents)
    };
  }
  const manifest = {
    schemaVersion: 'elliott-completed-session-market-data-v1',
    sourceBatchId: batch.batchId || null,
    tickerOrder: order,
    tickers: manifestTickers
  };
  const manifestRelative = 'chart-surface/partial-market-data/MANIFEST.json';
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  if (await writeIfChanged(path.join(repoRoot, manifestRelative), manifestContents)) changedFiles.push(manifestRelative);
  return {
    status: 'MARKET_DATA_SYNCHRONIZED',
    batchId: batch.batchId || null,
    tickerCount: order.length,
    changedFiles,
    manifestSha256: sha256(manifestContents),
    dataThrough: Object.fromEntries(order.map((ticker) => [ticker, datasets[ticker].dataThrough]))
  };
}
