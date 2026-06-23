const NEWS_NS  = 'macro-cyberpunk-news';
const NEWS_KEY = 'cyberpunk-news-data';

export class NewsTerminalApp {
  constructor() {
    this.profiles = [{ name: 'NetWatch Bulletin', news: [] }];
    this.profileIdx  = 0;
    this.newsIdx     = 0;
    this._container  = null;
    this._initialized = false;
  }

  static registerSettings() {
    try {
      game.settings.register(NEWS_NS, NEWS_KEY, {
        name: 'Cyberpunk News Data', scope: 'world',
        config: false, type: Object,
        default: { profiles: [{ name: 'NetWatch Bulletin', news: [] }] }
      });
    } catch(_) {}
  }

  async load() {
    try {
      const data = game.settings.get(NEWS_NS, NEWS_KEY);
      this.profiles = Array.isArray(data?.profiles) && data.profiles.length
        ? data.profiles : [{ name: 'NetWatch Bulletin', news: [] }];
      if (this.profileIdx >= this.profiles.length) this.profileIdx = 0;
      const p = this.profiles[this.profileIdx];
      if (this.newsIdx >= p.news.length) this.newsIdx = 0;
    } catch(_) { this.profiles = [{ name: 'NetWatch Bulletin', news: [] }]; }
  }

  async save() {
    if (!game.user.isGM) return;
    await game.settings.set(NEWS_NS, NEWS_KEY, { profiles: this.profiles });
    game.socket?.emit('macro.cyberpunk-news.refresh');
  }

  async renderInto(container) {
    this._container = container;
    await this.load();
    this._render();
    this._initialized = true;
  }

  refresh() { if (this._container) this.load().then(() => this._render()); }

