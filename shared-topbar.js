(() => {
  class ElliottTopbar extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready === 'true') return;
      this.dataset.ready = 'true';

      const current = this.dataset.current || '';
      const destinations = [
        { key:'digest', label:'市場摘要', href:this.dataset.digestHref || 'data-model/home.html' },
        { key:'moomoo', label:'每日型態', href:this.dataset.moomooHref || 'moomoo-patterns.html' },
        { key:'exploration', label:'Social Exploration', href:this.dataset.explorationHref || 'social-exploration.html' }
      ];
      const inner = document.createElement('div');
      inner.className = 'shared-topbar__inner';
      const nav = document.createElement('nav');
      nav.className = 'shared-topbar__nav';
      nav.setAttribute('aria-label', '主要頁面');

      destinations.forEach(({ key, label, href }) => {
        const link = document.createElement('a');
        link.className = 'shared-topbar__link';
        link.href = href;
        link.textContent = label;
        if (key === current) link.setAttribute('aria-current', 'page');
        nav.append(link);
      });

      inner.append(nav);
      this.replaceChildren(inner);
    }
  }

  if (!customElements.get('elliott-topbar')) customElements.define('elliott-topbar', ElliottTopbar);
})();
