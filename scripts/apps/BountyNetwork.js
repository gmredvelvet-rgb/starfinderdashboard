const BN_NS  = 'starfinderdashboard';
const BN_KEY = 'bountyNetworkData';

const STATUSES = [
  { id: 'wanted',   label: 'WANTED',       color: '#ff3333' },
  { id: 'alive',    label: 'DEAD OR ALIVE', color: '#ff8800' },
  { id: 'custody',  label: 'IN CUSTODY',   color: '#00e5ff' },
  { id: 'cleared',  label: 'CLEARED',      color: '#44ff88' },
  { id: 'deceased', label: 'DECEASED',     color: '#666888' },
];

const DANGER_LABELS = ['LOW', 'MED', 'HIGH', 'EXTREME'];
const DANGER_COLORS = ['#44ff88', '#ffcc00', '#ff8800', '#ff3333'];

export class BountyNetworkApp {
  constructor() {
    this.cards   = [];
    this.current = 0;
    this._container  = null;
    this._initialized = false;
  }

  static registerSettings() {
    try {
      game.settings.register(BN_NS, BN_KEY, {
        name: 'Bounty Network Data', scope: 'world',
        config: false, type: Array, default: []
      });
    } catch(_) {}
  }

  async load() {
    try {
      const data = game.settings.get(BN_NS, BN_KEY);
      this.cards = Array.isArray(data) ? data : [];
    } catch(_) { this.cards = []; }
  }

