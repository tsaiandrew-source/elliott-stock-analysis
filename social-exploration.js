(() => {
  'use strict';

  const dataset = window.ELLIOTT_SOCIAL_EXPLORATION || { records:[], profiles:[], status:'BLOCKED' };
  const tableBody = document.getElementById('ticker-table-body');
  const emptyState = document.getElementById('empty-state');
  const resultCount = document.getElementById('result-count');
  const resetButton = document.getElementById('reset-filters');
  const profileMap = new Map((dataset.profiles || []).map((profile) => [profile.id, profile]));
  const state = { signal:'all', lane:'all', query:'', sort:'rank', direction:'asc' };
  const sortLabels = { rank:'探索排名', close:'收市價', move:'今日變動', signal:'結構狀態', rsi:'RSI', volume:'相對量', position:'20日位置' };
  const signalOrder = { positive:0, neutral:1, negative:2 };
  const signalMeta = {
    positive:{ label:'偏強', className:'positive' },
    neutral:{ label:'觀望', className:'neutral' },
    negative:{ label:'偏弱', className:'negative' }
  };

  const create = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value !== undefined && value !== null) element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' ? url.href : null;
    } catch (_) {
      return null;
    }
  };
  const number = (value, digits = 2) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits:digits, minimumFractionDigits:digits }).format(Number(value))
    : '—';
  const percent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${number(value)}%` : '—';
  const compact = (value) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:1 }).format(Number(value))
    : '—';

  function interpretation(record) {
    if (record.freshness === 'unavailable') return '沒有可驗證的完成交易資料，暫不判讀。';
    if (record.signal === 'positive') return '收盤高於 EMA20／EMA50，RSI 同步偏強。';
    if (record.signal === 'negative') return '收盤低於 EMA20／EMA50，RSI 同步偏弱。';
    return '價格、均線與 RSI 尚未形成一致方向。';
  }

  function momentumText(record) {
    const labels = { overbought:'超買／過熱', strong:'偏強', neutral:'中性', weak:'偏弱', oversold:'超賣' };
    const condition = record.rsi14 == null ? 'RSI 待補' : `RSI ${number(record.rsi14, 1)}`;
    const ema = record.ema20 == null || record.ema50 == null ? 'EMA 待補' : `EMA20 ${number(record.ema20)} · EMA50 ${number(record.ema50)}`;
    return { label:labels[record.momentum] || '中性', note:`${condition} · ${ema}` };
  }

  function appendCell(row, label, children, className = '') {
    const cell = document.createElement('td');
    cell.dataset.label = label;
    if (className) cell.className = className;
    for (const child of Array.isArray(children) ? children : [children]) if (child) cell.append(child);
    row.append(cell);
    return cell;
  }

  function buildRow(record) {
    const row = document.createElement('tr');
    row.dataset.ticker = record.ticker;
    const meta = record.freshness === 'unavailable'
      ? { label:'資料待補', className:'unavailable' }
      : (signalMeta[record.signal] || signalMeta.neutral);
    const moveClass = Number(record.dayChangePct) > 0 ? 'move-up' : Number(record.dayChangePct) < 0 ? 'move-down' : '';
    const momentum = momentumText(record);

    appendCell(row, '股票代號', [create('span', record.ticker, 'ticker-main'), create('span', `#${record.rank} · ${record.company}`, 'cell-note')]);
    appendCell(row, '收市價', [create('span', record.close == null ? '—' : `$${number(record.close)}`, 'ticker-main'), create('span', record.dataThrough || '—', 'cell-note')], 'numeric');
    appendCell(row, '今日變動', [create('span', percent(record.dayChangePct), `ticker-main ${moveClass}`), create('span', `前收 $${number(record.previousClose)}`, 'cell-note')], 'numeric');
    appendCell(row, '結構判讀', [create('span', meta.label, `state-badge ${meta.className}`), create('span', interpretation(record), 'cell-note')]);
    appendCell(row, 'RSI／動能', [create('span', momentum.label, 'ticker-main'), create('span', momentum.note, 'cell-note')]);
    appendCell(row, '相對量', [create('span', record.relativeVolume20 == null ? '—' : `${number(record.relativeVolume20)}×`, 'ticker-main'), create('span', `20日均量 ${compact(record.averageVolume20)}`, 'cell-note')], 'full-only');
    appendCell(row, '20日位置', [create('span', record.rangePosition20 == null ? '—' : `${number(record.rangePosition20, 0)}%`, 'ticker-main'), create('span', `$${number(record.low20)}–$${number(record.high20)}`, 'cell-note')], 'full-only');

    const business = document.createElement('div');
    const reportPeriod = String(record.businessReportPeriod || '').trim();
    const rawBusinessDigest = String(record.businessDigest || '最新季報摘要待補。').trim();
    const businessDigest = reportPeriod && rawBusinessDigest.startsWith(reportPeriod)
      ? rawBusinessDigest.slice(reportPeriod.length).trim()
      : rawBusinessDigest;
    business.append(create('span', businessDigest, 'digest-copy'));
    if (reportPeriod) business.prepend(create('span', `最新季報 · ${reportPeriod}`, 'digest-kicker'));
    appendCell(row, '營運摘要', business, 'digest-cell');

    const news = document.createElement('div');
    news.append(create('span', record.newsDigest || '近期新聞摘要待補。', 'digest-copy'));
    appendCell(row, '新聞摘要', news, 'digest-cell');

    const sourceCell = document.createElement('div');
    const sourceDetails = create('details', null, 'source-details profile-sources');
    sourceDetails.append(create('summary', `${(record.profileIds || []).length} 個來源`));
    const links = create('div', null, 'source-links');
    for (const id of record.profileIds || []) {
      const profile = profileMap.get(id);
      const href = safeUrl(profile?.url);
      if (!profile || !href) continue;
      const link = create('a', profile.label);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    }
    if (links.children.length) sourceDetails.append(links);
    sourceCell.append(sourceDetails);
    appendCell(row, '來源', sourceCell);
    return row;
  }

  function compare(a, b) {
    const direction = state.direction === 'asc' ? 1 : -1;
    let left;
    let right;
    if (state.sort === 'rank') { left = Number(a.rank); right = Number(b.rank); }
    else if (state.sort === 'close') { left = Number(a.close); right = Number(b.close); }
    else if (state.sort === 'move') { left = Number(a.dayChangePct); right = Number(b.dayChangePct); }
    else if (state.sort === 'signal') { left = signalOrder[a.signal] ?? 9; right = signalOrder[b.signal] ?? 9; }
    else if (state.sort === 'rsi') { left = Number(a.rsi14); right = Number(b.rsi14); }
    else if (state.sort === 'volume') { left = Number(a.relativeVolume20); right = Number(b.relativeVolume20); }
    else { left = Number(a.rangePosition20); right = Number(b.rangePosition20); }
    if (!Number.isFinite(left)) left = -Infinity;
    if (!Number.isFinite(right)) right = -Infinity;
    if (left === right) return Number(a.rank) - Number(b.rank);
    return (left - right) * direction;
  }

  function visibleRecords() {
    const query = state.query.trim().toUpperCase();
    return [...(dataset.records || [])].filter((record) => {
      if (state.signal !== 'all' && record.signal !== state.signal) return false;
      if (state.lane !== 'all' && record.lane !== state.lane) return false;
      return !query || `${record.ticker} ${record.company}`.toUpperCase().includes(query);
    }).sort(compare);
  }

  function updateResetState() {
    resetButton.disabled = state.signal === 'all' && state.lane === 'all' && !state.query;
  }

  function render() {
    const records = visibleRecords();
    tableBody.replaceChildren(...records.map(buildRow));
    emptyState.hidden = records.length > 0;
    document.querySelector('.table-shell').hidden = records.length === 0;
    resultCount.textContent = `顯示 ${records.length}／${(dataset.records || []).length} 檔`;
    document.getElementById('sort-status').textContent = `目前排序：${sortLabels[state.sort]}${state.direction === 'desc' ? '（高至低）' : ''}`;
    updateResetState();
  }

  function updateSummary() {
    const records = dataset.records || [];
    const counts = {
      positive:records.filter((record) => record.freshness !== 'unavailable' && record.signal === 'positive').length,
      neutral:records.filter((record) => record.freshness !== 'unavailable' && record.signal === 'neutral').length,
      negative:records.filter((record) => record.freshness !== 'unavailable' && record.signal === 'negative').length,
      unavailable:records.filter((record) => record.freshness === 'unavailable').length
    };
    for (const key of ['positive','neutral','negative','unavailable']) document.getElementById(`${key}-count`).textContent = counts[key];
    for (const key of ['positive','neutral','negative']) document.getElementById(`filter-${key}-count`).textContent = counts[key];
    const freshness = document.querySelector('.freshness');
    freshness.classList.add(dataset.status === 'PASS' ? 'is-pass' : dataset.status === 'BLOCKED' ? 'is-blocked' : 'is-partial');
    document.getElementById('data-status').textContent = dataset.status === 'PASS' ? '技術資料完整' : dataset.status === 'PARTIAL_PASS' ? '部分資料可用' : '資料尚未完成';
    const marketCount = records.filter((record) => record.freshness === 'current').length;
    const newsCount = records.filter((record) => record.newsFreshness === 'current').length;
    document.getElementById('data-cutoff').textContent = `${dataset.dataThrough || '—'} 正式收盤；技術 ${marketCount}/${records.length}、新聞 ${newsCount}/${records.length}`;
    document.getElementById('source-disclosure').textContent = dataset.sourceDisclosure || '';
  }

  function renderProfiles() {
    const grid = document.getElementById('profile-grid');
    const items = (dataset.profiles || []).map((profile) => {
      const href = safeUrl(profile.url);
      const item = create(href ? 'a' : 'div', null, 'profile-item');
      if (href) { item.href = href; item.target = '_blank'; item.rel = 'noopener noreferrer'; }
      item.append(create('strong', profile.label), create('span', `${profile.platform} · ${profile.accessState === 'readable_partial' ? '部分可讀' : '已追蹤'}`));
      return item;
    });
    grid.replaceChildren(...items);
  }

  document.querySelectorAll('.filter-group').forEach((group) => {
    const key = group.dataset.filter;
    group.querySelectorAll('.filter-chip').forEach((button) => button.addEventListener('click', () => {
      state[key] = button.dataset.value;
      group.querySelectorAll('.filter-chip').forEach((peer) => {
        const active = peer === button;
        peer.classList.toggle('is-active', active);
        peer.setAttribute('aria-pressed', String(active));
      });
      render();
    }));
  });

  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    const next = button.dataset.sort;
    if (state.sort === next) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    else { state.sort = next; state.direction = next === 'rank' ? 'asc' : 'desc'; }
    render();
  }));

  document.getElementById('ticker-search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  resetButton.addEventListener('click', () => {
    state.signal = 'all'; state.lane = 'all'; state.query = '';
    document.getElementById('ticker-search').value = '';
    document.querySelectorAll('.filter-group').forEach((group) => group.querySelectorAll('.filter-chip').forEach((button) => {
      const active = button.dataset.value === 'all';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }));
    render();
  });

  updateSummary();
  renderProfiles();
  render();
})();
