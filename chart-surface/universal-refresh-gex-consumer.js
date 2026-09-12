(function (root) {
  const allowed = new Set(['renderable', 'aggregate_only', 'not_available', 'not_applicable']);
  const finite = (values) => Array.isArray(values) && values.every(Number.isFinite);
  function resolveExpiration(record, group) {
    const expiry = group === 'next' ? record?.nextExpiration : record?.currentExpiration;
    if (!expiry || !allowed.has(expiry.status)) return {renderChart: false, status: 'not_available', reason: 'GEX 資料狀態無效；不顯示圖表。', profile: null};
    const numericProfile = finite(expiry.strikes) && finite(expiry.exposure) && expiry.strikes.length > 0 && expiry.strikes.length === expiry.exposure.length;
    const signedProfile = expiry.status === 'renderable' && expiry.exposureType === 'signed_dealer_gex' && numericProfile;
    const unsignedProfile = expiry.status === 'aggregate_only' && expiry.exposureType === 'unsigned_gamma_sensitivity' && numericProfile;
    const renderChart = signedProfile || unsignedProfile;
    const profileKind = signedProfile ? 'signed-dealer-gex' : unsignedProfile ? 'unsigned-pressure' : 'unavailable';
    const reason = renderChart ? '' : expiry.displayText || ({aggregate_only: '僅有彙總資料；不顯示 GEX 圖表。', not_available: 'GEX 資料尚不可用。', not_applicable: '此商品不適用 GEX 圖表。'}[expiry.status]);
    return {renderChart, profileKind, status: expiry.status, reason, profile: renderChart ? expiry : null};
  }
  function mergeWithoutMarketFallback(marketData, gexRecord) {
    return {...marketData, gexSummary: gexRecord || null, gexViews: {}};
  }
  root.UniversalRefreshGex = Object.freeze({resolveExpiration, mergeWithoutMarketFallback});
})(typeof window === 'undefined' ? globalThis : window);
