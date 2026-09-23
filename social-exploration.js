(() => {
  'use strict';
  const dataset = window.ELLIOTT_SOCIAL_EXPLORATION || { records:[], profiles:[], status:'BLOCKED' };
  const state = { lane:'all', signal:'all', query:'', sort:'rank' };
  const grid = document.getElementById('ticker-grid');
  const empty = document.getElementById('empty-state');
  const resultCount = document.getElementById('result-count');
  const profileMap = new Map((dataset.profiles || []).map((profile) => [profile.id, profile]));
  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    element.textContent = value ?? '';
    if (className) element.className = className;
    return element;
  };
  const formatNumber = (value, digits = 2) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits:digits, minimumFractionDigits:digits }).format(Number(value))
    : '—';
  const formatPercent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${formatNumber(value)}%` : '—';
  const safeUrl = (value) => { try { const url = new URL(value, location.href); return url.protocol === 'https:' ? url.href : null; } catch (_) { return null; } };
  const signalMeta = {
    positive:{ label:'↑ 結構偏強', className:'positive' },
    neutral:{ label:'— 結構中性', className:'neutral' },
    negative:{ label:'↓ 結構偏弱', className:'negative' }
  };

  function interpretation(record) {
    if (record.freshness === 'unavailable') return '本次沒有可驗證的完成交易資料，暫不判讀。';
    const base = record.signal === 'positive'
      ? '收盤站上 EMA20／EMA50，RSI 同步偏強。'
      : record.signal === 'negative'
        ? '收盤低於 EMA20／EMA50，RSI 同步偏弱。'
        : '價格、均線與 RSI 尚未形成一致方向。';
    const heat = record.momentum === 'overbought' ? ' RSI 已進入過熱區，追價風險提高。' : record.momentum === 'oversold' ? ' RSI 已進入超賣區，仍需價格確認。' : '';
    const volume = Number(record.relativeVolume20) >= 1.5 ? ` 相對量 ${formatNumber(record.relativeVolume20)}×，今日訊號較值得留意。` : '';
    return `${base}${heat}${volume}`;
  }

  function detailItem(label, value) {
    const wrapper = document.createElement('div');
    wrapper.append(text('dt', label), text('dd', value));
    return wrapper;
  }

  function card(record) {
    const article = document.createElement('article');
    article.className = `ticker-card signal-${record.signal || 'neutral'}${record.freshness === 'current' ? '' : ' is-stale'}`;
    article.dataset.ticker = record.ticker;
    const main = text('div', '', 'card-main');
    const head = text('div', '', 'card-head');
    const identity = text('div', '', 'identity');
    const names = document.createElement('div');
    names.append(text('strong', record.ticker), text('small', record.company));
    identity.append(text('span', `#${record.rank}`, 'rank'), names);
    head.append(identity, text('span', record.lane, `lane-badge ${record.lane}`));
    const priceRow = text('div', '', 'price-row');
    const priceBlock = document.createElement('div');
    priceBlock.append(text('div', record.close == null ? '—' : `$${formatNumber(record.close)}`, 'price'));
    const direction = Number(record.dayChangePct) > 0 ? 'up' : Number(record.dayChangePct) < 0 ? 'down' : 'flat';
    priceBlock.append(text('div', formatPercent(record.dayChangePct), `change ${direction}`));
    const meta = signalMeta[record.signal] || signalMeta.neutral;
    priceRow.append(priceBlock, text('span', meta.label, `signal-label ${meta.className}`));
    const metrics = text('div', '', 'metric-grid');
    [['RSI 14',formatNumber(record.rsi14,1)],['相對量',record.relativeVolume20 == null ? '—' : `${formatNumber(record.relativeVolume20)}×`],['20日位置',record.rangePosition20 == null ? '—' : `${formatNumber(record.rangePosition20,0)}%`]].forEach(([label,value]) => {
      const item = text('div', '', 'metric'); item.append(text('span', label), text('strong', value)); metrics.append(item);
    });
    const profileCount = Array.isArray(record.profileIds) ? record.profileIds.length : 0;
    main.append(head, priceRow, text('span', interpretation(record), 'interpretation'), metrics, text('p', `來源帳號：${profileCount} 個${profileCount === 1 ? ' · 單一來源，不代表共識' : ' · 跨來源提及'}`, 'profile-note'));
    const details = document.createElement('details');
    details.className = 'card-details';
    details.append(text('summary', '展開完整資料'));
    const detailBody = text('div', '', 'detail-body');
    const dl = text('dl', '', 'detail-list');
    dl.append(
      detailItem('資料日期', record.dataThrough || '—'),
      detailItem('EMA 20', record.ema20 == null ? '—' : `$${formatNumber(record.ema20)}`),
      detailItem('EMA 50', record.ema50 == null ? '—' : `$${formatNumber(record.ema50)}`),
      detailItem('20 日高點', record.high20 == null ? '—' : `$${formatNumber(record.high20)}`),
      detailItem('20 日低點', record.low20 == null ? '—' : `$${formatNumber(record.low20)}`),
      detailItem('平均量', record.averageVolume20 == null ? '—' : new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(record.averageVolume20))
    );
    detailBody.append(dl);
    const links = text('div', '', 'profile-links');
    (record.profileIds || []).forEach((id) => {
      const profile = profileMap.get(id);
      const href = safeUrl(profile?.url);
      if (!profile || !href) return;
      const anchor = text('a', profile.label); anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; links.append(anchor);
    });
    if (links.children.length) detailBody.append(links);
    const marketHref = safeUrl(record.sourceUrl);
    if (marketHref) { const link = text('a', 'Nasdaq 完成交易資料', 'market-source'); link.href = marketHref; link.target = '_blank'; link.rel = 'noopener noreferrer'; detailBody.append(link); }
    if (record.freshness !== 'current') detailBody.append(text('p', `資料狀態：${record.freshness || 'unavailable'}${record.error ? ` · ${record.error}` : ''}`, 'freshness-warning'));
    details.append(detailBody);
    article.append(main, details);
    return article;
  }

  function filteredRecords() {
    const query = state.query.trim().toUpperCase();
    const rows = (dataset.records || []).filter((record) => {
      if (state.lane !== 'all' && record.lane !== state.lane) return false;
      if (state.signal !== 'all' && record.signal !== state.signal) return false;
      return !query || `${record.ticker} ${record.company}`.toUpperCase().includes(query);
    });
    return rows.sort((a, b) => {
      if (state.sort === 'move') return (Number(b.dayChangePct) || -Infinity) - (Number(a.dayChangePct) || -Infinity);
      if (state.sort === 'rsi') return (Number(b.rsi14) || -Infinity) - (Number(a.rsi14) || -Infinity);
      return Number(a.rank) - Number(b.rank);
    });
  }

  function render() {
    const rows = filteredRecords();
    grid.replaceChildren(...rows.map(card));
    empty.hidden = rows.length > 0;
    resultCount.textContent = `顯示 ${rows.length}／${(dataset.records || []).length} 檔`;
  }

  function updateSummary() {
    const records = dataset.records || [];
    const current = records.filter((record) => record.freshness === 'current');
    const up = current.filter((record) => Number(record.dayChangePct) > 0).length;
    const down = current.filter((record) => Number(record.dayChangePct) < 0).length;
    const positive = current.filter((record) => record.signal === 'positive').length;
    const leader = [...current].sort((a, b) => Number(b.dayChangePct) - Number(a.dayChangePct))[0];
    document.getElementById('available-count').textContent = `${current.length}／${records.length}`;
    document.getElementById('breadth-count').textContent = `${up}／${down}`;
    document.getElementById('positive-count').textContent = String(positive);
    document.getElementById('leader-ticker').textContent = leader?.ticker || '—';
    document.getElementById('leader-change').textContent = leader ? formatPercent(leader.dayChangePct) : '等待資料';
    const status = document.querySelector('.system-status');
    status.classList.add(dataset.status === 'PASS' ? 'is-pass' : dataset.status === 'BLOCKED' ? 'is-blocked' : 'is-partial');
    document.getElementById('data-status').textContent = dataset.status === 'PASS' ? '資料完整' : dataset.status === 'PARTIAL_PASS' ? '部分資料可用' : '資料尚未完成';
    document.getElementById('data-cutoff').textContent = `完成交易資料截至 ${dataset.dataThrough || '—'} · 更新 ${new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Los_Angeles'}).format(new Date(dataset.generatedAt || Date.now()))}`;
    document.getElementById('source-disclosure').textContent = dataset.sourceDisclosure || '';
  }

  function renderProfiles() {
    const profileGrid = document.getElementById('profile-grid');
    (dataset.profiles || []).forEach((profile) => {
      const href = safeUrl(profile.url);
      const item = text(href ? 'a' : 'div', '', `profile-item${profile.accessState === 'readable_partial' ? ' partial' : ''}`);
      if (href) { item.href = href; item.target = '_blank'; item.rel = 'noopener noreferrer'; }
      item.append(text('strong', profile.label), text('span', `${profile.platform} · ${profile.accessState === 'readable_partial' ? '部分可讀' : '已追蹤'}`));
      profileGrid.append(item);
    });
  }

  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.filter;
    state[key] = button.dataset.value;
    button.parentElement.querySelectorAll(`[data-filter="${key}"]`).forEach((peer) => {
      const active = peer === button; peer.classList.toggle('is-active', active); peer.setAttribute('aria-pressed', String(active));
    });
    render();
  }));
  document.getElementById('ticker-search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  document.getElementById('sort-order').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  updateSummary(); renderProfiles(); render();
})();
