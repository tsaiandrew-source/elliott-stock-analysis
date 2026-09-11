(function () {
  'use strict';

  const styleId = 'elliott-shared-menu-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .floating-dock{position:fixed;z-index:60;top:14px;right:50%;display:flex;align-items:center;gap:7px;width:max-content;max-width:calc(100vw - 32px);transform:translateX(50%);padding:7px;border:1px solid rgba(85,217,213,.38);border-radius:17px;background:rgba(18,40,52,.94);box-shadow:0 14px 38px rgba(0,0,0,.34),0 0 0 1px rgba(85,217,213,.06) inset;backdrop-filter:blur(10px)}
      .dock-action{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:102px;height:42px;padding:7px 12px;border:0;border-radius:11px;color:var(--muted,#91a5b4);background:transparent;text-decoration:none;font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
      .dock-action:hover,.dock-action:focus-visible{color:var(--text,#e8f1f5);background:var(--surface2,var(--surface-2,#112433))}
      .dock-action[aria-current="page"],.dock-action.is-active{color:var(--aqua,#55d9d5);background:rgba(85,217,213,.1);box-shadow:inset 0 -2px var(--aqua,#55d9d5)}
      .dock-icon{color:var(--aqua,#55d9d5);font-size:20px;line-height:1}
      .ticker-menu-trigger{display:inline-flex;align-items:center;justify-content:center;min-width:102px;height:42px;padding:7px 12px;border:0;border-radius:11px;color:var(--muted,#91a5b4);background:transparent;font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
      .ticker-menu-trigger:hover,.ticker-menu-trigger:focus-visible{color:var(--text,#edf6fb);background:var(--surface2,var(--surface-2,#112433));outline:0}
      .ticker-menu-trigger[aria-current="page"]{color:var(--aqua,#55d9d5);background:rgba(85,217,213,.1);box-shadow:inset 0 -2px var(--aqua,#55d9d5)}
      .shared-ticker-backdrop[hidden],.shared-ticker-sheet[hidden],.ticker-sheet[hidden]{display:none}
      .shared-ticker-backdrop{position:fixed;z-index:68;inset:0;border:0;background:rgba(3,10,15,.62);backdrop-filter:blur(2px)}
      .shared-ticker-sheet,.ticker-sheet{position:fixed;z-index:70;top:82px;right:50%;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px;width:min(360px,calc(100vw - 28px));height:min(520px,70vh);max-height:min(520px,70vh);overflow:hidden;transform:translateX(50%);padding:13px;border:1px solid rgba(85,217,213,.4);border-radius:16px;background:rgba(13,26,37,.98);box-shadow:0 18px 46px rgba(0,0,0,.45)}
      .shared-ticker-head,.ticker-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--aqua,#55d9d5);font:800 13px/1.3 system-ui,-apple-system,sans-serif}
      .ticker-sheet-head{margin-bottom:0}
      .shared-ticker-head strong,.ticker-sheet-head strong{color:var(--aqua,#55d9d5);font-size:13px}
      .ticker-sheet-head span{color:var(--muted,#91a8b7);font-size:11px;font-weight:400}
      .shared-ticker-close,.ticker-sheet-close{width:36px;height:36px;border:0;border-radius:9px;color:var(--muted,#91a5b4);background:transparent;font-size:22px;line-height:1;cursor:pointer}
      .shared-ticker-wheel,.ticker-wheel{display:flex;min-height:0;height:auto;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;scroll-snap-type:y mandatory;scrollbar-width:thin;scrollbar-color:var(--aqua,#55d9d5) transparent;border:1px solid var(--line,#203849);border-radius:11px;background:rgba(7,16,24,.52)}
      .shared-ticker-item,.ticker-wheel-item{display:flex;flex:0 0 44px;align-items:center;justify-content:space-between;gap:10px;padding:7px 13px;border:0;border-bottom:1px solid rgba(32,56,73,.55);color:var(--text,#edf6fb);background:transparent;text-align:left;font:800 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;scroll-snap-align:center}
      .shared-ticker-item:last-child,.ticker-wheel-item:last-child{border-bottom:0}
      .shared-ticker-item:hover,.shared-ticker-item:focus-visible,.ticker-wheel-item:hover,.ticker-wheel-item:focus-visible{color:var(--aqua,#55d9d5);background:rgba(85,217,213,.1);outline:0}
      .ticker-wheel-item.is-current{color:var(--text,#edf6fb);background:rgba(85,217,213,.13);box-shadow:inset 3px 0 var(--aqua,#55d9d5)}
      .ticker-wheel-item.is-current strong{color:var(--aqua,#55d9d5)}
      @media(max-width:760px){.floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px;background:rgba(18,40,52,.94)}.dock-action,.ticker-menu-trigger{flex:1 1 0;min-width:0;height:44px}.dock-action,.ticker-menu-trigger{padding:7px 10px}}
      @media(max-width:760px){.shared-ticker-sheet,.ticker-sheet{top:auto;bottom:calc(69px + env(safe-area-inset-bottom));height:min(720px,calc(100dvh - 96px));max-height:min(720px,calc(100dvh - 96px))}.shared-ticker-item,.ticker-wheel-item{flex-basis:40px}}
      html.force-phone-portrait .floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px}
      html.force-phone-portrait .dock-action,.force-phone-portrait .ticker-menu-trigger{flex:1 1 0;min-width:0;height:44px}.force-phone-portrait .dock-action,.force-phone-portrait .ticker-menu-trigger{padding:7px 10px}
      .force-phone-portrait .shared-ticker-sheet,.force-phone-portrait .ticker-sheet{top:auto;bottom:calc(69px + env(safe-area-inset-bottom));height:min(720px,calc(100dvh - 96px));max-height:min(720px,calc(100dvh - 96px))}.force-phone-portrait .shared-ticker-item,.force-phone-portrait .ticker-wheel-item{flex-basis:40px}
      @media(max-width:999px) and (orientation:landscape) and (max-height:500px){.floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px}.dock-action,.ticker-menu-trigger{flex:1 1 0;min-width:0;height:44px}.dock-action,.ticker-menu-trigger{padding:7px 10px}}
    `;
    document.head.append(style);
  }

  const installPageSwipe = (current, destinations) => {
    if (window.__elliottPageSwipeInstalled) return;
    const order = ['home', 'coverage', 'ticker'];
    const currentIndex = order.indexOf(current);
    if (currentIndex < 0) return;
    window.__elliottPageSwipeInstalled = true;
    let gesture = null;
    const blockedTarget = (target) => target instanceof Element && Boolean(target.closest('.floating-dock, .ticker-sheet, .table-wrap, .view-switch, #chart-stack, .gex-profile-canvas, input, textarea, select, [contenteditable="true"]'));
    document.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1 || blockedTarget(event.target) || document.querySelector('.ticker-sheet:not([hidden])')) {
        gesture = null;
        return;
      }
      const touch = event.touches[0];
      gesture = { x:touch.clientX, y:touch.clientY, at:Date.now() };
    }, { passive:true });
    document.addEventListener('touchcancel', () => { gesture = null; }, { passive:true });
    document.addEventListener('touchend', (event) => {
      if (!gesture || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const elapsed = Date.now() - gesture.at;
      gesture = null;
      if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35 || elapsed > 900) return;
      const targetIndex = currentIndex + (dx < 0 ? 1 : -1);
      const targetKey = order[targetIndex];
      const href = destinations[targetKey];
      if (!href) return;
      window.location.assign(new URL(href, document.baseURI).href);
    }, { passive:true });
  };

  const installFallbackTickerMenu = (toggle, chartHref) => {
    const tickers = window.PROTOTYPE_COVERAGE_ORDER || ['LITE', 'NBIS', 'PLTR', 'IREN', 'NOK', 'ACHR', 'CSCO', 'AMKR', 'ONDS', 'NVDA', 'MRVL', 'SNDK', 'AVGO', '2646', '2330'];
    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'shared-ticker-backdrop';
    backdrop.setAttribute('aria-label', '關閉代號選單');
    backdrop.hidden = true;
    const sheet = document.createElement('section');
    sheet.className = 'shared-ticker-sheet';
    sheet.id = 'shared-ticker-sheet';
    sheet.setAttribute('aria-label', 'Ticker selections');
    sheet.hidden = true;
    const head = document.createElement('div');
    head.className = 'shared-ticker-head';
    const title = document.createElement('strong');
    title.textContent = '選擇代號';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'shared-ticker-close';
    close.setAttribute('aria-label', '關閉代號選單');
    close.textContent = '×';
    head.append(title, close);
    const wheel = document.createElement('div');
    wheel.className = 'shared-ticker-wheel';
    wheel.setAttribute('role', 'listbox');
    wheel.setAttribute('aria-label', '選擇代號');
    tickers.forEach((symbol) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'shared-ticker-item';
      item.setAttribute('role', 'option');
      item.textContent = symbol;
      item.addEventListener('click', () => {
        const url = new URL(chartHref, document.baseURI);
        url.searchParams.set('ticker', symbol);
        url.searchParams.set('view', 'daily');
        window.location.assign(url.href);
      });
      wheel.append(item);
    });
    sheet.append(head, wheel);
    document.body.append(backdrop, sheet);
    const setOpen = (open) => {
      sheet.hidden = !open;
      backdrop.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) wheel.querySelector('button')?.focus();
    };
    toggle.addEventListener('click', () => setOpen(sheet.hidden));
    close.addEventListener('click', () => setOpen(false));
    backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !sheet.hidden) setOpen(false); });
  };

  class ElliottSharedMenu extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      const current = this.dataset.current || '';
      installPageSwipe(current, {
        home:this.dataset.homeHref || 'home.html',
        coverage:this.dataset.coverageHref || 'coverage.html',
        ticker:this.dataset.tickerPageHref || this.dataset.tickerHref
      });
      const nav = document.createElement('nav');
      nav.className = 'floating-dock';
      nav.setAttribute('aria-label', '快速導覽');

      const link = (id, label, icon, href, key, ariaLabel) => {
        const anchor = document.createElement('a');
        anchor.className = 'dock-action';
        anchor.id = id;
        anchor.href = href;
        anchor.setAttribute('aria-label', ariaLabel);
        if (current === key) anchor.setAttribute('aria-current', 'page');
        anchor.innerHTML = `<span class="dock-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
        return anchor;
      };

      nav.append(link('dock-home', 'Home', '⌂', this.dataset.homeHref || 'home.html', 'home', current === 'home' ? '目前位於 Digest 首頁' : '開啟 Digest 首頁'));
      nav.append(link('dock-coverage', 'Coverage', '◎', this.dataset.coverageHref || 'coverage.html', 'coverage', current === 'coverage' ? '目前位於 Coverage' : '開啟 Coverage'));

      const tickerHref = this.dataset.tickerHref;
      const ticker = document.createElement('button');
      ticker.className = 'ticker-menu-trigger';
      ticker.id = 'ticker-menu-toggle';
      ticker.type = 'button';
      ticker.setAttribute('aria-expanded', 'false');
      ticker.setAttribute('aria-controls', tickerHref ? 'shared-ticker-sheet' : (this.dataset.tickerControls || 'ticker-sheet'));
      if (current === 'ticker') ticker.setAttribute('aria-current', 'page');
      ticker.setAttribute('aria-label', '選擇代號');
      ticker.innerHTML = `<span class="dock-icon" aria-hidden="true">⌁</span><span id="ticker-menu-label">${this.dataset.tickerLabel || 'Ticker'}</span>`;
      nav.append(ticker);

      this.replaceWith(nav);
      if (tickerHref) installFallbackTickerMenu(ticker, tickerHref);
    }
  }

  if (!customElements.get('elliott-shared-menu')) customElements.define('elliott-shared-menu', ElliottSharedMenu);
})();
