const SHOP_NS  = 'starfinderdashboard';
const SHOP_KEY = 'sf2eShops';

const CATS = [
  { id:'all',            label:'All',               icon:'◈' },
  { id:'weapon',         label:'Weapons',            icon:'⚔' },
  { id:'armor',          label:'Armor',              icon:'🛡' },
  { id:'grenade',        label:'Grenades',           icon:'💥' },
  { id:'shield',         label:'Shields',            icon:'🔰' },
  { id:'upgrade-armor',  label:'Armor Upgrades',     icon:'⚙' },
  { id:'upgrade-weapon', label:'Weapon Upgrades',    icon:'🔩' },
  { id:'augment',        label:'Augmentations',      icon:'◉' },
  { id:'crystal',        label:'Solarian Crystals',  icon:'💎' },
  { id:'consumable',     label:'Consumables',        icon:'⬡' },
  { id:'medical',        label:'Medical',            icon:'✚' },
  { id:'ammo',           label:'Ammo',               icon:'⬟' },
  { id:'tech',           label:'Tech',               icon:'⚡' },
  { id:'misc',           label:'Misc',               icon:'◻' },
];

export class StarfinderShopApp {
  constructor() {
    this._container   = null;
    this._initialized = false;
    this.shops        = [];
    this.shopIdx      = 0;
    this.category     = 'all';
    this.query        = '';
    this.cart         = [];
    this.view         = 'list';
    this.filterOpen   = false;
  }

  static registerSettings() {
    try {
      game.settings.register(SHOP_NS, SHOP_KEY, {
        name: 'SF2e Shop Data', scope: 'world', config: false,
        type: Array, default: []
      });
    } catch(e) { console.debug('SF Shop: settings already registered', e); }
  }

  async renderInto(container) {
    this._container = container;
    this._loadShops();
    this._render();
    this._initialized = true;
  }

  _loadShops() {
    try { this.shops = game.settings.get(SHOP_NS, SHOP_KEY) || []; } catch(e) { this.shops = []; }
  }

  async _saveShops() {
    if (!game.user.isGM) return;
    await game.settings.set(SHOP_NS, SHOP_KEY, this.shops);
  }