  async save() {
    if (!game.user.isGM) return;
    await game.settings.set(BN_NS, BN_KEY, this.cards);
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
    const c    = this._container;
    const len  = this.cards.length;
    const card = this.cards[this.current] ?? null;
    const isGM = game.user.isGM;

    const status  = STATUSES.find(s => s.id === (card?.status ?? 'wanted')) ?? STATUSES[0];
    const danger  = Math.min(3, Math.max(0, card?.danger ?? 0));
    const dColor  = DANGER_COLORS[danger];
    const dLabel  = DANGER_LABELS[danger];

    c.innerHTML = `
      <div class="sf-bounty">

        <div class="sf-bn-ctrl-row">
          <span class="sf-bn-count">${len > 0 ? `${this.current + 1} / ${len}` : 'NO TARGETS'}</span>
          ${isGM ? `<div class="sf-bn-gm-btns">
            ${card ? `<button class="sf-bn-pill sf-bn-pill--del" data-act="delete">DEL</button>` : ''}
            <button class="sf-bn-pill sf-bn-pill--add" data-act="add">+ NEW</button>
          </div>` : ''}
        </div>

        ${card ? `
        <div class="sf-bounty-card" id="sf-bn-card">
          <div class="sf-bn-wanted-stamp" style="border-color:${status.color};color:${status.color}">
            ${status.label}
          </div>

          <div class="sf-bounty-photo-ring">
            <img class="sf-bounty-photo" src="${this._esc(card.img || 'icons/svg/mystery-man.svg')}"
              onerror="this.src='icons/svg/mystery-man.svg'" alt="">
            ${isGM ? `<button class="sf-bn-btn--img" data-act="img" title="Change image">📷</button>` : ''}
          </div>

          ${isGM
            ? `<input class="sf-bounty-name-input" value="${this._esc(card.name || '')}" placeholder="Target name" data-act="name">`
            : `<div class="sf-bounty-name">${this._esc(card.name || 'UNKNOWN')}</div>`}

          <div class="sf-bn-status-row">
            ${isGM
              ? `<select class="sf-bn-status-sel" data-act="status">
                  ${STATUSES.map(s => `<option value="${s.id}" ${s.id === (card.status ?? 'wanted') ? 'selected' : ''}>${s.label}</option>`).join('')}
                 </select>`
              : `<span class="sf-bn-status-badge" style="color:${status.color};border-color:${status.color}">${status.label}</span>`}
          </div>

          <div class="sf-bn-reward-row">
            <span class="sf-bn-reward-lbl">REWARD</span>
            ${isGM
              ? `<input class="sf-bn-reward-inp" value="${this._esc(card.reward || '')}" placeholder="0 cr" data-act="reward">`
              : `<span class="sf-bn-reward-val">${this._esc(card.reward || '???')}</span>`}
          </div>

          <div class="sf-bn-danger-row">
            <span class="sf-bn-danger-lbl">THREAT</span>
            <div class="sf-bn-danger-bars">
              ${[0,1,2,3].map(i => `
                <span class="sf-bn-dbar${i <= danger ? ' sf-bn-dbar--on' : ''}"
                  style="${i <= danger ? `background:${dColor};border-color:${dColor};box-shadow:0 0 5px ${dColor}80` : ''}"
                  ${isGM ? `data-act="danger" data-val="${i}"` : ''}></span>`).join('')}
            </div>
            <span class="sf-bn-danger-txt" style="color:${dColor}">${dLabel}</span>
          </div>

          <div class="sf-bn-charges-section">
            <div class="sf-bn-charges-lbl">CHARGES</div>
            <ul class="sf-bounty-crimes">
              ${(card.crimes || []).map((cr, i) => `
                <li class="sf-bounty-crime">
                  ${isGM
                    ? `<input class="sf-bn-crime-inp" data-ci="${i}" value="${this._esc(cr)}">`
                    : `<span>${this._esc(cr)}</span>`}
                  ${isGM ? `<button class="sf-bn-del-crime" data-ci="${i}">×</button>` : ''}
                </li>`).join('')}
            </ul>
            ${isGM ? `<button class="sf-bn-pill sf-bn-pill--sm" data-act="add-crime">+ charge</button>` : ''}
          </div>

          ${isGM ? `
          <button class="sf-bn-broadcast-btn" data-act="broadcast">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 8.5C2 8.5 6 4 12 4s10 4.5 10 4.5"/>
              <path d="M5 11.5S8 9 12 9s7 2.5 7 2.5"/>
              <path d="M8 14.5S9.5 13 12 13s4 1.5 4 1.5"/>
              <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
            </svg>
            BROADCAST
          </button>` : ''}
        </div>` : `
        <div class="sf-bounty-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 8 0v2"/>
            <line x1="17" y1="11" x2="23" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/>
          </svg>
          <p>NO ACTIVE BOUNTIES</p>
          ${isGM ? `<button class="sf-bn-pill sf-bn-pill--add" data-act="add">POST BOUNTY</button>` : ''}
        </div>`}

        <div class="sf-bounty-nav-row">
          <button class="sf-bn-nav" data-act="prev" ${len <= 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="sf-bounty-dots">
            ${this.cards.map((_, i) =>
              `<span class="sf-bn-dot${i === this.current ? ' sf-bn-dot--on' : ''}"></span>`
            ).join('')}
          </div>
          <button class="sf-bn-nav" data-act="next" ${len <= 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

      </div>
    `;

    this._listen(c);
  }

