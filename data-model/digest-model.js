(function (root) {
  'use strict';

  const SCHEMA_VERSION = 'elliott-cross-market-digest-v1';
  const EDITION_ORDER = { morning: 0, midday: 1, close: 2, weekly: 3 };
  const EDITION_LABELS = {
    morning: '晨間設定',
    midday: '午間訊號',
    close: '收盤綜合判讀',
    weekly: '每週總結與展望'
  };

  const clean = (value) => String(value ?? '').trim();
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
  const timestamp = (value) => {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const cadence = record.cadence === 'weekly' ? 'weekly' : record.cadence === 'daily' ? 'daily' : '';
    const edition = clean(record.edition);
    const expectedCadence = edition === 'weekly' ? 'weekly' : ['morning', 'midday', 'close'].includes(edition) ? 'daily' : '';
    if (!cadence || cadence !== expectedCadence || !clean(record.id)) return null;
    if (cadence === 'daily' && !isDate(record.marketDate)) return null;
    if (cadence === 'weekly' && !isDate(record.weekStart)) return null;
    return {
      ...record,
      id: clean(record.id),
      cadence,
      edition,
      title: clean(record.title) || EDITION_LABELS[edition],
      summary: clean(record.summary),
      timezone: clean(record.timezone) || 'America/Los_Angeles',
      sourceCutoff: clean(record.sourceCutoff),
      sections: Array.isArray(record.sections) ? record.sections : [],
      sources: Array.isArray(record.sources) ? record.sources : []
    };
  }

  function normalizeDataset(dataset) {
    if (!dataset || dataset.schemaVersion !== SCHEMA_VERSION || !Array.isArray(dataset.records)) {
      return { schemaVersion: SCHEMA_VERSION, generatedAt: null, records: [], error: 'invalid-dataset' };
    }
    const seen = new Set();
    const records = dataset.records.map(normalizeRecord).filter((record) => {
      if (!record || seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
    return { schemaVersion: SCHEMA_VERSION, generatedAt: dataset.generatedAt || null, records, error: null };
  }

  function groupRecords(records, cadence) {
    const groups = new Map();
    (records || []).filter((record) => record.cadence === cadence).forEach((record) => {
      const key = cadence === 'weekly' ? record.weekStart : record.marketDate;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({
        key,
        items: items.sort((a, b) => {
          const editionDelta = (EDITION_ORDER[a.edition] ?? 99) - (EDITION_ORDER[b.edition] ?? 99);
          return editionDelta || timestamp(a.publishedAt) - timestamp(b.publishedAt);
        })
      }));
  }

  function recordById(records, id) {
    return (records || []).find((record) => record.id === id) || null;
  }

  root.ELLIOTT_DIGEST_MODEL = {
    SCHEMA_VERSION,
    EDITION_LABELS,
    normalizeDataset,
    normalizeRecord,
    groupRecords,
    recordById
  };
})(typeof window === 'undefined' ? globalThis : window);
