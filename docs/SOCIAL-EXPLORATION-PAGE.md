# Social Exploration daily page

The page at `social-exploration.html` tracks the current 20-name Social
Exploration roster independently from Universal Refresh.

## UX contract

The information architecture follows the existing Moomoo Patterns reader:
summary first, obvious filters, compact ticker cards and expandable supporting
detail. The implementation also applies the Nielsen Norman Group UX basics used
for this page:

- communication before decoration;
- clear system status and completed-session cutoff;
- recognition over recall through persistent labels and visible filter state;
- progressive disclosure, with the daily change visible before indicator and
  source detail;
- limited choices tied to real tasks: lane, technical state, search and sort;
- touch targets of at least 44px, safe-area handling and no hover-only control;
- iPhone single-column and iPad two-column layouts;
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
EMA20, EMA50, 20-session range position and relative volume, then renders only
conditional technical state. It does not import profile conclusions or produce
price targets.

Run manually:

```sh
node scripts/update-social-exploration.mjs --as-of=YYYY-MM-DD
node scripts/social-exploration-qa.mjs
```

The prepared GitHub Actions workflow runs at 23:45 UTC on weekdays, which is
after the regular U.S. close in both PDT and PST. It commits only when the
current snapshot or append-only daily history changes. The workflow is not live
until this branch is reviewed and merged.