  _listen(c) {
    const $ = window.$;
    const $c = $(c);
    const isGM = game.user.isGM;

    $c.find('[data-act="prev"]').on('click', () => {
      if (!this.cards.length) return;
      this.current = (this.current - 1 + this.cards.length) % this.cards.length;
      this._render();
    });
    $c.find('[data-act="next"]').on('click', () => {
      if (!this.cards.length) return;
      this.current = (this.current + 1) % this.cards.length;
      this._render();
    });

    if (!isGM) return;

    $c.find('[data-act="add"]').on('click', async () => {
      this.cards.push({ img: 'icons/svg/mystery-man.svg', name: 'NEW TARGET',
        reward: '0 cr', crimes: [], status: 'wanted', danger: 0 });
      this.current = this.cards.length - 1;
      await this.save(); this._render();
    });

    $c.find('[data-act="delete"]').on('click', async () => {
      if (!this.cards.length) return;
      const ok = await Dialog.confirm({ title: 'Delete Target',
        content: `<p>Remove <b>${this.cards[this.current]?.name}</b>?</p>` });
      if (!ok) return;
      this.cards.splice(this.current, 1);
      this.current = Math.max(0, this.current - 1);
      await this.save(); this._render();
    });

    $c.find('[data-act="broadcast"]').on('click', async () => {
      const card   = this.cards[this.current];
      const status = STATUSES.find(s => s.id === (card?.status ?? 'wanted')) ?? STATUSES[0];
      const danger = DANGER_LABELS[Math.min(3, card?.danger ?? 0)];
      await ChatMessage.create({
        content: `
          <div style="font-family:'Orbitron',sans-serif;padding:12px;
            border:1px solid ${status.color};border-radius:10px;
            background:rgba(0,5,15,.85);color:#cdd;">
            <div style="color:${status.color};letter-spacing:.3em;font-size:10px;margin-bottom:8px">
              ◈ BOUNTY NETWORK BROADCAST
            </div>
            ${card.img ? `<img src="${card.img}" style="width:60px;height:60px;border-radius:50%;border:2px solid ${status.color};float:left;margin:0 10px 8px 0;object-fit:cover">` : ''}
            <div style="font-size:14px;font-weight:700;color:#fff">${card.name}</div>
            <div style="font-size:9px;margin:2px 0 6px;color:${status.color};letter-spacing:.2em">${status.label}</div>
            <div style="font-size:9px;color:#aab;clear:both">
              <span style="color:#888">REWARD</span> <span style="color:#44ff88">${card.reward || '???'}</span>
              &nbsp;·&nbsp; <span style="color:#888">THREAT</span> <span style="color:${DANGER_COLORS[card.danger ?? 0]}">${danger}</span>
            </div>
            ${card.crimes?.length ? `<div style="margin-top:6px;font-size:9px;color:#888">
              ${card.crimes.map(cr => `<div>— ${cr}</div>`).join('')}
            </div>` : ''}
          </div>`,
        speaker: ChatMessage.getSpeaker({ alias: 'Bounty Network' })
      });
    });

    $c.find('[data-act="img"]').on('click', () => {
      new FilePicker({ type: 'image', current: this.cards[this.current]?.img,
        callback: async path => { this.cards[this.current].img = path; await this.save(); this._render(); }
      }).browse();
    });

    $c.find('[data-act="name"]').on('change', async ev => {
      this.cards[this.current].name = ev.target.value; await this.save();
    });
    $c.find('[data-act="reward"]').on('change', async ev => {
      this.cards[this.current].reward = ev.target.value; await this.save();
    });
    $c.find('[data-act="status"]').on('change', async ev => {
      this.cards[this.current].status = ev.target.value; await this.save(); this._render();
    });
    $c.find('[data-act="danger"]').on('click', async ev => {
      this.cards[this.current].danger = parseInt(ev.currentTarget.dataset.val);
      await this.save(); this._render();
    });

    $c.find('.sf-bn-crime-inp').on('change', async ev => {
      const i = parseInt(ev.target.dataset.ci);
      this.cards[this.current].crimes[i] = ev.target.value; await this.save();
    });
    $c.find('.sf-bn-del-crime').on('click', async ev => {
      const i = parseInt(ev.currentTarget.dataset.ci);
      this.cards[this.current].crimes.splice(i, 1);
      await this.save(); this._render();
    });
    $c.find('[data-act="add-crime"]').on('click', async () => {
      this.cards[this.current].crimes.push('New charge');
      await this.save(); this._render();
    });

    // Drag actor onto card to auto-fill name + image
    const card = c.querySelector('#sf-bn-card');
    if (card) {
      card.addEventListener('dragover', e => e.preventDefault());
      card.addEventListener('drop', async e => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.type === 'Actor') {
            const actor = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
            if (actor) {
              this.cards[this.current].img  = actor.img;
              this.cards[this.current].name = actor.name;
              await this.save(); this._render();
            }
          }
        } catch(_) {}
      });
    }
  }
}
