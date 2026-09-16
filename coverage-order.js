// Generated from coverage-roster.json by scripts/generate-coverage-order.mjs.
(() => {
  const entries = Object.freeze([
  {
    "ticker": "LITE",
    "company": "Lumentum Holdings",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "NBIS",
    "company": "Nebius Group",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "PLTR",
    "company": "Palantir Technologies",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "IREN",
    "company": "IREN Limited",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "NOK",
    "company": "Nokia",
    "exchange": "NYSE",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "ACHR",
    "company": "Archer Aviation",
    "exchange": "NYSE",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "CSCO",
    "company": "Cisco Systems",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "AMKR",
    "company": "Amkor Technology",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "ONDS",
    "company": "Ondas Holdings",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "NVDA",
    "company": "NVIDIA",
    "exchange": "NASDAQ",
    "coverageGroup": "exploration",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "MRVL",
    "company": "Marvell Technology",
    "exchange": "NASDAQ",
    "coverageGroup": "exploration",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "SNDK",
    "company": "Sandisk",
    "exchange": "NASDAQ",
    "coverageGroup": "exploration",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "AVGO",
    "company": "Broadcom",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "MU",
    "company": "Micron Technology",
    "exchange": "NASDAQ",
    "coverageGroup": "tracking",
    "marketGroup": "us",
    "defaultView": "daily"
  },
  {
    "ticker": "2646",
    "company": "星宇航空",
    "exchange": "TWSE",
    "coverageGroup": "tracking",
    "marketGroup": "twse",
    "defaultView": "daily"
  },
  {
    "ticker": "2330",
    "company": "台積電",
    "exchange": "TWSE",
    "coverageGroup": "exploration",
    "marketGroup": "twse",
    "defaultView": "daily"
  }
].map((entry) => Object.freeze(entry)));
  const byTicker = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry])));
  const order = Object.freeze(entries.map((entry) => entry.ticker));
  const companies = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.company])));
  const groups = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.coverageGroup])));
  const markets = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.marketGroup])));
  const exchanges = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.exchange])));
  const defaultViews = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.ticker, entry.defaultView])));
  const rankByTicker = new Map(order.map((ticker, index) => [ticker, index]));
  const normalizeTicker = (value) => String(value ?? '').trim().toUpperCase();
  const rank = (item) => {
    const position = rankByTicker.get(normalizeTicker(item?.ticker));
    return position === undefined ? order.length : position;
  };
  const sort = (items) => items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);

  window.PROTOTYPE_COVERAGE_ROSTER = entries;
  window.PROTOTYPE_COVERAGE_BY_TICKER = byTicker;
  window.PROTOTYPE_COVERAGE_ORDER = order;
  window.PROTOTYPE_COVERAGE_COMPANIES = companies;
  window.PROTOTYPE_COVERAGE_GROUPS = groups;
  window.PROTOTYPE_COVERAGE_MARKETS = markets;
  window.PROTOTYPE_COVERAGE_EXCHANGES = exchanges;
  window.PROTOTYPE_COVERAGE_DEFAULT_VIEWS = defaultViews;
  window.PROTOTYPE_COVERAGE_SORT_RANK = rank;
  window.PROTOTYPE_SORT_COVERAGE = sort;
})();
