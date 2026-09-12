import assert from 'node:assert/strict';

export const SCHEMA_VERSION = 'universal-refresh-gex-v1';
export const UNIVERSE = Object.freeze([
  'LITE', 'NBIS', 'PLTR', 'IREN', 'NOK', 'ACHR', 'CSCO', 'AMKR',
  'ONDS', 'NVDA', 'MRVL', 'SNDK', 'AVGO', '2646', '2330'
]);

const STATUSES = new Set(['renderable', 'aggregate_only', 'not_available', 'not_applicable']);
const REQUIRED_EXPIRATION_FIELDS = [
  'expiry', 'status', 'dataThrough', 'sourceCutoff', 'strikes', 'exposure',
  'exposureType', 'magnet', 'gammaFlip', 'dealerCallWall', 'dealerPutWall',
  'sourceProvider', 'sourceUrl', 'calculationMethod', 'limitations',
  'displayText', 'labels', 'freshness'
];
const REQUIRED_LABELS = [
  'expiry', 'status', 'dataThrough', 'sourceCutoff', 'strikes', 'exposure',
  'magnet', 'gammaFlip', 'dealerCallWall', 'dealerPutWall', 'sourceProvider',
  'sourceUrl', 'calculationMethod', 'limitations'
];

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isHttpUrl = (value) => {
  if (!isNonEmptyString(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
const fail = (location, message) => { throw new Error(`${location}: ${message}`); };

function validateExpiration(expiration, location, expectedStatus) {
  if (!isObject(expiration)) fail(location, 'must be an object');
  for (const field of REQUIRED_EXPIRATION_FIELDS) {
    if (!(field in expiration)) fail(location, `missing ${field}`);
  }
  if (!isNonEmptyString(expiration.expiry) && expiration.status !== 'not_applicable') fail(location, 'expiry is required');
  if (!STATUSES.has(expiration.status)) fail(location, `invalid status ${expiration.status}`);
  if (expiration.status !== expectedStatus) fail(location, `status must match record status ${expectedStatus}`);
  if (!isDate(expiration.dataThrough)) fail(location, 'dataThrough must be YYYY-MM-DD');
  const notApplicable = expiration.status === 'not_applicable';
  if (!notApplicable && !isNonEmptyString(expiration.sourceCutoff)) fail(location, 'sourceCutoff is required');
  if (!notApplicable && !isNonEmptyString(expiration.sourceProvider)) fail(location, 'sourceProvider is required');
  if (!notApplicable && !isHttpUrl(expiration.sourceUrl)) fail(location, 'sourceUrl must be http or https');
  if (!isNonEmptyString(expiration.calculationMethod)) fail(location, 'calculationMethod is required');
  if (!Array.isArray(expiration.limitations) || !expiration.limitations.every(isNonEmptyString)) fail(location, 'limitations must be a non-empty string array');
  if (!isNonEmptyString(expiration.displayText)) fail(location, 'displayText is required');
  if (!isObject(expiration.labels) || !REQUIRED_LABELS.every((key) => isNonEmptyString(expiration.labels[key]))) fail(location, 'labels are incomplete');
  if (!isObject(expiration.freshness) || (!notApplicable && (!isNonEmptyString(expiration.freshness.providerAsOfUtc) || !isNonEmptyString(expiration.freshness.retrievedAtUtc))) || !isDate(expiration.freshness.dataThroughDate) || !isNonEmptyString(expiration.freshness.quoteDelayDisclosureZh)) {
    fail(location, 'freshness is incomplete');
  }

  const strikes = expiration.strikes;
  const exposure = expiration.exposure;
  if (!Array.isArray(strikes) || !Array.isArray(exposure)) fail(location, 'strikes and exposure must be arrays');
  if (expiration.status === 'not_available' || expiration.status === 'not_applicable') {
    if (strikes.length !== 0 || exposure.length !== 0) fail(location, 'unavailable/non-applicable arrays must be empty');
  } else {
    if (!strikes.length || strikes.length !== exposure.length) fail(location, 'strikes and exposure must be non-empty and equal length');
    if (!strikes.every(isFiniteNumber) || !exposure.every(isFiniteNumber)) fail(location, 'strikes and exposure must contain finite numbers');
  }

  const expectedExposureType = {
    renderable: 'signed_dealer_gex',
    aggregate_only: 'unsigned_gamma_sensitivity',
    not_available: 'not_available',
    not_applicable: 'not_applicable'
  }[expiration.status];
  if (expiration.exposureType !== expectedExposureType) fail(location, `exposureType must be ${expectedExposureType}`);

  for (const field of ['magnet', 'gammaFlip', 'dealerCallWall', 'dealerPutWall']) {
    if (expiration[field] != null && !isFiniteNumber(expiration[field])) fail(location, `${field} must be null or finite`);
    if (expiration.status !== 'renderable' && expiration[field] != null) fail(location, `${field} must be null without signed evidence`);
  }
  return expiration;
}

export function validatePacket(packet, location = 'packet') {
  if (!isObject(packet)) fail(location, 'must be an object');
  if (packet.schemaVersion !== SCHEMA_VERSION) fail(location, `schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isNonEmptyString(packet.batchId)) fail(location, 'batchId is required');
  if (!isDate(packet.analysisDate)) fail(location, 'analysisDate must be YYYY-MM-DD');
  if (!isNonEmptyString(packet.createdAt)) fail(location, 'createdAt is required');
  if (packet.appendOnly !== true) fail(location, 'appendOnly must be true');
  if (!Array.isArray(packet.records) || packet.records.length !== UNIVERSE.length) fail(location, `records must contain exactly ${UNIVERSE.length} tickers`);
  if (packet.tickerCount !== packet.records.length) fail(location, 'tickerCount must match records length');

  const seen = new Set();
  packet.records.forEach((record, index) => {
    const recordLocation = `${location}.records[${index}]`;
    if (!isObject(record)) fail(recordLocation, 'must be an object');
    if (!isNonEmptyString(record.ticker) || !UNIVERSE.includes(record.ticker)) fail(recordLocation, 'ticker is outside the locked universe');
    if (seen.has(record.ticker)) fail(recordLocation, `duplicate ticker ${record.ticker}`);
    seen.add(record.ticker);
    if (!isNonEmptyString(record.runId)) fail(recordLocation, 'runId is required');
    if (record.supersedesRunId != null && !isNonEmptyString(record.supersedesRunId)) fail(recordLocation, 'supersedesRunId must be null or a string');
    if (!STATUSES.has(record.status)) fail(recordLocation, `invalid status ${record.status}`);
    if (!isDate(record.dataThrough)) fail(recordLocation, 'dataThrough must be YYYY-MM-DD');
    if (!isNonEmptyString(record.displayText)) fail(recordLocation, 'displayText is required');
    if (!Array.isArray(record.limitations) || !record.limitations.every(isNonEmptyString)) fail(recordLocation, 'limitations must be a non-empty string array');
    validateExpiration(record.currentExpiration, `${recordLocation}.currentExpiration`, record.status);
    validateExpiration(record.nextExpiration, `${recordLocation}.nextExpiration`, record.status);
  });

  const expectedOrder = [...UNIVERSE].sort((a, b) => UNIVERSE.indexOf(a) - UNIVERSE.indexOf(b));
  assert.deepEqual([...seen].sort((a, b) => UNIVERSE.indexOf(a) - UNIVERSE.indexOf(b)), expectedOrder, `${location}: universe is incomplete`);
  return packet;
}

if (process.argv[1] && process.argv[1].endsWith('validate-universal-refresh-gex.mjs')) {
  const fs = await import('node:fs/promises');
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(JSON.stringify({ status: 'FAIL', error: 'usage: node scripts/validate-universal-refresh-gex.mjs <packet.json>' }, null, 2));
    process.exitCode = 1;
  } else {
    try {
      const packet = JSON.parse(await fs.readFile(inputPath, 'utf8'));
      validatePacket(packet);
      console.log(JSON.stringify({ status: 'PASS', schemaVersion: packet.schemaVersion, tickerCount: packet.records.length }, null, 2));
    } catch (error) {
      console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
      process.exitCode = 1;
    }
  }
}