  _esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  _render() {
    const c     = this._container;
    const isGM  = game.user.isGM;
    const prof  = this.profiles[this.profileIdx] || { name: '', news: [] };
    const news  = prof.news;
    const item  = news[this.newsIdx] ?? null;
    const total = news.length;

    const channelOpts = this.profiles.map((p, i) =>
      `<option value="${i}" ${i === this.profileIdx ? 'selected' : ''}>${this._esc(p.name)}</option>`
    ).join('');

    c.innerHTML = `
      <div class="sf-news">
        <div class="sf-news-topbar">
          <svg class="sf-news-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/>
            <path d="M4 22a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>
            <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
          </svg>
          <select class="sf-news-chan-sel">${channelOpts}</select>
          ${isGM ? `
            <button class="sf-nw-btn sf-nw-btn--add-ch" title="New channel">+</button>
            ${this.profiles.length > 1 ? `<button class="sf-nw-btn sf-nw-btn--del-ch" title="Delete channel">×</button>` : ''}
          ` : ''}
        </div>

        <div class="sf-news-counter">
          ${total > 0 ? `BROADCAST ${this.newsIdx + 1} / ${total}` : 'NO SIGNAL'}
        </div>

        <div class="sf-news-card-area">
          ${item ? this._renderCard(item, isGM) : this._renderEmpty(isGM)}
        </div>

        ${total > 1 ? `
        <div class="sf-news-nav-row">
          <button class="sf-nw-nav" data-act="prev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="sf-news-dots">
            ${news.map((_, i) => `<span class="sf-nw-dot ${i === this.newsIdx ? 'sf-nw-dot--on' : ''}"></span>`).join('')}
          </div>
          <button class="sf-nw-nav" data-act="next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>` : ''}

        ${isGM ? `
        <div class="sf-news-gm-row">
          <button class="sf-nw-btn sf-nw-btn--add-news">+ NEWS</button>
          ${item ? `<button class="sf-nw-btn sf-nw-btn--del-news">DELETE</button>` : ''}
        </div>` : ''}
      </div>
    `;

    this._listen(c);
  }

  _renderCard(item, isGM) {
    let media = '';
    if (item.media) {
      const isVid = /\.(mp4|webm)$/i.test(item.media);
      media = isVid
        ? `<video controls class="sf-news-media"><source src="${item.media}"></video>`
        : `<img class="sf-news-media" src="${item.media}" alt="">`;
    }
    if (isGM) return `
      <div class="sf-news-card sf-news-card--gm">
        <input class="sf-nw-title-inp" value="${this._esc(item.title)}" placeholder="Headline...">
        <textarea class="sf-nw-body-inp" placeholder="Content...">${this._esc(item.body)}</textarea>
        ${media}
        <div class="sf-news-media-row">
          <button class="sf-nw-btn sf-nw-btn--pick-media">📁 File</button>
          <button class="sf-nw-btn sf-nw-btn--url-media">🔗 URL</button>
          ${item.media ? `<button class="sf-nw-btn sf-nw-btn--clear-media">× Remove</button>` : ''}
        </div>
      </div>`;
    return `
      <div class="sf-news-card">
        <h3 class="sf-news-title">${this._esc(item.title || 'UNTITLED')}</h3>
        <div class="sf-news-body">${this._esc(item.body || '').replace(/\n/g, '<br>')}</div>
        ${media}
      </div>`;
  }

  _renderEmpty(isGM) { return `
    <div class="sf-news-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="48" height="48">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/>
        <path d="M4 22a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>
      </svg>
      <p>CHANNEL EMPTY</p>
      ${isGM ? `<button class="sf-nw-btn sf-nw-btn--add-news">+ ADD NEWS</button>` : ''}
    </div>`; }

  _listen(c) {
    const $c = $(c);
    const isGM = game.user.isGM;

    $c.find('.sf-news-chan-sel').on('change', async ev => {
      this.profileIdx = parseInt(ev.target.value);
      this.newsIdx = 0;
      this._render();
    });

    $c.find('[data-act="prev"]').on('click', () => {
      const n = this.profiles[this.profileIdx]?.news?.length || 0;
      if (n > 0) { this.newsIdx = (this.newsIdx - 1 + n) % n; this._render(); }
    });
    $c.find('[data-act="next"]').on('click', () => {
      const n = this.profiles[this.profileIdx]?.news?.length || 0;
      if (n > 0) { this.newsIdx = (this.newsIdx + 1) % n; this._render(); }
    });

    if (!isGM) return;

    $c.find('.sf-nw-btn--add-ch').on('click', () => {
      let inp;
      new Dialog({ title: 'New Channel',
        content: `<div style="padding:8px"><input id="sf-ch-n" type="text" placeholder="Channel name..."
          style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.4);color:#c8d8f0;padding:7px 10px;border-radius:6px;box-sizing:border-box;outline:none;font-size:11px"></div>`,
        buttons: { ok: { label: 'Create', callback: async () => {
          const name = inp?.value?.trim();
          if (!name) return;
          this.profiles.push({ name, news: [] });
          this.profileIdx = this.profiles.length - 1; this.newsIdx = 0;
          await this.save(); this._render();
        }}, cancel: { label: 'Cancel' }},
        render: html => { inp = html.find('#sf-ch-n')[0]; inp?.focus(); }
      }).render(true);
    });

    $c.find('.sf-nw-btn--del-ch').on('click', async () => {
      const ok = await Dialog.confirm({ title: 'Delete Channel',
        content: `<p>Delete <b>${this.profiles[this.profileIdx]?.name}</b>?</p>` });
      if (!ok) return;
      this.profiles.splice(this.profileIdx, 1);
      this.profileIdx = Math.max(0, this.profileIdx - 1); this.newsIdx = 0;
      await this.save(); this._render();
    });

    $c.find('.sf-nw-btn--add-news').on('click', async () => {
      const p = this.profiles[this.profileIdx];
      p.news.push({ title: 'NEW BROADCAST', body: 'Enter content...', media: '' });
      this.newsIdx = p.news.length - 1;
      await this.save(); this._render();
    });

    $c.find('.sf-nw-btn--del-news').on('click', async () => {
      const p = this.profiles[this.profileIdx];
      const ok = await Dialog.confirm({ title: 'Delete News', content: '<p>Delete this item?</p>' });
      if (!ok) return;
      p.news.splice(this.newsIdx, 1);
      this.newsIdx = Math.max(0, this.newsIdx - 1);
      await this.save(); this._render();
    });

    $c.find('.sf-nw-title-inp').on('change', async ev => {
      const p = this.profiles[this.profileIdx];
      if (p.news[this.newsIdx]) { p.news[this.newsIdx].title = ev.target.value; await this.save(); }
    });
    $c.find('.sf-nw-body-inp').on('change', async ev => {
      const p = this.profiles[this.profileIdx];
      if (p.news[this.newsIdx]) { p.news[this.newsIdx].body = ev.target.value; await this.save(); }
    });

    $c.find('.sf-nw-btn--pick-media').on('click', () => {
      const p = this.profiles[this.profileIdx];
      new FilePicker({ type: 'imagevideo', current: p.news[this.newsIdx]?.media || '',
        callback: async path => { p.news[this.newsIdx].media = path; await this.save(); this._render(); }
      }).browse();
    });

    $c.find('.sf-nw-btn--url-media').on('click', () => {
      let inp;
      const p = this.profiles[this.profileIdx];
      new Dialog({ title: 'Media URL',
        content: `<div style="padding:8px"><input id="sf-mu" type="text" value="${this._esc(p.news[this.newsIdx]?.media || '')}"
          placeholder="https://..." style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.4);color:#c8d8f0;padding:7px 10px;border-radius:6px;box-sizing:border-box;outline:none;font-size:11px"></div>`,
        buttons: { ok: { label: 'Set', callback: async () => {
          const url = inp?.value?.trim();
          if (url && p.news[this.newsIdx]) { p.news[this.newsIdx].media = url; await this.save(); this._render(); }
        }}, cancel: { label: 'Cancel' }},
        render: html => { inp = html.find('#sf-mu')[0]; inp?.focus(); }
      }).render(true);
    });

    $c.find('.sf-nw-btn--clear-media').on('click', async () => {
      const p = this.profiles[this.profileIdx];
      if (p.news[this.newsIdx]) { p.news[this.newsIdx].media = ''; await this.save(); this._render(); }
    });
  }
}
