# Social Exploration daily page

The page at `social-exploration.html` tracks the current 20-name Social
Exploration roster independently from Universal Refresh.

## UX contract

The information architecture now directly follows the existing Moomoo Patterns
decision reader: compact title and freshness, inline status totals, one control
panel and a sortable full-analysis table. The prior
large hero, navigation dock, status banner and four summary cards are not part
of this page. The compact shared topbar follows the public E+ market-summary
navigation and lists Social Exploration as the third destination. The implementation also applies the Nielsen Norman Group UX
basics used for this page:

- communication before decoration;
- clear system status and completed-session cutoff;
- recognition over recall through persistent labels and visible filter state;
- independent color-coded filters for structural status and RSI momentum, with matching badges in the analysis table;
- complete analysis without a competing abbreviated view;
- limited choices tied to real tasks: lane, technical state, search and sort;
- touch targets of at least 44px, safe-area handling and no hover-only control;
- responsive table-to-card conversion for iPhone and full-width table reading
  on iPad;
- color is always paired with arrows or text labels;
- stale and unavailable data are explicit and never silently presented as live.

References:

- <https://tsaiandrew-source.github.io/elliott-stock-analysis/moomoo-patterns.html>
- <https://www.nngroup.com/articles/ux-basics-study-guide/>

## Data contract

- Roster: `data-model/social-exploration-roster.json`
- Current completed-session snapshot: `data-model/social-exploration.json`
- Browser bundle: `data-model/social-exploration-data.js`
- Append-only daily history: `data-model/social-exploration-history/YYYY-MM-DD.json`
- Updater: `scripts/update-social-exploration.mjs`

The updater retrieves Nasdaq public completed-session OHLCV, calculates RSI14,
EMA20, EMA50, 20-session range position and relative volume, and retrieves the
most relevant recent Nasdaq symbol-news item. 營運摘要以最新季度財報為核心，整理實績、
主要成長來源與下一個驗證點，並在資料層保留官方或監管申報來源。新聞摘要由繁中編輯
重述市場焦點、原因與可能意義，不複製原文，也不在頁面顯示新聞標題、媒體或參考連結。
The reader does not import profile conclusions or produce price targets.

Run manually:

```sh
node scripts/update-social-exploration.mjs --as-of=YYYY-MM-DD
node scripts/social-exploration-qa.mjs
```

The prepared GitHub Actions workflow opens its first window at 17:30
`America/Los_Angeles` on U.S. weekdays. Two UTC transport candidates cover PDT
and PST; a local-time admission gate accepts only the active offset, so daylight-
saving changes do not create a duplicate run. It retries incomplete data gates
three times inside that window, publishes only a full `PASS`, commits
only the current snapshot and append-only history, and then verifies the public
page, the third navigation destination, and the exact published data-through
date. If a gate remains incomplete, the workflow stops and the last verified
public version stays in place. The workflow is not live until this branch is
reviewed and merged.

News digests prefer the locked human-edited Traditional Chinese summary when its
source headline still matches. If a new headline becomes the highest-attention
item, a deterministic event-category summarizer produces a short Traditional
Chinese explanation without copying the headline; this removes a daily manual
editorial dependency. Quarterly business digests remain sourced, compact latest-
report summaries and are not rewritten by daily price/news refreshes.
