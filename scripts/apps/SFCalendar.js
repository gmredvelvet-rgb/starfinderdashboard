const CAL_NS    = 'starfinderdashboard';
const CAL_DATA  = 'calendarData';
const CAL_MONTHS = 'calendarMonths';

export class SFCalendarApp {
  constructor() {
    this.data        = {};
    this.months      = [];
    this.curMonth    = 0;
    this._container  = null;
    this._initialized = false;
  }

  static registerSettings() {
    try {
      game.settings.register(CAL_NS, CAL_DATA, {
        name: 'SF Calendar Data', scope: 'world',
        config: false, type: Object, default: {}
      });
    } catch(e) { console.debug('SFCalendar: calendarData already registered', e); }
    try {
      game.settings.register(CAL_NS, CAL_MONTHS, {
        name: 'SF Calendar Months', scope: 'world',
        config: false, type: Array, default: []
      });
    } catch(e) { console.debug('SFCalendar: calendarMonths already registered', e); }
  }

  load() {
    try { this.data   = game.settings.get(CAL_NS, CAL_DATA)   || {}; } catch(e) { this.data = {}; }
    try { this.months = game.settings.get(CAL_NS, CAL_MONTHS) || []; } catch(e) { this.months = []; }
  }

  async saveData() { await game.settings.set(CAL_NS, CAL_DATA, this.data); }
  async saveMonths() { await game.settings.set(CAL_NS, CAL_MONTHS, this.months); }

  async renderInto(container) {
    this._container = container;
    this.load();
    this._render();
  }

  _render() {
    const c = this._container;
    if (!this.months.length) { this._renderSetup(c); return; }

    const monthName = this.months[this.curMonth] || `Month ${this.curMonth + 1}`;
    const days = 30;
    let cells = '';
    for (let d = 1; d <= days; d++) {
      const key   = `${this.curMonth}-${d}`;
      const entry = this.data[key];
      const hasN  = !!entry?.note?.trim();
      const done  = !!entry?.done;
      cells += `<div class="sf-cal-day${done ? ' sf-cal-day--done' : ''}${hasN ? ' sf-cal-day--note' : ''}" data-day="${d}">
        <span class="sf-cal-num">${d}</span>
        ${done ? '<span class="sf-cal-x">✕</span>' : ''}
        ${hasN && !done ? '<span class="sf-cal-dot"></span>' : ''}
      </div>`;
    }

    c.innerHTML = `
      <div class="sf-cal">
        <div class="sf-cal-header">
          <button class="sf-cal-nav" data-act="prev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="sf-cal-month">${monthName}</div>
          <button class="sf-cal-nav" data-act="next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div class="sf-cal-grid">${cells}</div>

        ${game.user.isGM ? `
        <div class="sf-cal-footer">
          <button class="sf-cal-btn sf-cal-btn--cfg">⚙ CONFIG MONTHS</button>
        </div>` : ''}
      </div>
    `;

    this._listen(c);
  }

  _renderSetup(c) {
    c.innerHTML = `
      <div class="sf-cal-setup">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>TEMPORAL ARCHIVE</p>
        <p class="sf-cal-setup-sub">Months not configured.</p>
        ${game.user.isGM
          ? `<button class="sf-cal-btn sf-cal-btn--cfg">CONFIGURE</button>`
          : `<p class="sf-cal-setup-sub">Ask the GM to configure the calendar.</p>`}
      </div>`;

    $(c).find('.sf-cal-btn--cfg').on('click', () => this._openConfig(c));
  }

  _listen(c) {
    const $c = $(c);
    $c.find('[data-act="prev"]').on('click', () => {
      this.curMonth = (this.curMonth - 1 + this.months.length) % this.months.length;
      this._render();
    });
    $c.find('[data-act="next"]').on('click', () => {
      this.curMonth = (this.curMonth + 1) % this.months.length;
      this._render();
    });
    $c.find('.sf-cal-day').on('click', ev => {
      const day = Number.parseInt(ev.currentTarget.dataset.day);
      this._openDay(c, this.curMonth, day);
    });
    if (game.user.isGM) {
      $c.find('.sf-cal-btn--cfg').on('click', () => this._openConfig(c));
    }
  }

  _openDay(container, mi, day) {
    const key   = `${mi}-${day}`;
    const entry = this.data[key] || { note: '', done: false };
    const mName = this.months[mi] || `Month ${mi + 1}`;
    new Dialog({
      title: `${mName} · Day ${day}`,
      content: `<div style="padding:8px">
        <textarea id="sf-day-note" style="width:100%;min-height:90px;background:#0a0a14;border:1px solid rgba(0,229,255,.35);color:#c8d8f0;padding:8px;border-radius:6px;font-family:'Share Tech Mono',monospace;font-size:11px;resize:vertical;box-sizing:border-box;outline:none" placeholder="Log entry...">${entry.note || ''}</textarea>
      </div>`,
      buttons: {
        save:   { label: '💾 Save', callback: async html => {
          this.data[key] = { note: html.find('#sf-day-note').val().trim(), done: entry.done };
          await this.saveData(); this._render();
        }},
        toggle: { label: entry.done ? '↩ Undo' : '✓ Done', callback: async html => {
          this.data[key] = { note: html.find('#sf-day-note').val().trim(), done: !entry.done };
          await this.saveData(); this._render();
        }},
        clear:  { label: '🗑 Clear', callback: async () => {
          delete this.data[key]; await this.saveData(); this._render();
        }}
      }
    }).render(true);
  }

  _openConfig(container) {
    if (!game.user.isGM) return;
    let rows = '';
    for (let i = 0; i < 12; i++) {
      rows += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="color:#00e5ff;font-family:'Orbitron';font-size:8px;min-width:20px">${String(i+1).padStart(2,'0')}</span>
        <input type="text" id="sfm-${i}" value="${this.months[i] || ''}" placeholder="Month name..."
          style="flex:1;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;outline:none">
      </div>`;
    }
    new Dialog({
      title: 'Configure Stellar Months',
      content: `<div style="padding:10px;max-height:360px;overflow-y:auto">${rows}</div>`,
      buttons: {
        save: { label: 'Save', callback: async html => {
          const m = [];
          for (let i = 0; i < 12; i++) m.push(html.find(`#sfm-${i}`).val()?.trim() || `Month ${i+1}`);
          this.months = m;
          await this.saveMonths(); this._render();
        }},
        cancel: { label: 'Cancel' }
      }
    }).render(true);
  }
}
