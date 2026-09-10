/*
 * Aroid wiki hub.
 *
 * The section renders every category panel as a plain anchored block so the
 * page still works without JavaScript. This element upgrades that markup to a
 * tab interface and adds per-category sub tag chips and a keyword filter.
 */
class WikiAroids extends HTMLElement {
  connectedCallback() {
    this.nav = this.querySelector('[data-wiki-nav]');
    this.tabs = Array.from(this.querySelectorAll('[data-wiki-tab]'));
    this.panels = Array.from(this.querySelectorAll('[data-wiki-panel]'));
    this.searchInput = this.querySelector('[data-wiki-search]');
    this.status = this.querySelector('[data-wiki-status]');

    if (!this.nav || this.tabs.length === 0 || this.panels.length === 0) return;

    this.query = '';
    this.activeTag = new Map();

    this.setupTabs();
    this.panels.forEach((panel) => this.buildSubtags(panel));
    this.updateCounts();

    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.onSearch.bind(this));
      if (this.searchInput.value) this.onSearch();
    }

    this.activate(this.panelIdFromHash() || this.tabs[0].dataset.panel, { focus: false, updateHash: false });
    window.addEventListener('hashchange', () => {
      const panelId = this.panelIdFromHash();
      if (panelId) this.activate(panelId, { focus: false, updateHash: false });
    });
  }

  /* Tabs ------------------------------------------------------------------ */

  setupTabs() {
    this.nav.setAttribute('role', 'tablist');

    this.tabs.forEach((tab) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', tab.dataset.panel);
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('tabindex', '-1');
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        this.activate(tab.dataset.panel);
      });
      tab.addEventListener('keydown', this.onTabKeydown.bind(this));
    });

    this.panels.forEach((panel) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('tabindex', '0');
    });
  }

  onTabKeydown(event) {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    const current = this.tabs.indexOf(event.currentTarget);
    let next = current;

    if (event.key === 'ArrowRight') next = (current + 1) % this.tabs.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + this.tabs.length) % this.tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = this.tabs.length - 1;

    this.activate(this.tabs[next].dataset.panel);
  }

  panelIdFromHash() {
    const id = window.location.hash.slice(1);
    return this.panels.some((panel) => panel.id === id) ? id : null;
  }

  activate(panelId, { focus = true, updateHash = true } = {}) {
    if (!panelId) return;
    this.activePanelId = panelId;

    this.tabs.forEach((tab) => {
      const selected = tab.dataset.panel === panelId;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      if (selected && focus) tab.focus();
    });

    this.applyFilters();

    if (updateHash && window.history.replaceState) {
      window.history.replaceState(null, '', `#${panelId}`);
    }
  }

  /* Sub tag chips --------------------------------------------------------- */

  buildSubtags(panel) {
    const container = panel.querySelector('[data-wiki-subtags]');
    if (!container) return;

    const categoryTag = (panel.dataset.panelTag || '').toLowerCase();
    const cards = Array.from(panel.querySelectorAll('[data-wiki-card]'));
    const tags = new Map();

    cards.forEach((card) => {
      (card.dataset.tags || '')
        .split('|')
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag.toLowerCase() !== categoryTag)
        .forEach((tag) => tags.set(tag.toLowerCase(), (tags.get(tag.toLowerCase()) || 0) + 1));
    });

    if (tags.size < 2) return;

    Array.from(tags.keys())
      .sort((a, b) => tags.get(b) - tags.get(a) || a.localeCompare(b))
      .slice(0, 12)
      .forEach((tag) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'wiki-chip';
        chip.textContent = tag;
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          const isActive = this.activeTag.get(panel.id) === tag;
          this.activeTag.set(panel.id, isActive ? null : tag);
          container.querySelectorAll('.wiki-chip').forEach((other) => {
            other.setAttribute('aria-pressed', other === chip && !isActive ? 'true' : 'false');
          });
          this.applyFilters();
        });
        container.appendChild(chip);
      });
  }

  /* Filtering ------------------------------------------------------------- */

  onSearch() {
    this.query = this.searchInput.value.trim().toLowerCase();
    this.applyFilters();
  }

  cardMatches(card, panelId) {
    const tag = this.activeTag.get(panelId);
    if (tag) {
      const tags = (card.dataset.tags || '').split('|');
      if (!tags.includes(tag)) return false;
    }
    if (this.query && !(card.dataset.search || '').includes(this.query)) return false;
    return true;
  }

  applyFilters() {
    const searching = this.query.length > 0;
    let total = 0;

    this.panels.forEach((panel) => {
      const cards = Array.from(panel.querySelectorAll('[data-wiki-card]'));
      let visible = 0;

      cards.forEach((card) => {
        const match = this.cardMatches(card, panel.id);
        card.hidden = !match;
        if (match) visible += 1;
      });

      total += visible;

      // While searching every panel is shown so results are not hidden behind
      // a tab; otherwise only the selected tab's panel stays visible.
      const isActive = panel.id === this.activePanelId;
      panel.hidden = searching ? visible === 0 : !isActive;

      const noMatch = panel.querySelector('[data-wiki-no-match]');
      if (noMatch) noMatch.hidden = !(cards.length > 0 && visible === 0);
    });

    if (searching && this.panels.every((panel) => panel.hidden)) {
      const active = this.panels.find((panel) => panel.id === this.activePanelId);
      if (active) active.hidden = false;
    }

    this.updateStatus(total, searching);
  }

  updateStatus(total, searching) {
    if (!this.status) return;
    const label = this.dataset.resultsLabel || '';
    this.status.textContent = searching ? `${label} “${this.searchInput.value.trim()}” — ${total}` : '';
  }

  updateCounts() {
    this.tabs.forEach((tab) => {
      const panel = document.getElementById(tab.dataset.panel);
      const count = panel ? panel.querySelectorAll('[data-wiki-card]').length : 0;
      const badge = tab.querySelector('[data-wiki-count]');
      if (badge) badge.textContent = count > 0 ? count : '';
    });
  }
}

if (!customElements.get('wiki-aroids')) {
  customElements.define('wiki-aroids', WikiAroids);
}
