(function (root) {
  const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const formatStrike = (value) => {
    const number = finiteNumber(value);
    return number == null ? '—' : `$${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };
  const formatCompact = (value) => {
    const number = Math.abs(finiteNumber(value) || 0);
    if (number >= 1e9) return `${(number / 1e9).toFixed(1)}B`;
    if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
    return number.toFixed(number >= 10 ? 0 : 1);
  };

  function summarizeProfile(profile, spot) {
    const points = (profile?.strikes || []).map((strike, index) => ({
      strike: finiteNumber(strike),
      exposure: finiteNumber(profile?.exposure?.[index])
    })).filter((point) => point.strike != null && point.exposure != null);
    const totalMagnitude = points.reduce((sum, point) => sum + Math.abs(point.exposure), 0);
    const netExposure = points.reduce((sum, point) => sum + point.exposure, 0);
    const dominant = points.reduce((best, point) => !best || Math.abs(point.exposure) > Math.abs(best.exposure) ? point : best, null);
    const distance = dominant && finiteNumber(spot) != null ? (dominant.strike - Number(spot)) / Math.max(Math.abs(Number(spot)), 0.01) : null;
    const relation = distance == null ? '相對現價位置待補' : Math.abs(distance) <= 0.0125 ? '接近現價' : distance > 0 ? '位於現價上方' : '位於現價下方';
    return { ...profile, points, totalMagnitude, netExposure, dominant, relation, share: 0 };
  }

  function displayProfile(profile, spot, maxNodes = 18) {
    const spotValue = finiteNumber(spot);
    const points = (profile?.strikes || []).map((strike, index) => ({ strike: finiteNumber(strike), exposure: finiteNumber(profile?.exposure?.[index]) }))
      .filter((point) => point.strike != null && point.exposure != null && Math.abs(point.exposure) > 0);
    const spotWindow = spotValue == null ? points : points.filter((point) => point.strike >= spotValue * 0.65 && point.strike <= spotValue * 1.35);
    const pool = spotWindow.length >= 4 ? spotWindow : points;
    const selected = pool.length > maxNodes
      ? [...pool].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure)).slice(0, maxNodes)
      : pool;
    selected.sort((a, b) => a.strike - b.strike);
    return { ...profile, strikes: selected.map((point) => point.strike), exposure: selected.map((point) => point.exposure) };
  }

  function collectProfiles(baseProfiles, source, limit = 4) {
    const candidates = [
      ...(baseProfiles || []),
      ...(Array.isArray(source?.expirations) ? source.expirations : []),
      ...(Array.isArray(source?.additionalExpirations) ? source.additionalExpirations : []),
      ...(Array.isArray(source?.expirationProfiles) ? source.expirationProfiles : [])
    ];
    const seen = new Set();
    return candidates.map((profile, index) => {
      const expiry = profile?.expiry || profile?.expiration;
      const profileKind = profile?.profileKind || (profile?.exposureType === 'signed_dealer_gex' && profile?.status === 'renderable' ? 'signed-dealer-gex' : profile?.exposureType === 'unsigned_gamma_sensitivity' && profile?.status === 'aggregate_only' ? 'unsigned-pressure' : 'unavailable');
      return { ...profile, expiry, label: profile?.label || (index === 0 ? '本週到期' : index === 1 ? '下週到期' : `第${index + 1}週到期`), profileKind };
    }).filter((profile) => {
      if (!profile.expiry || seen.has(profile.expiry) || !Array.isArray(profile.strikes) || profile.strikes.length !== profile.exposure?.length || profile.profileKind === 'unavailable') return false;
      seen.add(profile.expiry);
      return true;
    }).slice(0, Math.max(2, limit));
  }

  function summarize(profiles, spot) {
    const rows = (profiles || []).map((profile) => summarizeProfile(profile, spot)).filter((row) => row.points.length);
    const combined = rows.reduce((sum, row) => sum + row.totalMagnitude, 0);
    rows.forEach((row) => { row.share = combined ? row.totalMagnitude / combined : 0; });
    const lead = rows.reduce((best, row) => !best || row.totalMagnitude > best.totalMagnitude ? row : best, null);
    const signed = rows.length > 0 && rows.every((row) => row.profileKind === 'signed-dealer-gex');
    const evidenceLabel = signed ? 'Signed dealer GEX' : 'Unsigned gamma sensitivity';
    const confidence = signed ? '資料層級：較高' : '資料層級：條件式';
    const first = rows[0];
    const second = rows[1];
    const shift = first?.dominant && second?.dominant
      ? first.dominant.strike === second.dominant.strike
        ? `兩個到期日都集中在 ${formatStrike(first.dominant.strike)}`
        : `主敏感度由 ${formatStrike(first.dominant.strike)} 移向 ${formatStrike(second.dominant.strike)}`
      : '到期日之間的集中位置仍待完整資料';
    const leadText = lead ? `${lead.label}承擔約 ${Math.round(lead.share * 100)}% 的兩期總敏感度` : '尚無可比較的到期日';
    const interpretation = signed
      ? `${leadText}；${shift}。正負值可用來描述模型中的 dealer gamma regime，但仍須配合價格確認。`
      : `${leadText}；${shift}。這裡只表示哪個價位對 Gamma 較敏感，不能推定造市商方向、支撐或壓力。`;
    return { rows, lead, signed, evidenceLabel, confidence, interpretation, formatStrike, formatCompact };
  }

  root.ElliottGexOverview = Object.freeze({ summarize, displayProfile, collectProfiles, formatStrike, formatCompact });
})(typeof window === 'undefined' ? globalThis : window);
