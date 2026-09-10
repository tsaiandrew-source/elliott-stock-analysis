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
      @media(max-width:760px){.floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px;background:rgba(18,40,52,.94)}.dock-action{flex:1 1 0;min-width:0;height:44px;padding:7px 10px}}
      html.force-phone-portrait .floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px}
      html.force-phone-portrait .dock-action{flex:1 1 0;min-width:0;height:44px;padding:7px 10px}
      @media(max-width:999px) and (orientation:landscape) and (max-height:500px){.floating-dock{top:auto;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none;padding:5px;border-radius:15px}.dock-action{flex:1 1 0;min-width:0;height:44px;padding:7px 10px}}
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
      const ticker = tickerHref ? document.createElement('a') : document.createElement('button');
      ticker.className = 'dock-action';
      ticker.id = 'ticker-menu-toggle';
      if (tickerHref) ticker.href = tickerHref;
      else {
        ticker.type = 'button';
        ticker.setAttribute('aria-expanded', 'false');
        ticker.setAttribute('aria-controls', this.dataset.tickerControls || 'ticker-sheet');
      }
      if (current === 'ticker') ticker.setAttribute('aria-current', 'page');
      ticker.setAttribute('aria-label', tickerHref ? '開啟 Ticker 分析' : '選擇代號');
      ticker.innerHTML = `<span class="dock-icon" aria-hidden="true">⌁</span><span id="ticker-menu-label">${this.dataset.tickerLabel || 'Ticker'}</span>`;
      nav.append(ticker);

      this.replaceWith(nav);
    }
  }

  if (!customElements.get('elliott-shared-menu')) customElements.define('elliott-shared-menu', ElliottSharedMenu);
})();
