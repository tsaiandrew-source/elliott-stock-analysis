window.BENCHMARK_ANALYSIS_DETAILS = {
  NBIS: {
    overall: {
      updated: "W36 · 2026-08-31",
      cadence: "每週／重大事件",
      thesis: "AI 雲需求與融資跑道已獲支持，但投資判斷已從「能否取得資本」轉為「新容量能否轉成利用率、遞延收入與現金回報，且資本支出、利息與稀釋不吞掉經濟性」。",
      businessSummary: "需求與融資條件改善；商業驗證仍在容量上線、利用率、遞延收入轉換，以及支出／收入與融資成本能否回落。",
      proved: "AI 雲需求、Q2 營收增長、融資跑道",
      unproved: "新容量利用率、收入／現金轉換、capex／利息／稀釋後的回報",
      nextTest: "後續季度新容量如期上線、遞延收入進入營收，且資本支出／營收比下降。"
    },
    gex: {
      overview: "GEX 用來讀不同履約價附近可能出現的價格摩擦或放大區：先看 Magnet／Flip 樞紐，再看上方 Call Wall 與下方 Put Wall。這裡是 unsigned benchmark pressure map，不是 signed dealer GEX。",
      current: {
        confidence: "條件式 · 中",
        plain: "本週 200 是核心樞紐；220 是上方摩擦區，190 是下方反應區。",
        path: "守住 200 → 先看 210，再測 220；失守 200 → 下看 190。",
        confirm: "價格接受 220，才算上行路徑完成；單次刺穿不算。",
        invalidate: "失守 200，220 上行路徑失效；跌破 190 代表下行壓力擴大，不是保證目標。",
        levels: [{ role: "magnet", label: "Magnet／Flip", value: 200 }, { role: "call", label: "Call Wall", value: 220 }, { role: "put", label: "Put Wall", value: 190 }],
        detail: ["綠色正曝險柱通常代表較強的摩擦／穩定傾向；紅色負曝險柱可能放大價格離開該區的速度。", "200 同時是 Magnet／Flip benchmark，先視為樞紐，不把它說成必然磁吸。", "若 200–220 之間的累積曲線與壓力柱仍偏弱，通往 220 的路徑可能較順；這是通行阻力，不是價格目標。"]
      },
      next: {
        confidence: "條件式 · 中低",
        plain: "下週 205 是前瞻樞紐；230 是較遠的上方 Call Wall，180 是下方 Put Wall。",
        path: "守住 205 → 先看 220，再評估 230；失守 205 → 先看 190／180 反應區。",
        confirm: "先接受 205，再接受 220；只有在 220 被守住後，230 才有路徑意義。",
        invalidate: "失守 205，230 上行路徑降級；跌破 180 代表下方結構需要重新評估。",
        levels: [{ role: "magnet", label: "Magnet／Flip", value: 205 }, { role: "call", label: "Call Wall", value: 230 }, { role: "put", label: "Put Wall", value: 180 }],
        detail: ["下週 expiry 距離較遠，節點可能因 spot、IV、時間衰減與新 OI 快速遷移。", "230 是遠端摩擦／上限參考，不是下週必達價位；180 是壓力反應區，不等於保證支撐。", "要把下週讀法升級，需比較清算後 OI 與下一次完整 pressure map 是否維持相同節點排名。"]
      }
    },
    midday: null,
    endOfDay: {
      date: "2026-09-02 · End of day",
      title: "收回 200，但反彈仍未完成確認",
      sections: [
        { heading: "一句結論", points: ["NBIS 收回 200，也跑贏大盤；但低量反彈尚未越過 207.5–215 的確認區，觀點改善為中性偏弱，而不是多頭翻轉。"] },
        { heading: "今天的交易怎麼改變昨天的看法", points: ["收盤 204.09、單日 +2.28%，位於當日區間約 89% 的高位。Nasdaq 約 +0.45%，NBIS 相對跑贏約 1.83 個百分點。", "成交量僅約 Nasdaq 所示均量 0.51x；價格反彈有方向、缺少參與度，所以不能把一天收回 200 解讀成結構反轉。", "與 9/1 相比，結論由「200 下方偏弱」改善為「200 上方嘗試止穩，但仍需突破 207.5–215 才能升級」。"] },
        { heading: "技術結構", points: ["收盤高於 EMA100 198.89，但仍低於 EMA20 215.39、EMA50 213.70 與 BB20 中線 220.60。", "RSI14 46.06 由 44.46 回升但仍低於 50；MACD 柱 -3.546，負值略收斂；GoNoGo 仍是 weak NoGo。三者只支援跌勢放緩，不支援趨勢已反轉。", "日線最佳結構仍是雙重底形成中（87）；頸線遠在 299.86，尚未確認，因此不產生價格／時間投射。", "週線仍是上升通道向下突破候選，參考線約 221.47；Wyckoff 為 Distribution Phase C／UTAD candidate，未通過投射顯示門檻。"] },
        { heading: "本週戰場｜2026-09-04", points: ["200 保持核心樞紐，短線敏感度向 207.5–220 擴展；若站穩 200，先測 207.5–210，再看 214–220。", "Call-side 當日成交轉強，但上行 skew premium 收斂，不能把成交增加直接視為追價買盤。", "本週 unsigned gamma-pressure ranking 以 200 為核心，其次約 220／207.5／215／210；這是壓力分布遷移，不是 dealer 方向或必然磁吸的證據。"] },
        { heading: "下週接力｜2026-09-11", points: ["下週部位庫存擴張，風險中心由 200 下移至 195；同時 Put-wing 相對定價升高，代表反彈伴隨下行保護。", "守住 195 才有條件回看 210，並保留向預期區間上緣約 223 延伸的可能；接受跌破 195，190／185 的 downside sensitivity 會更重要。", "下週 unsigned gamma-pressure 以 195 最突出，其次約 210／200／190／230；不能判定 dealers 會壓住或放大突破。"] },
        { heading: "T+1 OI 審核", points: ["9/4 相較 9/1，總 OI 約增加 3,235 Calls／3,448 Puts；兩側都增加、Put 稍快，代表部位庫存擴張但不是單邊證據。", "9/11 總 OI 約增加 4,011 Calls／2,525 Puts；195C 增加 1,831，使最大敏感度節點下移至 195。", "OI 增減不能判定 bought versus written；可轉債與約 15.8M 股交換仍可能製造 convertible-arbitrage、delta hedge、roll 或 multi-leg flow。"] },
        { heading: "我的判斷", points: ["Base case：先在 198.9–210 形成止穩測試；在 207.5–215 被接受前，仍屬反彈而非結構翻多。", "條件權重：bullish gate 207.5 約 55%；bearish gate 195.15 約 45%；信心 Medium-Low（3.2／5）。這是條件式分析權重，不是統計保證。", "Bullish extension：守住 200／198.89，收盤接受 207.5，再越過 214.22–215；其後才看 220.60／221.47。", "Bearish lane：跌回 199.54／198.89 下方且無法收復，再失守 195.15，則重開 193.97／190；176.31 才是獨立 Wyckoff Phase-D 確認門檻。"] },
        { heading: "消息面與發布判斷", points: ["9/2 只有 Goldman Sachs 與 Citi 投資人會議行程，沒有新合約、財測或營運數據；它提供管理層訊息窗口，但不足以改寫 options 路線。", "本次 Clara Daily Digest 判定 NO-POST／NO-SEND：新聞 0/4、options 3/4、relevance 2/2、總分 5/10；signed dealer GEX、Gamma Flip 與 signed Walls 不可得。"] }
      ],
      points: [
        "一句結論：NBIS 收回 200，也跑贏大盤；但低量反彈尚未越過 207.5–215 確認區，觀點改善為中性偏弱，而不是多頭翻轉。",
        "收盤 204.09、單日 +2.28%，相對 Nasdaq 跑贏約 1.83 個百分點；成交量只有 Nasdaq 所示均量約 0.51x，價格有方向但參與度不足。",
        "技術上站回 EMA100 198.89，但仍低於 EMA20 215.39、EMA50 213.70 與 BB20 中線 220.60；RSI14 46.06、MACD 柱仍為負、GoNoGo 仍是 weak NoGo。",
        "本週 200 仍是核心樞紐，壓力向 207.5–220 擴展；下週 195 是關鍵分界。Unsigned gamma pressure 不能推導 dealer 方向或必然磁吸。",
        "消息面只有 9/8 Goldman Sachs 與 9/9 Citi 投資人會議行程，沒有新合約、財測或營運數據，不足以改寫基本面 thesis。"
      ],
      next: "守住 200 並接受 207.5–215 才能升級；失守 195.15／190 則重新打開下行路徑。"
    },
    weekly: {
      date: "W36 · 2026-08-31",
      title: "資金風險下降，執行風險上升",
      points: [
        "Q2 營收 5.823 億美元、年增 454%；調整後 EBITDA 轉為正 2.362 億美元，商業需求與經營槓桿開始變得可見。",
        "同季資本支出 56.574 億美元，約為營收 9.7 倍；若容量延後或利用率不足，折舊、利息與稀釋會先進報表。",
        "目前判斷維持條件式正向：融資是跑道，不是容量已經變成回報的證明。"
      ],
      next: "新容量如期上線、遞延收入轉成營收，並讓資本支出／營收比下降。"
    }
  },
  IREN: {
    overall: {
      updated: "W36 · 2026-09-04",
      cadence: "每週／重大事件",
      thesis: "AI 雲需求與合約 ARR 已被證明，但投資判斷已從「有沒有需求」轉為「Horizon 交付、利用率與驗收能否把 contracted ARR 轉成 GAAP 營收與高品質現金，且融資成本不吞掉回報」。",
      businessSummary: "合約 ARR 與 AI Cloud revenue 擴張，但 ARR 到 GAAP revenue 的轉換仍受部署、驗收、利用率、利息與折舊約束。",
      proved: "客戶需求、contracted ARR、Horizon 1 交付、AI Cloud revenue growth",
      unproved: "Horizon 2–4 驗收、利用率、融資調整後的現金回報",
      nextTest: "Horizon 2–4 按期交付，AI Cloud 認列收入與現金同步提升，且融資成本不能吞掉合約價值。"
    },
    gex: {
      overview: "GEX 用來讀不同履約價附近可能出現的價格摩擦或放大區：先看 Magnet／Flip 樞紐，再看上方 Call Wall 與下方 Put Wall。這裡是 unsigned benchmark pressure map，不是 signed dealer GEX。",
      current: {
        confidence: "條件式 · 中",
        plain: "本週 35.5 是核心樞紐；36 是非常近的上方 Call Wall，35 是下方 Put Wall。",
        path: "守住 35.5 → 先測 36；失守 35.5 → 回看 35。",
        confirm: "收盤接受 36，才算短線上方路徑延伸；盤中觸及不算。",
        invalidate: "失守 35.5，36 的上行路徑降級；失守 35 則需重新評估下方壓力。",
        levels: [{ role: "magnet", label: "Magnet／Flip", value: 35.5 }, { role: "call", label: "Call Wall", value: 36 }, { role: "put", label: "Put Wall", value: 35 }],
        detail: ["本週三個關鍵價位非常接近，所以這張圖更像短線反應帶，而不是遠距離目標圖。", "正負曝險只描述 benchmark pressure 的可能互動，不能推斷 Call 是買進還是寫出。", "若 35.5–36 間的壓力快速遷移，應以新的 expiry snapshot 取代舊敘事。"]
      },
      next: {
        confidence: "條件式 · 中低",
        plain: "下週 41.44 是前瞻樞紐；60.16 是遠端 Call Wall，35.5 是下方 Put Wall。",
        path: "守住 41.44 → 先看 44／48，再評估 60.16；失守 41.44 → 回看 38／35.5。",
        confirm: "先接受 41.44，再觀察 44–48 是否形成新的穩定區；不能直接跳讀到 60.16。",
        invalidate: "失守 41.44，60.16 的遠端路徑降級；跌破 35.5 則下行壓力重新主導。",
        levels: [{ role: "magnet", label: "Magnet／Flip", value: 41.44 }, { role: "call", label: "Call Wall", value: 60.16 }, { role: "put", label: "Put Wall", value: 35.5 }],
        detail: ["60.16 距離現價較遠，只能當作遠端 friction reference，不能當成預測目標。", "下週圖要與價格、成交量及清算後 OI 一起更新；遠端 Call Wall 可能是寫出、covered call 或 hedge 結構。", "若 41.44 失守，先回到 38／35.5 的反應路徑，不把單一紅柱直接解讀為看空目標。"]
      }
    },
    midday: null,
    endOfDay: {
      date: "2026-09-04 · End of day",
      title: "合約 ARR 很大，但收入轉換仍是考題",
      sections: [
        { heading: "一句結論", points: ["四十億美元 contracted ARR 不等於收入；真正的考題是容量上線、測試與驗收後，有多少變成 GAAP 營收與現金。"] },
        { heading: "基本面變化", points: ["FY26 AI Cloud Services 營收由 1,640 萬美元增至 1.288 億美元；約 40 億美元 contracted ARR 中，約 10 億美元正在營運。", "容量大致售罄、客戶擴大，Horizon 1 已交付 Microsoft；需求端比上一輪更具體。", "FY26 淨損與礦機資產減損提醒市場，AI 轉型仍先吞資本與折舊代價。"] },
        { heading: "轉換機制與反讀", points: ["客戶預付款與 GPU 融資先降低前期資金缺口，容量再經部署、測試、驗收、利用率，最後才進入 GAAP 收入與現金。", "45–55% 客戶預付款與 28 億美元 GPU 融資沒有消除交付、利用率與利息成本；其中 24 億美元融資固定利率 9%，把三者放在同一張考卷。", "最強反讀是 2026 容量大致售罄，若 Horizon 按時驗收，收入斜率可能快於落後的會計數字。"] },
        { heading: "期權／壓力解讀", points: ["近端 unsigned pressure 先看 35–36 美元，上方較大的節點約 40–41 美元；公開資料沒有 aggressor、open／close 或 dealer sign。", "因此不能把 Call 或未簽名 GEX 直接解讀成看多；它們只能提供條件式壓力與反應區。"] },
        { heading: "我的判斷與發布判斷", points: ["融資讓 IREN 更快擴張，卻沒有替股東預先證明報酬；目前維持條件式判斷，不給合格目標。", "下一個可否證測試是 Horizon 2–4 按期交付，AI Cloud 認列收入與現金同步提升，且融資成本不能吞掉合約價值。"] }
      ],
      points: [
        "一句結論：四十億美元 contracted ARR 不等於收入；真正的考題是容量上線、測試與驗收後，有多少變成 GAAP 營收與現金。",
        "FY26 AI Cloud Services 營收由 1,640 萬美元增至 1.288 億美元；約 40 億美元 contracted ARR 中，約 10 億美元正在營運。",
        "FY26 淨損與礦機資產減損提醒市場，AI 轉型仍先吞資本與折舊代價；融資與客戶預付款降低前期資金缺口，卻沒有消除交付與利用率風險。",
        "近端 unsigned pressure 先看 35–36 美元，上方節點約 40–41 美元；公開期權資料沒有 aggressor、open/close 或 dealer sign，不能直接解讀成看多。"
      ],
      next: "看 operating ARR 能否按期驗收並同步進入收入與現金流，而融資成本不能吞掉合約價值。"
    },
    weekly: {
      date: "W36 · 2026-09-04",
      title: "問題由需求，轉為交付速度",
      points: [
        "容量大致售罄、Horizon 1 已交付 Microsoft、AI Cloud 收入加速，需求端比上一輪更具體。",
        "45–55% 客戶預付款與 28 億美元 GPU 融資降低前期資金缺口，但交付、利用率與利息成本被放在同一張考卷。",
        "融資讓 IREN 更快擴張，卻沒有替股東預先證明報酬；目前不給合格目標，維持條件式判斷。"
      ],
      next: "Horizon 2–4 按期驗收，AI Cloud 認列收入與現金同步提升，且融資成本不能吞掉合約價值。"
    }
  }
};
