import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'elliott-cross-market-digest-v1';
const DAILY_EDITIONS = new Set(['morning', 'midday', 'close']);
const EDITION_RANK = { close:3, midday:2, morning:1, weekly:0 };

const clean = (value) => String(value ?? '').trim();
const validTimestamp = (value) => Boolean(clean(value)) && Number.isFinite(Date.parse(value));
const validDate = (value) => {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const signature = (value) => JSON.stringify(canonical(value));
const recordDate = (record) => record.cadence === 'weekly' ? record.weekStart : record.marketDate;
const slotKey = (record) => `${record.cadence}|${recordDate(record)}|${record.edition}`;
const revisionTime = (record) => Date.parse(record.updatedAt || record.publishedAt);

const validateLinks = (links, location) => {
  if (links == null) return;
  if (!Array.isArray(links)) throw new Error(`${location} must be an array`);
  links.forEach((link, index) => {
    if (!link || typeof link !== 'object' || !clean(link.label) || !clean(link.url)) throw new Error(`${location}[${index}] requires label and url`);
    let url;
    try { url = new URL(link.url); } catch { throw new Error(`${location}[${index}].url is invalid`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${location}[${index}].url must use http or https`);
  });
};

export function validateRecord(input, location = 'record') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${location} must be an object`);
  const record = JSON.parse(JSON.stringify(input));
  record.id = clean(record.id);
  record.cadence = clean(record.cadence);
  record.edition = clean(record.edition);
  record.title = clean(record.title);
  record.summary = clean(record.summary);
  record.timezone = clean(record.timezone) || 'America/Los_Angeles';
  if (!record.id) throw new Error(`${location}.id is required`);
  if (!['daily', 'weekly'].includes(record.cadence)) throw new Error(`${location}.cadence is invalid`);
  if (record.cadence === 'daily' && !DAILY_EDITIONS.has(record.edition)) throw new Error(`${location}.edition must be morning, midday, or close`);
  if (record.cadence === 'weekly' && record.edition !== 'weekly') throw new Error(`${location}.edition must be weekly`);
  if (record.cadence === 'daily' && !validDate(record.marketDate)) throw new Error(`${location}.marketDate is invalid`);
  if (record.cadence === 'weekly' && !validDate(record.weekStart)) throw new Error(`${location}.weekStart is invalid`);
  if (!validTimestamp(record.publishedAt)) throw new Error(`${location}.publishedAt is invalid`);
  if (record.updatedAt != null && !validTimestamp(record.updatedAt)) throw new Error(`${location}.updatedAt is invalid`);
  if (!record.title) throw new Error(`${location}.title is required`);
  if (!record.summary) throw new Error(`${location}.summary is required`);
  if (!Array.isArray(record.sections) || !record.sections.length) throw new Error(`${location}.sections must contain at least one section`);
  record.sections.forEach((section, index) => {
    if (!section || typeof section !== 'object') throw new Error(`${location}.sections[${index}] must be an object`);
    if (section.paragraphs != null && !Array.isArray(section.paragraphs)) throw new Error(`${location}.sections[${index}].paragraphs must be an array`);
    if (section.points != null && !Array.isArray(section.points)) throw new Error(`${location}.sections[${index}].points must be an array`);
    validateLinks(section.links, `${location}.sections[${index}].links`);
  });
  validateLinks(record.sources, `${location}.sources`);
  return record;
}

export function validateDataset(input, location = 'dataset') {
  if (!input || typeof input !== 'object' || input.schemaVersion !== SCHEMA_VERSION || !Array.isArray(input.records)) {
    throw new Error(`${location} must use ${SCHEMA_VERSION} and contain records[]`);
  }
  const ids = new Set();
  const slots = new Set();
  const records = input.records.map((record, index) => validateRecord(record, `${location}.records[${index}]`));
  records.forEach((record) => {
    if (ids.has(record.id)) throw new Error(`${location} contains duplicate id ${record.id}`);
    if (slots.has(slotKey(record))) throw new Error(`${location} contains duplicate slot ${slotKey(record)}`);
    ids.add(record.id);
    slots.add(slotKey(record));
  });
  return { schemaVersion:SCHEMA_VERSION, generatedAt:input.generatedAt || null, records };
}

const payloadRecords = (payload) => {
  if (Array.isArray(payload)) return payload.map((record, index) => validateRecord(record, `input[${index}]`));
  if (payload?.schemaVersion || Array.isArray(payload?.records)) return validateDataset(payload, 'input').records;
  return [validateRecord(payload, 'input')];
};

export function ingestPayload(existingInput, payload, generatedAt = new Date().toISOString()) {
  const existing = validateDataset(existingInput, 'store');
  const incoming = payloadRecords(payload);
  const incomingIds = new Set();
  const incomingSlots = new Set();
  incoming.forEach((record) => {
    if (incomingIds.has(record.id)) throw new Error(`input contains duplicate id ${record.id}`);
    if (incomingSlots.has(slotKey(record))) throw new Error(`input contains duplicate slot ${slotKey(record)}`);
    incomingIds.add(record.id);
    incomingSlots.add(slotKey(record));
  });
  const byId = new Map(existing.records.map((record) => [record.id, record]));
  const bySlot = new Map(existing.records.map((record) => [slotKey(record), record]));
  const stats = { added:0, updated:0, unchanged:0 };
  incoming.forEach((record) => {
    const previous = byId.get(record.id);
    const occupied = bySlot.get(slotKey(record));
    if (!previous && occupied) throw new Error(`slot ${slotKey(record)} is already owned by ${occupied.id}`);
    if (!previous) {
      byId.set(record.id, record);
      bySlot.set(slotKey(record), record);
      stats.added += 1;
      return;
    }
    if (slotKey(previous) !== slotKey(record)) throw new Error(`record ${record.id} cannot move between digest slots`);
    if (signature(previous) === signature(record)) {
      stats.unchanged += 1;
      return;
    }
    const previousRevision = revisionTime(previous);
    const nextRevision = revisionTime(record);
    if (nextRevision < previousRevision) throw new Error(`record ${record.id} is stale`);
    if (nextRevision === previousRevision) throw new Error(`record ${record.id} conflicts at the same revision; increment updatedAt`);
    byId.set(record.id, record);
    bySlot.set(slotKey(record), record);
    stats.updated += 1;
  });
  const records = [...byId.values()].sort((a, b) => recordDate(b).localeCompare(recordDate(a)) || (EDITION_RANK[b.edition] ?? -1) - (EDITION_RANK[a.edition] ?? -1) || revisionTime(b) - revisionTime(a));
  return {
    dataset: { schemaVersion:SCHEMA_VERSION, generatedAt:stats.added || stats.updated ? generatedAt : existing.generatedAt, records },
    stats
  };
}

export const renderBrowserDataset = (dataset) => `window.ELLIOTT_CROSS_MARKET_DIGESTS = ${JSON.stringify(dataset, null, 2)};\n`;

const atomicWrite = async (target, contents) => {
  await fs.mkdir(path.dirname(target), { recursive:true });
  const temporary = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temporary, contents, 'utf8');
  await fs.rename(temporary, target);
};

const parseArgs = (argv) => {
  const options = { store:'data-model/digests.json', browserOutput:'data-model/digest-data.js', check:false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--store') options.store = argv[++index];
    else if (arg === '--browser-output') options.browserOutput = argv[++index];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.input) throw new Error('usage: node scripts/ingest-digests.mjs --input <packet.json> [--check]');
  return options;
};

export async function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const inputPath = path.resolve(cwd, options.input);
  const storePath = path.resolve(cwd, options.store);
  const browserPath = path.resolve(cwd, options.browserOutput);
  const payload = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const existing = JSON.parse(await fs.readFile(storePath, 'utf8'));
  const result = ingestPayload(existing, payload);
  if (!options.check && (result.stats.added || result.stats.updated)) {
    await atomicWrite(storePath, `${JSON.stringify(result.dataset, null, 2)}\n`);
    await atomicWrite(browserPath, renderBrowserDataset(result.dataset));
  }
  return { ...result.stats, checked:options.check, records:result.dataset.records.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((result) => console.log(JSON.stringify({ status:'PASS', ...result }, null, 2))).catch((error) => {
    console.error(JSON.stringify({ status:'FAIL', error:error.message }, null, 2));
    process.exitCode = 1;
  });
}
