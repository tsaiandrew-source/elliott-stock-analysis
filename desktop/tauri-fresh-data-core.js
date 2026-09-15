export const MARKET_SCHEMA = 'elliott-completed-session-market-data-v1';
export const DIGEST_SCHEMA = 'elliott-cross-market-digest-v1';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isoDate(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function newestRecordTime(records = []) {
  return records
    .flatMap((record) => [record.updatedAt, record.publishedAt, record.sourceCutoffAt, record.marketDate])
    .filter(Boolean)
    .map(String)
    .sort()
    .at(-1) || '';
}

export function parseWindowAssignment(source, property) {
  const marker = `window.${property}`;
  const markerIndex = String(source || '').indexOf(marker);
  invariant(markerIndex >= 0, `${property} assignment is missing.`);
  const assignmentIndex = source.indexOf('=', markerIndex + marker.length);
  invariant(assignmentIndex >= 0, `${property} assignment is malformed.`);
  const endIndex = source.lastIndexOf(';');
  const json = source.slice(assignmentIndex + 1, endIndex > assignmentIndex ? endIndex : undefined).trim();
  return JSON.parse(json);
}

export async function sha256Hex(source, cryptoApi = globalThis.crypto) {
  invariant(cryptoApi?.subtle, 'SHA-256 verification is unavailable.');
  const bytes = new TextEncoder().encode(source);
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createMarketSnapshot({ contractSource, manifest, payloadSources, cryptoApi = globalThis.crypto }) {
  invariant(manifest?.schemaVersion === MARKET_SCHEMA, 'Market-data manifest schema is invalid.');
  invariant(manifest.sourceBatchId, 'Market-data source batch is missing.');
  const tickers = Array.isArray(manifest.tickerOrder) ? manifest.tickerOrder.map(String) : [];
  invariant(tickers.length > 0 && new Set(tickers).size === tickers.length, 'Market-data ticker roster is invalid.');
  invariant(
    Object.keys(manifest.tickers || {}).length === tickers.length && tickers.every((ticker) => manifest.tickers[ticker]),
    'Market-data manifest ticker set does not match its roster.'
  );

  const contract = parseWindowAssignment(contractSource, 'PROTOTYPE_DATA_CONTRACT');
  invariant(Array.isArray(contract.coverage), 'Published analysis contract has no coverage roster.');
  const coverage = new Map(contract.coverage.map((item) => [String(item.ticker || '').toUpperCase(), item]));
  const datasets = {};
  const dates = [];

  for (const ticker of tickers) {
    const expected = manifest.tickers?.[ticker];
    const source = payloadSources?.[ticker];
    invariant(expected && typeof source === 'string', `Market data is missing for ${ticker}.`);
    if (expected.sha256) {
      const actualHash = await sha256Hex(source, cryptoApi);
      invariant(actualHash === expected.sha256, `${ticker} market-data hash does not match the manifest.`);
    }

    const payload = JSON.parse(source);
    const lastBar = Array.isArray(payload.bars) ? payload.bars.at(-1) : null;
    const dataThrough = isoDate(payload.dataThrough);
    invariant(lastBar && dataThrough && isoDate(lastBar.date) === dataThrough, `${ticker} market data has an invalid completed-session boundary.`);
    invariant(dataThrough === isoDate(expected.dataThrough), `${ticker} market data does not match the manifest date.`);
    invariant(Number(lastBar.close) === Number(expected.close), `${ticker} market data does not match the manifest close.`);

    const coverageItem = coverage.get(ticker);
    invariant(coverageItem && isoDate(coverageItem.latestChartDate) === dataThrough, `${ticker} analysis contract and market data are out of sync.`);
    datasets[ticker] = payload;
    dates.push(dataThrough);
  }

  invariant(new Set(dates).size === 1, 'Market-data publication contains mixed completed-session dates.');

  return {
    schemaVersion: MARKET_SCHEMA,
    sourceBatchId: String(manifest.sourceBatchId || ''),
    dataThrough: dates[0],
    contractGeneratedAt: String(contract.generatedAt || ''),
    contract,
    manifest,
    datasets,
    fingerprint: JSON.stringify({
      sourceBatchId: manifest.sourceBatchId || '',
      contractGeneratedAt: contract.generatedAt || '',
      tickers: tickers.map((ticker) => [ticker, manifest.tickers[ticker].dataThrough, manifest.tickers[ticker].sha256])
    })
  };
}

export function createDigestSnapshot(dataset) {
  invariant(dataset?.schemaVersion === DIGEST_SCHEMA, 'Digest schema is invalid.');
  invariant(Array.isArray(dataset.records), 'Digest records are missing.');
  return {
    schemaVersion: DIGEST_SCHEMA,
    generatedAt: String(dataset.generatedAt || newestRecordTime(dataset.records)),
    dataset,
    fingerprint: JSON.stringify({
      generatedAt: dataset.generatedAt || '',
      records: dataset.records.map((record) => [record.id, record.revision, record.updatedAt, record.publishedAt])
    })
  };
}

function chooseMarket(cached, remote) {
  if (!remote) return cached || null;
  if (!cached) return remote;
  if (String(remote.dataThrough || '') < String(cached.dataThrough || '')) return cached;
  if (String(remote.dataThrough || '') === String(cached.dataThrough || '')
      && remote.contractGeneratedAt && cached.contractGeneratedAt
      && remote.contractGeneratedAt < cached.contractGeneratedAt) return cached;
  return remote;
}

function chooseDigests(cached, remote) {
  if (!remote) return cached || null;
  if (!cached) return remote;
  return String(remote.generatedAt || '') >= String(cached.generatedAt || '') ? remote : cached;
}

export function selectFreshestSnapshot(cached, remote) {
  return {
    schemaVersion: 1,
    fetchedAt: remote?.fetchedAt || cached?.fetchedAt || null,
    market: chooseMarket(cached?.market, remote?.market),
    digests: chooseDigests(cached?.digests, remote?.digests)
  };
}

export function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    market: snapshot?.market?.fingerprint || null,
    digests: snapshot?.digests?.fingerprint || null
  });
}
