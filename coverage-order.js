(() => {
  const order = Object.freeze([
    'LITE', 'NBIS', 'PLTR', 'IREN', 'NOK', 'ACHR', 'CSCO', 'AMKR', 'ONDS',
    'NVDA', 'MRVL', 'SNDK', 'AVGO', 'OKLO', '2646', '2330'
  ]);
  const companies = Object.freeze({
    LITE: 'Lumentum Holdings', NBIS: 'Nebius Group', PLTR: 'Palantir Technologies',
    IREN: 'IREN Limited', NOK: 'Nokia', ACHR: 'Archer Aviation', CSCO: 'Cisco Systems',
    AMKR: 'Amkor Technology', ONDS: 'Ondas Holdings', NVDA: 'NVIDIA',
    MRVL: 'Marvell Technology', SNDK: 'Sandisk', AVGO: 'Broadcom',
    '2646': '星宇航空', '2330': '台積電'
  });
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

  window.PROTOTYPE_COVERAGE_ORDER = order;
  window.PROTOTYPE_COVERAGE_COMPANIES = companies;
  window.PROTOTYPE_COVERAGE_SORT_RANK = rank;
  window.PROTOTYPE_SORT_COVERAGE = sort;
})();
