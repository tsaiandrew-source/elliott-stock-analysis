/* Traditional Chinese display layer for incoming analysis packets.
 * Source records remain unchanged; this only localizes what the prototype
 * renders and preserves a usable confidence label when the packet's numeric
 * confidence is a placeholder (0).
 */
(() => {
  const confidenceMap = {
    High: '高',
    'Medium-High': '中高',
    Medium: '中',
    'Medium-Low': '中低',
    'Low-Medium': '低中',
    Low: '低'
  };
  const currentChinese = {
    '2646-20260907-COVERAGE-V1-D': {
      thesis: '中性／尚無明確結論。鎖定偵測器未通過穩定主型態，日線 Wyckoff 未分類。',
      business: 'STARLUX 官方投資人頁面提供 2026 年第一季財報與股東／MOPS 連結。本次未獨立確認更新的重大營運披露，因此不對營收、獲利或產能下結論。'
    },
    'LITE-20260904-COVERAGE-V1-D': {
      thesis: '看多雙重底候選仍在形成，但日線 Wyckoff 派發 C 階段、MACD 位於訊號線下方，尚不足以升級。',
      business: 'FY2026 第四季營收為 10.063 億美元；管理層預估 FY2027 第一季營收 12.25–12.75 億美元，非 GAAP 營業利益率 39.5%–40.5%。一次性非現金債務清償費用使 GAAP 虧損不適合單獨作為營運訊號。九月投資人活動屬日程催化劑，不是營運結果。'
    },
    'NBIS-20260904-COVERAGE-V1-D': {
      thesis: '看多水平通道正在形成，但尚未出現突破收盤確認或動能支持；日線 Wyckoff 派發 C 階段構成重要反向情境。',
      business: '2026 年第二季營收 5.823 億美元，年增 454%；調整後 EBITDA 2.362 億美元，持續營運淨損 1.904 億美元；第二季不動產、設備與無形資產購入 56.574 億美元。融資與資本支出強度仍是成長故事的主要反向風險。'
    },
    'PLTR-20260904-COVERAGE-V1-D': {
      thesis: '看空雙重頂正在形成，日線 Wyckoff 派發 C 階段支持謹慎，但尚未完成跌破確認。',
      business: '第二季營收 19.35 億美元，年增 93%；GAAP 營業利益率 47%，公司並上調 FY2026 營收指引至 81.50–81.58 億美元。美國陸軍 TITAN 生產公告提供可傳導的需求證據，但計畫時程與收入認列仍需分開判斷。'
    },
    'IREN-20260904-COVERAGE-V1-D': {
      thesis: '看多下降通道向上突破候選，日線 Wyckoff 吸籌 C 階段與 MACD 改善提供支持，但仍需第二次確認收盤或有效回測。',
      business: 'FY2026 報告合約 ARR 40 億美元、營運 ARR 10 億美元。交付、驗收、GPU 融資與客戶預付款機制，代表合約 ARR 不應直接等同於當期認列營收。最新核對未發現晚於 8 月 27 日業績的重大發布。'
    },
    'NOK-20260904-COVERAGE-V1-D': {
      thesis: '看空頭肩頂回測守住，但日線 Wyckoff 吸籌 C 階段與 MACD 改善，與延續下跌方向衝突。',
      business: 'Nokia 披露第二季 AI／雲端訂單流入 28 億歐元，約半數預計在 12 個月內轉換，供應能力是限制因素。沙烏地研發中心與 BeeHealthy 公告支持 AI／網路自動化方向，但尚不能證明近期訂單轉換。'
    },
    'ACHR-20260904-COVERAGE-V1-D': {
      thesis: '看空雙重頂與日線派發 C 階段一致，但型態仍在形成，且尚未完成收盤跌破。',
      business: '9 月 3 日 No Roads 飛行展示公告提到 8 月超過 70 次測試飛行與 FAA 協調。第二季仍持續投入飛行測試、認證與生產；飛行活動是執行證據，不等於已完成認證或商業服務。'
    },
    'CSCO-20260904-COVERAGE-V1-D': {
      thesis: '看空雙重頂正在形成，但日線吸籌 C 階段構成反向訊號，且尚無跌破收盤確認。',
      business: 'FY2026 第四季營收 173 億美元，年增 18%；全年營收 633 億美元，年增 12%。Cisco 披露 FY2026 超大規模客戶 AI 基礎設施訂單 93 億美元，FY2027 AI 基礎設施營收預期 75 億美元。九月會議是後續披露機會，不是新增財務結果。'
    },
    'AMKR-20260904-COVERAGE-V1-D': {
      thesis: '看空頭肩頂回測守住，但日線吸籌 C 階段與 MACD 小幅改善，形成重要衝突。',
      business: '第二季淨銷售 19.0 億美元，年增 26%；淨利 1.74 億美元，稀釋後 EPS 0.70 美元。NVIDIA 與台積電先進封裝合作支持 AI／HPC 產能定位，但執行、資本支出與客戶集中風險仍在。'
    },
    'ONDS-20260904-COVERAGE-V1-D': {
      thesis: '已確認的看空頭肩頂與日線派發 C 階段一致；這是追蹤組合中最清楚的看空核對結果。',
      business: '最近已核實、且具備論述的發布包括 FY2026 第二季業績／展望與 Aran Defense 收購。訂單或紀錄用語仍須與收入認列、整合及融資結果分開；未經直接核實，不新增較晚的主要來源結論。'
    },
    'NVDA-20260904-COVERAGE-V1-D': {
      thesis: '已確認的看多水平通道突破，RSI／MACD 提供支持，但日線派發 C 階段構成反向訊號。',
      business: 'FY2027 第二季營收 962.2 億美元，超過去年同期一倍；公司預估 FY2027 第三季營收 1,080 億美元，正負 2%。主要反向情境是出口／監管、集中度，以及極高成長已被市場預期反映。'
    },
    'MRVL-20260904-COVERAGE-V1-D': {
      thesis: '看多下降三角形候選正在形成，日線吸籌 C 階段提供支持，但 MACD 尚未確認。',
      business: 'FY2027 第二季營收 27.393 億美元，年增 37%；資料中心營收 21.715 億美元，年增 46%，占總營收 79%。第三季營收指引為 31.50 億美元，正負 5%；客製晶片爬坡時程與客戶集中度仍是關鍵不確定性。'
    },
    'SNDK-20260904-COVERAGE-V1-D': {
      thesis: '已確認的看多下降三角形突破，與日線吸籌 C 階段及正向動能一致，但偵測器未提供量測目標。',
      business: 'FY2026 業績與 8 月 13 日投資人日策略仍是營運基礎。9 月 3 日投資人會議公告是最新發現的發行人項目，但不改變基本面；NAND 週期、客戶集中、庫存與長期供應義務仍是主要反向情境。'
    },
    '2330-20260907-COVERAGE-V1-D': {
      thesis: '看多下降三角形突破回測守住，動能／成交量強；日線 Wyckoff 未分類，但並非反向訊號。',
      business: '第二季營收新台幣 12,703.8 億元，年增 36.0%；淨利 7,065.6 億元，年增 77.4%；稀釋後 EPS 27.25 元，毛利率 67.7%。7 奈米及以下先進製程占晶圓營收 77%；8 月營收預定 9 月 10 日發布，因此 9 月 7 日尚無資料是預期狀態。'
    },
    'AVGO-20260904-COVERAGE-V1-D': {
      thesis: '尚無可發布的方向性結論。偵測到的看多逆頭肩底候選與價格條件不一致，因收盤 $357.89 已低於 $362.87 失效位。',
      business: 'FY2026 第三季營收 295.91 億美元，年增 86%；AI 半導體營收 167 億美元，年增 221%；第四季營收指引約 348 億美元，AI 半導體營收預期 217 億美元。自由現金流 137 億美元；主要反向情境是估值／預期敏感度，以及整合與集中風險。'
    }
  };

  const replaceAll = (value, pairs) => pairs.reduce((text, [from, to]) => text.replace(from, to), String(value ?? ''));
  const translateConfidence = (value) => confidenceMap[String(value ?? '').replace(/`/g, '').trim()] || value;
  const confidenceDisplay = (run) => {
    const pattern = String(run?.pattern || '');
    const usable = pattern.match(/(?:reconciled confidence|usable confidence)\s*`?([^`;,]+)`?/i);
    if (usable) return translateConfidence(usable[1]);
    if (Number(run?.confidence) > 0) return String(run.confidence);
    if (/no defensible confidence/i.test(pattern)) return '—';
    return run?.confidenceLabel ? translateConfidence(run.confidenceLabel) : '—';
  };
  const confidencePercent = (run) => {
    const explicitText = String(run?.confidencePercent ?? '').match(/\d+(?:\.\d+)?/);
    const explicit = explicitText ? Number(explicitText[0]) : NaN;
    if (Number.isFinite(explicit) && explicit > 0) return `${explicit}%`;
    const numeric = Number(run?.confidence);
    if (Number.isFinite(numeric) && numeric > 0) return `${numeric}%`;
    const match = String(run?.pattern || '').match(/(\d+(?:\.\d+)?)%/i);
    return match ? `${match[1]}%` : '—';
  };
  const compactPattern = (run) => {
    if (!run) return '尚無最新分析';
    if (run.patternLabel) return String(run.patternLabel);
    const rawPattern = localizePattern(String(run.pattern || '')).split('/')[0].trim();
    const thesis = String(run.thesis || '');
    const compact = [
      [/none\s*\/\s*no defensible confidence|無明確型態|無可辯護信心/i, '無明確型態'],
      [/double bottom|雙重底/i, /看多|bullish/i.test(thesis) ? '看多雙重底候選仍在形成' : '雙重底形成中'],
      [/horizontal channel|水平通道/i, /breakout|突破/i.test(rawPattern) ? '水平通道突破確認' : '水平通道形成中'],
      [/descending[- ]channel.*(?:upside|向上)|下降通道.*向上/i, '看多下降通道突破候選'],
      [/double top|雙重頂/i, '雙重頂形成中'],
      [/head[- ]and[- ]shoulders top.*retest|頭肩頂.*回測/i, '頭肩頂回測守住'],
      [/head[- ]and[- ]shoulders top.*breakout|頭肩頂.*突破/i, '頭肩頂突破確認'],
      [/descending triangle.*forming|下降三角形.*形成/i, '看多下降三角形形成中'],
      [/descending[- ]triangle.*retest|下降三角形.*回測/i, '下降三角形突破回測守住'],
      [/descending[- ]triangle.*breakout|下降三角形.*突破/i, '下降三角形突破確認'],
      [/inverse head[- ]and[- ]shoulders.*reject|逆頭肩底.*否決/i, '逆頭肩底候選已否決']
    ].find(([pattern]) => pattern.test(rawPattern));
    if (compact) return compact[1];
    if (/無明確|中性|尚無明確|no defensible|unclassified/i.test(`${rawPattern} ${thesis}`)) return '無明確型態';
    return rawPattern || '尚無最新分析';
  };
  const direction = (run) => {
    if (!run) return { symbol: '→', key: 'flat', label: '延續盤整' };
    const explicit = String(run.predictionDirection || '').toLowerCase();
    if (explicit === 'up' || explicit === 'bullish' || explicit === '↗') return { symbol: '↗', key: 'up', label: '趨勢向上' };
    if (explicit === 'down' || explicit === 'bearish' || explicit === '↘') return { symbol: '↘', key: 'down', label: '趨勢向下' };
    if (explicit === 'flat' || explicit === 'neutral' || explicit === '→') return { symbol: '→', key: 'flat', label: '延續盤整' };
    const text = `${run.thesis || ''} ${run.pattern || ''}`;
    if (/無明確|中性|尚無.*結論|no defensible|rejected|否決|失效|inconclusive|unclassified/i.test(text)) return { symbol: '→', key: 'flat', label: '延續盤整' };
    if (/看空|bearish|double top|雙重頂|head[- ]and[- ]shoulders top|頭肩頂|downside|向下|下跌/i.test(text)) return { symbol: '↘', key: 'down', label: '趨勢向下' };
    if (/看多|bullish|upside|向上|上行|breakout|突破|double bottom|雙重底|ascending/i.test(text)) return { symbol: '↗', key: 'up', label: '趨勢向上' };
    return { symbol: '→', key: 'flat', label: '延續盤整' };
  };
  const localizePattern = (value) => {
    const stripped = String(value ?? '').replace(/\s*\/\s*\d+(?:\.\d+)?%.*$/i, '').trim();
    if (!stripped || /[\u3400-\u9fff]/.test(stripped)) return stripped;
    let text = stripped;
    text = replaceAll(text, [
      [/none \/ no defensible confidence/i, '無明確型態／無可辯護信心'],
      [/double bottom, forming/i, '雙重底形成中'],
      [/horizontal channel, forming/i, '水平通道形成中'],
      [/descending-channel upside breakout candidate/i, '下降通道向上突破候選'],
      [/double top, forming/i, '雙重頂形成中'],
      [/head-and-shoulders top, retest held/i, '頭肩頂，回測守住'],
      [/head-and-shoulders top, breakout confirmed/i, '頭肩頂，突破確認'],
      [/horizontal-channel upside breakout confirmed/i, '水平通道向上突破確認'],
      [/descending triangle, forming with upside bias/i, '下降三角形形成中，偏向上行'],
      [/descending-triangle upside breakout confirmed/i, '下降三角形向上突破確認'],
      [/descending-triangle upside breakout, retest held/i, '下降三角形向上突破，回測守住'],
      [/inverse head-and-shoulders candidate rejected by reconciliation/i, '逆頭肩底候選，經核對後否決'],
      [/detector confidence/gi, '偵測器信心'],
      [/reconciled confidence/gi, '核對後信心'],
      [/usable confidence/gi, '可用信心'],
      [/raw detector confidence/gi, '原始偵測器信心'],
      [/for direction/gi, '（方向）'],
      [/withheld/gi, '暫不提供'],
      [/Medium-High/g, '中高'],
      [/Medium-Low/g, '中低'],
      [/Low-Medium/g, '低中'],
      [/High/g, '高'],
      [/Medium/g, '中'],
      [/Low/g, '低']
    ]);
    return text;
  };
  const localizeWyckoff = (value) => {
    if (!value || /[\u3400-\u9fff]/.test(value)) return value;
    return replaceAll(value, [[/accumulation/gi, '吸籌'], [/distribution/gi, '派發'], [/unclassified/gi, '未分類'], [/classified/gi, '已分類'], [/withheld/gi, '尚未提供'], [/locked detector daily-only/gi, '鎖定偵測器僅支援日線'], [/Phase C/gi, 'Phase C']]);
  };
  const localizeConfirmation = (value) => {
    if (!value || /[\u3400-\u9fff]/.test(value)) return value;
    return replaceAll(value, [[/upside boundary break/gi, '向上邊界突破'], [/downside boundary break/gi, '向下邊界突破'], [/close above ([0-9.]+)/gi, '收盤站上 $1'], [/breakdown below ([0-9.]+)/gi, '跌破 $1'], [/completed-close acceptance/gi, '收盤確認完成'], [/promote after second accepted close or held retest/gi, '第二次確認收盤或回測守住後再升級'], [/raw requirement is /gi, '原始要求：'], [/unavailable/gi, '暫無']]);
  };
  const localizeInvalidation = (value) => {
    if (!value || /[\u3400-\u9fff]/.test(value)) return value;
    return replaceAll(value, [[/raw invalidation/gi, '原始失效位'], [/pair is not actionable in its present state/gi, '目前狀態不具可操作性']]);
  };
  const localizeOptions = (value) => {
    if (!value || /[\u3400-\u9fff]/.test(value)) return value;
    if (/No Cboe options packet/i.test(value)) return '台股標的未附 Cboe 選擇權資料；ADR 選擇權屬不同標的。';
    if (/partial|missing/i.test(value)) return '本週／下週選擇權資料不完整；未提供可辯護的 signed GEX、Gamma Flip、Call Wall／Put Wall。';
    return value;
  };
  const localizeRun = (run) => {
    if (!run || /[\u3400-\u9fff]/.test(`${run.thesis || ''}${run.business || ''}${run.pattern || ''}`) && !currentChinese[run.runId]) return run;
    const preset = currentChinese[run.runId] || {};
    return {
      ...run,
      pattern: localizePattern(run.pattern),
      patternLabel: run.patternLabel ? localizePattern(run.patternLabel) : undefined,
      thesis: preset.thesis || run.thesis,
      business: preset.business || run.business,
      confidencePercent: confidencePercent(run),
      confidenceLabel: confidenceDisplay(run),
      confidenceDisplay: confidenceDisplay(run),
      confirmation: localizeConfirmation(run.confirmation),
      invalidation: localizeInvalidation(run.invalidation),
      wyckoff: localizeWyckoff(run.wyckoff),
      weeklyWyckoff: localizeWyckoff(run.weeklyWyckoff),
      options: localizeOptions(run.options),
      status: localizePattern(run.status)
    };
  };
  window.PROTOTYPE_ANALYSIS_LOCALIZER = { confidenceDisplay, confidencePercent, compactPattern, direction, localizeRun, localizePattern, localizeWyckoff };
})();