  _getActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
  }

  // Dynamically discover currency fields from game.model (like Monk's Active Tiles).
  // Returns the currency object from the system schema for the actor's type.
  _currencyModel(actor) {
    try {
      const type = actor?.type ?? 'character';
      return game.model?.Actor?.[type]?.currency ?? game.model?.Actor?.character?.currency ?? null;
    } catch(e) { return null; }
  }

  // Find the actual field name for credits in the actor's currency object.
  // sfrpg uses 'credit' (singular); other systems may use 'credits' or 'gp'.
  _creditKey(actor) {
    const c     = actor?.system?.currency ?? {};
    const model = this._currencyModel(actor);
    const id    = game.system.id;

    if (id === 'sfrpg') {
      // Prefer the key that actually exists on the data; sfrpg schema uses 'credit' (singular)
      if ('credit'  in c)     return 'credit';
      if ('credits' in c)     return 'credits';
      if (model && 'credit'  in model) return 'credit';
      if (model && 'credits' in model) return 'credits';
      return 'credit'; // canonical sfrpg field
    }
    if (id === 'sf2e') {
      if ('credits' in c)     return 'credits';
      if (model && 'credits' in model) return 'credits';
      return null; // sf2e uses sp/gp/pp fallback
    }
    return null;
  }

  _getCredits(actor) {
    if (!actor) return 0;
    const sys = actor.system;
    const id  = game.system.id;

    if (id === 'sfrpg') {
      const key = this._creditKey(actor);
      return Number(sys?.currency?.[key] ?? 0);
    }

    // sf2e (Starfinder 2e) is built on PF2e — credits are stored as 'sp' (silver pieces)
    // in actor.inventory.coins, NOT in system.currency.credits.
    if (id === 'sf2e') {
      const invCoins = actor.inventory?.coins;
      if (invCoins) return Number(invCoins.sp ?? 0);
      return Number(sys?.currency?.sp ?? 0);
    }

    // PF2e also uses item-based coins; gp is the main denomination.
    if (id === 'pf2e') {
      const invCoins = actor.inventory?.coins;
      if (invCoins) {
        return Number(invCoins.pp ?? 0) * 10
             + Number(invCoins.gp ?? 0)
             + Number(invCoins.sp ?? 0) / 10
             + Number(invCoins.cp ?? 0) / 100;
      }
      return Number(sys?.currency?.gp ?? 0);
    }

    // Generic: use game.model to discover currency fields dynamically
    const model = this._currencyModel(actor);
    const c     = sys?.currency ?? {};
    if (model) {
      // Sum every field present in the schema; treat each unit as 1 credit
      // (works for any single-denomination system; multi-denom systems handled above)
      return Object.keys(model).reduce((sum, k) => sum + (Number(c[k]) || 0), 0);
    }
    // D&D 5e fallback — sum to gp-equivalent
    const COIN_GP = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 };
    return Object.entries(COIN_GP).reduce((sum, [k, v]) => sum + (Number(c[k] ?? 0) * v), 0);
  }

  async _deductCredits(actor, amount) {
    if (!actor) return false;
    const sys = actor.system;
    const id  = game.system.id;

    if (id === 'sfrpg') {
      const key = this._creditKey(actor);
      const cur = Number(sys?.currency?.[key] ?? 0);
      if (cur < amount) return false;
      await actor.update({ [`system.currency.${key}`]: cur - amount });
      return true;
    }

    // sf2e: credits = sp in actor.inventory.coins.
    // Use pf2e's removeCoins API (preferred) or fall back to direct update.
    if (id === 'sf2e') {
      const credits = this._getCredits(actor);
      if (credits < amount) return false;
      if (typeof actor.inventory?.removeCoins === 'function') {
        const ok = await actor.inventory.removeCoins({ sp: amount });
        return ok !== false;
      }
      // Fallback: direct field update
      await actor.update({ 'system.currency.sp': Math.max(0, credits - amount) });
      return true;
    }

    if (id === 'pf2e') {
      const cur = Number(sys?.currency?.gp ?? 0);
      if (cur < amount) return false;
      if (typeof actor.inventory?.removeCoins === 'function') {
        const ok = await actor.inventory.removeCoins({ gp: amount });
        return ok !== false;
      }
      await actor.update({ 'system.currency.gp': cur - amount });
      return true;
    }

    // Generic: use game.model to discover currency fields dynamically
    const model = this._currencyModel(actor);
    const c     = sys?.currency ?? {};
    if (model) {
      const keys = Object.keys(model);
      // Find which field(s) hold value and deduct greedily from the largest
      let rem = amount;
      const updates = {};
      for (const k of keys) {
        const val = Number(c[k] ?? 0);
        if (val <= 0 || rem <= 0) continue;
        const take = Math.min(val, rem);
        updates[`system.currency.${k}`] = val - take;
        rem -= take;
      }
      if (rem > 0) return false; // not enough in any field
      await actor.update(updates);
      return true;
    }

    // D&D 5e fallback
    const gp = (Number(c.pp ?? 0) * 10) + Number(c.gp ?? 0);
    if (gp < amount) return false;
    let rem = gp - amount;
    const pp = Math.floor(rem / 10); rem = rem % 10;
    await actor.update({ 'system.currency.pp': pp, 'system.currency.gp': rem });
    return true;
  }

  async _addToInventory(actor, item, qty = 1) {
    const type  = item._sourceData?.type ?? this._mapType(item.category);
    const match = actor.items.find(i => i.name === item.name && i.type === type);
    if (match) {
      const q = match.system?.quantity ?? 1;
      await match.update({ 'system.quantity': q + qty });
    } else {
      let data;
      if (item._sourceData) {
        data = foundry.utils.duplicate(item._sourceData);
        data.name = item.name;
        data.img  = item.img || data.img || 'icons/svg/item-bag.svg';
        if (!data.system) data.system = {};
        data.system.quantity = qty;
        delete data._id;
      } else {
        data = {
          name: item.name, type,
          img:  item.img || 'icons/svg/item-bag.svg',
          system: { description: { value: item.description || '' }, quantity: qty }
        };
      }
      await actor.createEmbeddedDocuments('Item', [data]);
    }
  }

  _mapType(cat) {
    if (game.system.id === 'sfrpg') {
      return {
        weapon:'weapon', armor:'armor', grenade:'weapon', shield:'shield',
        'upgrade-armor':'technological', 'upgrade-weapon':'technological',
        augment:'augmentation', crystal:'equipment', consumable:'consumable',
        medical:'consumable', ammo:'ammo', tech:'technological', misc:'goods'
      }[cat] ?? 'goods';
    }
    if (game.system.id === 'pf2e' || game.system.id === 'sf2e') {
      return {
        weapon:'weapon', armor:'armor', grenade:'weapon', shield:'shield',
        'upgrade-armor':'equipment', 'upgrade-weapon':'equipment',
        augment:'equipment', crystal:'equipment', consumable:'consumable',
        medical:'consumable', ammo:'ammo', tech:'equipment', misc:'equipment'
      }[cat] ?? 'equipment';
    }
    return { weapon:'weapon', armor:'equipment', grenade:'weapon', misc:'loot', medical:'consumable', augment:'loot', tech:'loot' }[cat] ?? 'loot';
  }

  _fmt(n)  { return new Intl.NumberFormat().format(n || 0) + ' ¢'; }
  _esc(s)  { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
  _catLbl(id) { return CATS.find(c => c.id === id)?.label ?? id; }
  _uid()   { return foundry.utils.randomID(); }

  _buildItemCard(item) {
    const cartQty = this.cart.find(r => r.item.id === item.id)?.qty ?? 0;
    const oos      = item.stock === 0;
    const stockTxt = item.stock === null ? '∞' : oos ? 'OUT' : `${item.stock}`;
    const stockCls = oos ? 'sf-mkt-stock--out' : (item.stock !== null && item.stock <= 3 ? 'sf-mkt-stock--low' : '');
    return `
      <div class="sf-mkt-item${oos ? ' sf-mkt-item--oos' : ''}" data-item-id="${item.id}">
        <img class="sf-mkt-item-img" src="${item.img || 'icons/svg/item-bag.svg'}" onerror="this.src='icons/svg/item-bag.svg'" alt="">
        <div class="sf-mkt-item-body">
          <div class="sf-mkt-item-name">${this._esc(item.name)}</div>
          <div class="sf-mkt-item-tags">
            <span class="sf-mkt-cat-tag">${this._catLbl(item.category)}</span>
            ${item.level ? `<span class="sf-mkt-lvl-tag">Lv${item.level}</span>` : ''}
            <span class="sf-mkt-stock-tag ${stockCls}">${stockTxt}</span>
          </div>
          <div class="sf-mkt-item-price">${this._fmt(item.price)}</div>
        </div>
        <div class="sf-mkt-item-ctrls">
          <span class="sf-mkt-in-cart" id="sf-ic-${item.id}" ${cartQty ? '' : 'style="display:none"'}>+${cartQty || 0}</span>
          <button class="sf-mkt-add-btn" data-action="add" data-item-id="${item.id}" ${oos ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>`;
  }

  _buildFilterHTML(shop) {
    const shopCats  = new Set((shop.items || []).map(i => i.category));
    const available = CATS.filter(c => c.id === 'all' || shopCats.has(c.id));
    const cur       = available.find(c => c.id === this.category) ?? available[0];
    const panel     = this.filterOpen ? `
      <div class="sf-mkt-filter-panel">
        ${available.map(c => `
          <button class="sf-mkt-filter-btn${c.id === this.category ? ' sf-mkt-filter-btn--on' : ''}" data-action="set-cat" data-cat="${c.id}">
            <span class="sf-mkt-filter-btn-ico">${c.icon}</span><span>${c.label}</span>
          </button>`).join('')}
      </div>` : '';
    return `
      <button class="sf-mkt-filter-toggle" data-action="toggle-filter">
        <span class="sf-mkt-filter-ico">${cur?.icon ?? '◈'}</span>
        <span class="sf-mkt-filter-lbl">${cur?.label ?? 'All'}</span>
        <svg class="sf-mkt-filter-chev${this.filterOpen ? ' open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>${panel}`;
  }

  _listenFilter(shop) {
    const wrap = this._container.querySelector('.sf-mkt-filter-wrap');
    if (!wrap) return;
    wrap.querySelector('[data-action="toggle-filter"]')
      ?.addEventListener('click', () => {
        this.filterOpen = !this.filterOpen;
        wrap.innerHTML = this._buildFilterHTML(shop);
        this._listenFilter(shop);
      });
    wrap.querySelectorAll('[data-action="set-cat"]').forEach(btn =>
      btn.addEventListener('click', ev => {
        this.category   = ev.currentTarget.dataset.cat;
        this.filterOpen = false;
        wrap.innerHTML  = this._buildFilterHTML(shop);
        this._listenFilter(shop);
        this._refreshItems(shop);
      })
    );
  }

  _refreshItems(shop) {
    // Filter items
    const items = (shop.items || []).filter(item => {
      if (this.category !== 'all' && item.category !== this.category) return false;
      if (this.query) {
        const q = this.query.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
      }
      return true;
    });
    // Patch only the items list — input keeps focus
    const el = this._container.querySelector('.sf-mkt-items');
    if (el) el.innerHTML = items.length
      ? items.map(i => this._buildItemCard(i)).join('')
      : `<div class="sf-mkt-no-results"><p>No items match.</p></div>`;
  }

  _render() {
    if (!this._container) return;
    switch (this.view) {
      case 'list':      return this._renderList();
      case 'shop':      return this._renderShop();
      case 'cart':      return this._renderCart();
      case 'gm-shops':  return this._renderGMShops();
      case 'gm-items':  return this._renderGMItems();
    }
  }

  /* ══════════════════ VIEW: SHOP LIST ══════════════════ */
  _renderList() {
    const isGM = game.user.isGM;
    const cards = this.shops.map((s, i) => `
      <div class="sf-mkt-shop-card" data-shop-idx="${i}">
        <div class="sf-mkt-shop-card-visual">
          ${s.img
            ? `<img src="${this._esc(s.img)}" onerror="this.style.display='none'">`
            : `<div class="sf-mkt-shop-card-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>`}
        </div>
        <div class="sf-mkt-shop-card-body">
          <div class="sf-mkt-shop-card-name">${this._esc(s.name)}</div>
          ${s.keeper ? `<div class="sf-mkt-shop-card-keeper">${this._esc(s.keeper)}</div>` : ''}
          ${s.description ? `<div class="sf-mkt-shop-card-desc">${this._esc(s.description)}</div>` : ''}
          <div class="sf-mkt-shop-card-meta">${(s.items||[]).length} items available</div>
        </div>
        <button class="sf-mkt-enter-btn" data-action="enter" data-idx="${i}" title="Enter shop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>`).join('') || `
      <div class="sf-mkt-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="52" height="52"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <p>NO SHOPS AVAILABLE</p>
        <p class="sf-mkt-empty-sub">${isGM ? 'Use the manager to create shops.' : 'Check back later.'}</p>
      </div>`;

    this._container.innerHTML = `
      <div class="sf-mkt sf-mkt--list">
        <div class="sf-mkt-list-hdr">
          <span class="sf-mkt-list-title">◈ GALACTIC MARKET</span>
          ${isGM ? `<button class="sf-mkt-mgr-btn" data-action="gm-shops" title="Manage shops">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>` : ''}
        </div>
        <div class="sf-mkt-shop-cards">${cards}</div>
      </div>`;
    const $c = $(this._container);
    $c.find('[data-action="enter"]').on('click', ev => {
      const idx = Number.parseInt(ev.currentTarget.dataset.idx);
      if (idx !== this.shopIdx) this.cart = [];
      this.shopIdx = idx; this.category = 'all'; this.query = ''; this.view = 'shop'; this._render();
    });
    $c.find('.sf-mkt-shop-card').on('click', ev => {
      if (ev.target.closest('[data-action]')) return;
      const idx = Number.parseInt(ev.currentTarget.dataset.shopIdx);
      if (idx !== this.shopIdx) this.cart = [];
      this.shopIdx = idx; this.category = 'all'; this.query = ''; this.view = 'shop'; this._render();
    });
    $c.find('[data-action="gm-shops"]').on('click', () => { this.view = 'gm-shops'; this._render(); });
  }

  /* ══════════════════ VIEW: SHOP BROWSE ══════════════════ */
  _renderShop() {
    const shop = this.shops[this.shopIdx];
    if (!shop) { this.view = 'list'; return this._render(); }
    const actor      = this._getActor();
    const credits    = this._getCredits(actor);
    const cartCount  = this.cart.reduce((s, r) => s + r.qty, 0);

    let items = (shop.items || []).filter(item => {
      if (this.category !== 'all' && item.category !== this.category) return false;
      if (this.query) {
        const q = this.query.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
      }
      return true;
    });

    const itemCards = items.length
      ? items.map(item => this._buildItemCard(item)).join('')
      : `<div class="sf-mkt-no-results"><p>No items match.</p></div>`;

    this._container.innerHTML = `
      <div class="sf-mkt sf-mkt--shop">
        <div class="sf-mkt-topbar">
          <button class="sf-mkt-back-btn" data-action="go-list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div class="sf-mkt-topbar-info">
            <span class="sf-mkt-topbar-name">${this._esc(shop.name)}</span>
            ${shop.keeper ? `<span class="sf-mkt-topbar-sub">${this._esc(shop.keeper)}</span>` : ''}
          </div>
          <button class="sf-mkt-cart-btn" data-action="go-cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            ${cartCount > 0 ? `<span class="sf-mkt-cart-badge" id="sf-cart-badge">${cartCount}</span>` : `<span class="sf-mkt-cart-badge" id="sf-cart-badge" style="display:none">${cartCount}</span>`}
          </button>
        </div>

        <div class="sf-mkt-search-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sf-mkt-search-ico"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" class="sf-mkt-search-inp" placeholder="Search ${this._esc(shop.name)}…" value="${this._esc(this.query)}">
        </div>

        <div class="sf-mkt-filter-wrap">${this._buildFilterHTML(shop)}</div>

        <div class="sf-mkt-items-area"><div class="sf-mkt-items">${itemCards}</div></div>

        <div class="sf-mkt-credits-bar">
          ${actor
            ? `<span class="sf-mkt-credits-who">${this._esc(actor.name)}</span><span class="sf-mkt-credits-val">${this._fmt(credits)}</span>`
            : `<span class="sf-mkt-no-actor">⚠ Select a token first</span>`}
        </div>
      </div>`;

    const $c = $(this._container);
    $c.find('[data-action="go-list"]').on('click', () => { this.view = 'list'; this._render(); });
    $c.find('[data-action="go-cart"]').on('click', () => { this.view = 'cart'; this._render(); });
    this._listenFilter(shop);
    $c.find('.sf-mkt-search-inp').on('input', ev => { this.query = ev.currentTarget.value; this._refreshItems(shop); });

    $c.find('.sf-mkt-items-area').on('click', '[data-action="add"]', ev => {
      const itemId = ev.currentTarget.dataset.itemId;
      const item   = shop.items.find(i => i.id === itemId);
      if (!item) return;
      const entry = this.cart.find(r => r.item.id === itemId);
      if (entry) {
        if (item.stock !== null && entry.qty >= item.stock) { ui.notifications.warn('Not enough stock!'); return; }
        entry.qty++;
      } else {
        this.cart.push({ item, qty: 1 });
      }
      const qty = this.cart.find(r => r.item.id === itemId)?.qty ?? 0;
      const total = this.cart.reduce((s, r) => s + r.qty, 0);
      // update badge
      const badge = document.getElementById('sf-cart-badge');
      if (badge) { badge.textContent = total; badge.style.display = ''; }
      // update in-cart indicator
      const ic = document.getElementById(`sf-ic-${itemId}`);
      if (ic) { ic.textContent = `+${qty}`; ic.style.display = ''; }
      // flash button
      const btn = ev.currentTarget;
      btn.classList.add('sf-mkt-add-btn--flash');
      setTimeout(() => btn.classList.remove('sf-mkt-add-btn--flash'), 500);
    });
  }

  /* ══════════════════ VIEW: CART ══════════════════ */
  _renderCart() {
    const shop   = this.shops[this.shopIdx];
    const actor  = this._getActor();
    const credits = this._getCredits(actor);
    const total   = this.cart.reduce((s, r) => s + r.item.price * r.qty, 0);
    const canBuy  = actor && credits >= total && this.cart.length > 0;

    const rows = this.cart.length ? this.cart.map(r => `
      <div class="sf-cart-row">
        <img class="sf-cart-row-img" src="${r.item.img || 'icons/svg/item-bag.svg'}" onerror="this.src='icons/svg/item-bag.svg'" alt="">
        <div class="sf-cart-row-info">
          <div class="sf-cart-row-name">${this._esc(r.item.name)}</div>
          <div class="sf-cart-row-unit">${this._fmt(r.item.price)} each</div>
        </div>
        <div class="sf-cart-row-right">
          <div class="sf-cart-qty-ctrl">
            <button class="sf-cart-qty-btn" data-action="dec" data-id="${r.item.id}">−</button>
            <span class="sf-cart-qty-num">${r.qty}</span>
            <button class="sf-cart-qty-btn" data-action="inc" data-id="${r.item.id}" ${r.item.stock !== null && r.qty >= r.item.stock ? 'disabled' : ''}>+</button>
          </div>
          <div class="sf-cart-row-total">${this._fmt(r.item.price * r.qty)}</div>
          <button class="sf-cart-del-btn" data-action="rm" data-id="${r.item.id}" title="Remove">×</button>
        </div>
      </div>`).join('') : `
      <div class="sf-cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <p>CART IS EMPTY</p>
      </div>`;

    this._container.innerHTML = `
      <div class="sf-mkt sf-mkt--cart">
        <div class="sf-mkt-topbar">
          <button class="sf-mkt-back-btn" data-action="go-shop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <span class="sf-mkt-topbar-name">CART · ${shop?.name ?? ''}</span>
          ${this.cart.length ? `<button class="sf-cart-clear-btn" data-action="clear" title="Clear cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-.9 14a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/></svg>
          </button>` : '<div></div>'}
        </div>

        <div class="sf-cart-rows">${rows}</div>

        ${this.cart.length ? `
        <div class="sf-cart-summary">
          <div class="sf-cart-sum-row">
            <span>Items (${this.cart.reduce((s,r)=>s+r.qty,0)})</span>
            <span>${this._fmt(total)}</span>
          </div>
          <div class="sf-cart-sum-row sf-cart-sum-row--credits">
            <span>Your Credits</span>
            <span class="${credits < total ? 'sf-cart-insufficient' : ''}">${this._fmt(credits)}</span>
          </div>
          ${!actor ? `<div class="sf-cart-warn">⚠ No character selected</div>` :
            credits < total ? `<div class="sf-cart-warn">⚠ Not enough credits</div>` : ''}
        </div>
        <div class="sf-cart-footer">
          <button class="sf-cart-buy-btn" data-action="buy" ${!canBuy ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            CONFIRM PURCHASE
          </button>
        </div>` : ''}
      </div>`;

    const $c = $(this._container);
    $c.find('[data-action="go-shop"]').on('click', () => { this.view = 'shop'; this._render(); });
    $c.find('[data-action="clear"]').on('click', () => {
      Dialog.confirm({ title:'Clear Cart', content:'<p>Remove all items?</p>',
        yes: () => { this.cart = []; this._render(); } });
    });
    $c.find('[data-action="inc"]').on('click', ev => {
      const entry = this.cart.find(r => r.item.id === ev.currentTarget.dataset.id);
      if (!entry) return;
      if (entry.item.stock !== null && entry.qty >= entry.item.stock) { ui.notifications.warn('Not enough stock!'); return; }
      entry.qty++; this._render();
    });
    $c.find('[data-action="dec"]').on('click', ev => {
      const id = ev.currentTarget.dataset.id;
      const idx = this.cart.findIndex(r => r.item.id === id);
      if (idx < 0) return;
      if (this.cart[idx].qty <= 1) this.cart.splice(idx, 1);
      else this.cart[idx].qty--;
      this._render();
    });
    $c.find('[data-action="rm"]').on('click', ev => {
      this.cart = this.cart.filter(r => r.item.id !== ev.currentTarget.dataset.id);
      this._render();
    });
    $c.find('[data-action="buy"]').on('click', () => this._confirmPurchase(shop));
  }

  /* ══════════════════ VIEW: GM SHOPS ══════════════════ */
  _renderGMShops() {
    if (!game.user.isGM) { this.view = 'list'; return this._render(); }
    const rows = this.shops.map((s, i) => `
      <div class="sf-gm-row">
        <div class="sf-gm-row-info">
          <div class="sf-gm-row-name">${this._esc(s.name)}</div>
          <div class="sf-gm-row-sub">${(s.items||[]).length} items</div>
        </div>
        <div class="sf-gm-row-btns">
          <button class="sf-gm-btn sf-gm-btn--list" data-action="items" data-idx="${i}" title="Edit items">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          </button>
          <button class="sf-gm-btn sf-gm-btn--edit" data-action="edit" data-idx="${i}" title="Edit shop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="sf-gm-btn sf-gm-btn--del" data-action="del" data-idx="${i}" title="Delete shop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-.9 14a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/></svg>
          </button>
        </div>
      </div>`).join('') || `<div class="sf-gm-empty"><p>No shops yet.</p></div>`;

    this._container.innerHTML = `
      <div class="sf-mkt sf-mkt--gm">
        <div class="sf-mkt-topbar">
          <button class="sf-mkt-back-btn" data-action="go-list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <span class="sf-mkt-topbar-name">SHOP MANAGER</span>
          <button class="sf-gm-add-btn" data-action="add-shop" title="New shop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div class="sf-gm-list">${rows}</div>
      </div>`;

    const $c = $(this._container);
    $c.find('[data-action="go-list"]').on('click', () => { this.view = 'list'; this._render(); });
    $c.find('[data-action="add-shop"]').on('click', () => this._shopDialog());
    $c.find('[data-action="edit"]').on('click', ev => {
      this.shopIdx = Number.parseInt(ev.currentTarget.dataset.idx);
      this._shopDialog(this.shops[this.shopIdx]);
    });
    $c.find('[data-action="items"]').on('click', ev => {
      this.shopIdx = Number.parseInt(ev.currentTarget.dataset.idx);
      this.view = 'gm-items'; this._render();
    });
    $c.find('[data-action="del"]').on('click', async ev => {
      const idx = Number.parseInt(ev.currentTarget.dataset.idx);
      const ok = await Dialog.confirm({ title:'Delete Shop', content:`<p>Delete <b>${this._esc(this.shops[idx]?.name)}</b> and all its items?</p>` });
      if (!ok) return;
      this.shops.splice(idx, 1);
      await this._saveShops(); this._render();
    });
  }

  /* ══════════════════ VIEW: GM ITEMS ══════════════════ */
  _renderGMItems() {
    if (!game.user.isGM) { this.view = 'list'; return this._render(); }
    const shop = this.shops[this.shopIdx];
    if (!shop) { this.view = 'gm-shops'; return this._render(); }
    const rows = (shop.items || []).map((item, i) => `
      <div class="sf-gm-item-row">
        <img class="sf-gm-item-img" src="${item.img || 'icons/svg/item-bag.svg'}" onerror="this.src='icons/svg/item-bag.svg'" alt="">
        <div class="sf-gm-item-info">
          <div class="sf-gm-item-name">${this._esc(item.name)}</div>
          <div class="sf-gm-item-meta">
            <span>${this._fmt(item.price)}</span>
            <span class="sf-gm-cat-tag">${this._catLbl(item.category)}</span>
            <span class="sf-gm-stock-tag">${item.stock === null ? '∞' : item.stock}</span>
          </div>
        </div>
        <div class="sf-gm-row-btns">
          <button class="sf-gm-btn sf-gm-btn--edit" data-action="edit-item" data-iidx="${i}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="sf-gm-btn sf-gm-btn--del" data-action="del-item" data-iidx="${i}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-.9 14a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/></svg>
          </button>
        </div>
      </div>`).join('') || `<div class="sf-gm-empty"><p>No items in this shop.</p></div>`;

    this._container.innerHTML = `
      <div class="sf-mkt sf-mkt--gm">
        <div class="sf-mkt-topbar">
          <button class="sf-mkt-back-btn" data-action="go-gm-shops">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <span class="sf-mkt-topbar-name">${this._esc(shop.name)}</span>
          <div class="sf-gm-topbar-btns">
            <button class="sf-gm-import-btn" data-action="import-json" title="Import items from JSON file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <button class="sf-gm-add-btn" data-action="add-item" title="Add item manually">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        <div class="sf-gm-list">
          <div class="sf-gm-drop-zone" id="sf-gm-drop-zone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            DRAG FROM COMPENDIUM · OR USE JSON ↑
          </div>
          ${rows}
        </div>
      </div>`;

    const $c = $(this._container);
    $c.find('[data-action="go-gm-shops"]').on('click', () => { this.view = 'gm-shops'; this._render(); });
    $c.find('[data-action="add-item"]').on('click', () => this._itemDialog(shop));
    $c.find('[data-action="import-json"]').on('click', () => this._importJson(shop));
    $c.find('[data-action="edit-item"]').on('click', ev => {
      const i = Number.parseInt(ev.currentTarget.dataset.iidx);
      this._itemDialog(shop, shop.items[i], i);
    });
    $c.find('[data-action="del-item"]').on('click', async ev => {
      const i = Number.parseInt(ev.currentTarget.dataset.iidx);
      const ok = await Dialog.confirm({ title:'Delete Item', content:`<p>Remove <b>${this._esc(shop.items[i]?.name)}</b>?</p>` });
      if (!ok) return;
      shop.items.splice(i, 1);
      await this._saveShops(); this._render();
    });
    this._setupDropZone(shop);
  }

  /* ══════════════════ DRAG-DROP & JSON IMPORT ══════════════════ */

  _setupDropZone(shop) {
    const zone = this._container.querySelector('#sf-gm-drop-zone');
    if (!zone) return;
    let n = 0;
    this._container.addEventListener('dragenter', () => { n++; zone.classList.add('sf-gm-drop-zone--active'); });
    this._container.addEventListener('dragleave', () => { n = Math.max(0, n - 1); if (!n) zone.classList.remove('sf-gm-drop-zone--active'); });
    this._container.addEventListener('dragover',  ev => ev.preventDefault());
    this._container.addEventListener('drop', async ev => {
      ev.preventDefault(); n = 0; zone.classList.remove('sf-gm-drop-zone--active');
      await this._handleDrop(ev, shop);
    });
  }

  async _handleDrop(ev, shop) {
    const raw = ev.dataTransfer.getData('text/plain');
    if (!raw) return;
    let drag;
    try { drag = JSON.parse(raw); } catch(e) { console.debug('SF Shop drop parse error', e); return; }
    if (drag.type !== 'Item') { ui.notifications.warn('Drop an Item from the compendium.'); return; }
    let rawItem = null;
    if (drag.uuid) {
      const doc = await fromUuid(drag.uuid).catch(e => { console.debug('SF Shop: fromUuid failed', e); return null; });
      if (!doc) { ui.notifications.warn('Could not fetch item from compendium.'); return; }
      rawItem = doc.toObject();
    } else if (drag.data) {
      rawItem = drag.data;
    }
    if (!rawItem) return;
    if ((shop.items || []).some(i => i.name === rawItem.name)) {
      ui.notifications.info(`"${rawItem.name}" already exists in this shop.`); return;
    }
    if (!shop.items) shop.items = [];
    shop.items.push(this._itemFromFoundryData(rawItem));
    await this._saveShops();
    ui.notifications.info(`Added "${rawItem.name}" to ${shop.name}.`);
    this._render();
  }

  async _importJson(shop) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json'; input.multiple = true;
    const files = await new Promise(resolve => { input.onchange = () => resolve(input.files); input.click(); });
    if (!files || !files.length) return;
    const existing = new Set((shop.items || []).map(i => i.name));
    let added = 0, skipped = 0;
    for (const file of files) {
      let json;
      try { json = JSON.parse(await file.text()); } catch(e) { ui.notifications.warn(`Cannot parse ${file.name}`); console.debug('SF Shop JSON parse error', e); continue; }
      const rawItems = Array.isArray(json) ? json : (json.items ?? []);
      for (const raw of rawItems) {
        if (!raw?.name) continue;
        if (existing.has(raw.name)) { skipped++; continue; }
        if (!shop.items) shop.items = [];
        shop.items.push(this._itemFromFoundryData(raw));
        existing.add(raw.name); added++;
      }
    }
    if (added) await this._saveShops();
    const msg = `Imported ${added} item(s)${skipped ? `, ${skipped} duplicate(s) skipped` : ''}.`;
    ui.notifications.info(msg);
    this._render();
  }

  _itemFromFoundryData(raw) {
    const price = this._extractPriceCredits(raw.system?.price);
    const cat   = this._detectCategory(raw);
    const level = raw.system?.level?.value ?? null;
    const desc  = (raw.system?.description?.value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
    return {
      id:          this._uid(),
      name:        raw.name,
      price,
      category:    cat,
      level:       level || null,
      stock:       null,
      description: desc,
      img:         raw.img || 'icons/svg/item-bag.svg',
      _sourceData: { type: raw.type, img: raw.img, system: raw.system, effects: raw.effects ?? [] },
    };
  }

  _extractPriceCredits(priceData) {
    if (!priceData) return 0;
    const p = priceData.value ?? priceData;
    const id = game.system.id;

    // sfrpg: price is a flat number of credits (system.price.value is a number, or credit/credits key)
    if (id === 'sfrpg') {
      if (typeof p === 'number') return p;
      // Some sfrpg items store price directly as {value: N} (integer credits)
      if (typeof p.value === 'number' && !p.gp && !p.sp && !p.cp && !p.pp) return p.value;
      // Fallback: sum whichever coin fields are present treating each as 1 credit
      return (p.credit ?? p.credits ?? p.gp ?? 0);
    }

    const sp = p.sp ?? 0, gp = p.gp ?? 0, pp = p.pp ?? 0, cp = p.cp ?? 0;
    // sf2e: credits = sp only. pp = UPB (different currency, not convertible to credits).
    if (id === 'sf2e') return Number(sp ?? 0);
    return gp + Math.round(sp / 10) + pp * 10;
  }

  _detectCategory(raw) {
    const type   = raw.type ?? '';
    const traits = raw.system?.traits?.value ?? [];
    const usage  = raw.system?.usage?.value ?? '';
    const group  = raw.system?.group ?? '';
    const base   = raw.system?.baseItem ?? '';
    const slug   = raw.system?.slug ?? (raw.name ?? '').toLowerCase().replace(/\s+/g, '-');

    if (type === 'shield') return 'shield';
    if (type === 'armor')  return 'armor';
    if (type === 'ammo')   return 'ammo';

    if (type === 'weapon') {
      const isGrenade = traits.includes('grenade') || group === 'grenade' || base === 'grenade';
      return isGrenade ? 'grenade' : 'weapon';
    }

    if (usage === 'implanted' || traits.includes('augmentation')) return 'augment';

    if (type === 'consumable') {
      const isMedical = traits.includes('pharmaceutical') || traits.includes('healing') || traits.includes('drug');
      return isMedical ? 'medical' : 'consumable';
    }

    if (type === 'equipment') {
      if (usage === 'implanted') return 'augment';
      if (usage.includes('installed-in-armor')) return 'upgrade-armor';
      if (usage.includes('installed-in-a-weapon') || usage.includes('installed-in-weapon')) return 'upgrade-weapon';
      if (slug.includes('crystal') || traits.includes('solarian-crystal')) return 'crystal';
      const isMedical = traits.includes('pharmaceutical') || traits.includes('healing');
      if (isMedical) return 'medical';
      if (traits.includes('tech')) return 'tech';
    }

    return 'misc';
  }

  /* ══════════════════ DIALOGS ══════════════════ */

  _shopDialog(ex = null) {
    const isEdit = !!ex;
    const fi = `style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"`;
    new Dialog({
      title: isEdit ? `Edit: ${ex.name}` : '[ NEW SHOP ]',
      content: `<div style="display:flex;flex-direction:column;gap:8px;padding:8px">
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">NAME *</label>
          <input name="name" value="${this._esc(ex?.name||'')}" placeholder="e.g. Izlar Arms" ${fi}></div>
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">KEEPER</label>
          <input name="keeper" value="${this._esc(ex?.keeper||'')}" placeholder="Run by…" ${fi}></div>
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">DESCRIPTION</label>
          <textarea name="desc" style="width:100%;height:55px;resize:vertical;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box">${this._esc(ex?.description||'')}</textarea></div>
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">IMAGE URL</label>
          <input name="img" value="${this._esc(ex?.img||'')}" placeholder="https://…" ${fi}></div>
      </div>`,
      buttons: {
        save: { label: isEdit ? 'Save' : 'Create', callback: async html => {
          const name = html.find('[name="name"]').val()?.trim();
          if (!name) { ui.notifications.warn('Name required.'); return false; }
          const data = { name, keeper: html.find('[name="keeper"]').val().trim(), description: html.find('[name="desc"]').val().trim(), img: html.find('[name="img"]').val().trim() };
          if (isEdit) { Object.assign(this.shops.find(s => s === ex), data); }
          else { this.shops.push({ id: this._uid(), ...data, items: [] }); }
          await this._saveShops(); this._render();
        }},
        cancel: { label:'Cancel' }
      }, default:'save'
    }).render(true);
  }

  _itemDialog(shop, ex = null, iIdx = -1) {
    const isEdit = !!ex;
    const fi = `style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"`;
    const catOpts = CATS.filter(c => c.id !== 'all').map(c =>
      `<option value="${c.id}" ${ex?.category===c.id?'selected':''}>${c.icon} ${c.label}</option>`).join('');
    new Dialog({
      title: isEdit ? `Edit: ${ex.name}` : '[ ADD ITEM ]',
      content: `<div style="display:flex;flex-direction:column;gap:8px;padding:8px">
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">NAME *</label>
          <input name="n" value="${this._esc(ex?.name||'')}" placeholder="e.g. Laser Pistol" ${fi}></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">PRICE (¢) *</label>
            <input name="p" type="number" value="${ex?.price??0}" min="0" ${fi}></div>
          <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">CATEGORY</label>
            <select name="cat" style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 8px;border-radius:6px;font-size:11px;outline:none">${catOpts}</select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">LEVEL (1-20)</label>
            <input name="lv" type="number" value="${ex?.level??''}" min="1" max="20" placeholder="—" ${fi}></div>
          <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">STOCK (blank=∞)</label>
            <input name="st" type="number" value="${ex?.stock??''}" min="0" placeholder="∞" ${fi}></div>
        </div>
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">DESCRIPTION</label>
          <textarea name="d" style="width:100%;height:50px;resize:vertical;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box">${this._esc(ex?.description||'')}</textarea></div>
        <div><label style="color:#7a90b8;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:3px">IMAGE URL</label>
          <input name="img" value="${this._esc(ex?.img||'')}" placeholder="https://… or icons/…" ${fi}></div>
      </div>`,
      buttons: {
        save: { label: isEdit ? 'Save' : 'Add', callback: async html => {
          const name = html.find('[name="n"]').val()?.trim();
          if (!name) { ui.notifications.warn('Name required.'); return false; }
          const stRaw = html.find('[name="st"]').val()?.trim();
          const item  = {
            id:          ex?.id || this._uid(),
            name,
            price:       Number.parseInt(html.find('[name="p"]').val()) || 0,
            category:    html.find('[name="cat"]').val() || 'misc',
            level:       Number.parseInt(html.find('[name="lv"]').val()) || null,
            stock:       stRaw === '' ? null : Number.parseInt(stRaw),
            description: html.find('[name="d"]').val().trim(),
            img:         html.find('[name="img"]').val().trim(),
          };
          if (!shop.items) shop.items = [];
          if (isEdit && iIdx >= 0) shop.items[iIdx] = item;
          else shop.items.push(item);
          await this._saveShops(); this._render();
        }},
        cancel: { label:'Cancel' }
      }, default:'save'
    }).render(true);
  }

  /* ══════════════════ PURCHASE ══════════════════ */

  async _confirmPurchase(shop) {
    const actor  = this._getActor();
    if (!actor || !this.cart.length) return;
    const total = this.cart.reduce((s, r) => s + r.item.price * r.qty, 0);
    if (this._getCredits(actor) < total) { ui.notifications.warn(`Not enough credits. Need ${this._fmt(total)}.`); return; }

    const lines = this.cart.map(r => `<li>${r.qty}× ${this._esc(r.item.name)} — ${this._fmt(r.item.price * r.qty)}</li>`).join('');
    const ok = await Dialog.confirm({
      title:'Confirm Purchase',
      content:`<div style="padding:8px"><ul style="margin:0 0 8px;padding-left:16px;font-size:11px;color:#c8d8f0">${lines}</ul>
        <div style="border-top:1px solid rgba(0,229,255,.2);padding-top:8px;display:flex;justify-content:space-between">
          <span style="font-size:10px;color:#7a90b8">TOTAL</span>
          <b style="color:#00e5ff">${this._fmt(total)}</b>
        </div></div>`
    });
    if (!ok) return;

    const ok2 = await this._deductCredits(actor, total);
    if (!ok2) { ui.notifications.error('Failed to deduct credits.'); return; }

    for (const row of this.cart) await this._addToInventory(actor, row.item, row.qty);

    // update stock
    for (const row of this.cart) {
      const si = shop.items?.find(i => i.id === row.item.id);
      if (si && si.stock !== null) si.stock = Math.max(0, si.stock - row.qty);
    }
    await this._saveShops();

    await this._notifyGM(actor, shop, this.cart, total);
    this.cart = [];
    this.view = 'shop';
    ui.notifications.info(`Purchase complete! Spent ${this._fmt(total)}.`);
    this._render();
  }

  async _notifyGM(actor, shop, cart, total) {
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
    if (!gmIds.length) return;
    const orderId = Math.random().toString(36).slice(2,8).toUpperCase();
    const time    = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const lines   = cart.map(r => `<li>${r.qty}× <b>${this._esc(r.item.name)}</b> × ${this._fmt(r.item.price)} = <b>${this._fmt(r.item.price * r.qty)}</b></li>`).join('');
    await ChatMessage.create({
      content: `<div style="font-family:'Share Tech Mono',monospace;background:#0a0a14;border:1px solid rgba(0,229,255,.3);border-radius:10px;padding:12px;font-size:11px;color:#c8d8f0">
        <div style="color:#00e5ff;font-family:Orbitron,monospace;font-size:9px;letter-spacing:.2em;border-bottom:1px solid rgba(0,229,255,.2);padding-bottom:6px;margin-bottom:8px">◈ MARKET TRANSACTION</div>
        <div><span style="color:#7a90b8">SHOP:</span> ${this._esc(shop.name)}</div>
        <div><span style="color:#7a90b8">ORDER:</span> #${orderId} · ${time}</div>
        <div style="margin-bottom:4px"><span style="color:#7a90b8">BUYER:</span> ${this._esc(actor.name)} (${this._esc(game.user.name)})</div>
        <ul style="margin:6px 0 6px;padding-left:14px">${lines}</ul>
        <div style="border-top:1px solid rgba(0,229,255,.2);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between">
          <span style="color:#7a90b8">TOTAL CHARGED</span>
          <span style="color:#00ff88;font-weight:700">${this._fmt(total)}</span>
        </div>
      </div>`,
      whisper: gmIds,
      type: CONST.CHAT_MESSAGE_STYLES?.WHISPER ?? 4
    });
  }
}
