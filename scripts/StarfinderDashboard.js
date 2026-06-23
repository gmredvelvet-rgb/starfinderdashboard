import { BountyNetworkApp     } from './apps/BountyNetwork.js';
import { NewsTerminalApp      } from './apps/NewsTerminal.js';
import { SFCalendarApp        } from './apps/SFCalendar.js';
import { SecureChatApp        } from './apps/SecureChat.js';
import { StarfinderShopApp    } from './apps/StarfinderShop.js';
import { StarfinderJournalApp } from './apps/StarfinderJournal.js';

const MODULE_ID = 'starfinderdashboard';

const APP_REGISTRY = {
  music:    { id:'music',    label:'Music',    iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' },
  contacts: { id:'contacts', label:'Contacts', iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  bounty:   { id:'bounty',   label:'Bounty',   iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 8 0v2"/><path d="M17 11h6M20 8v6"/></svg>' },
  news:     { id:'news',     label:'News',     iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/><path d="M4 22a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>' },
  calendar: { id:'calendar', label:'Calendar', iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  chat:     { id:'chat',     label:'Comms',    iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
  market:   { id:'market',  label:'Market',   iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' },
  journal:  { id:'journal', label:'Journal',  iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' }
};

export class StarfinderDashboard extends Application {
  constructor(options = {}) {
    super(options);
    this._currentApp    = 'home';
    this._localVolume   = game.settings.get(MODULE_ID, 'localMusicVolume');
    this._localMuted    = false;
    this._clockTimer    = null;
    this._progressTimer = null;
    this._idleTimer     = null;
    this._idleActivity  = null;
    this._searchQuery   = '';
    this._appInstances  = {};
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'starfinder-dashboard', classes: ['starfinder-dashboard'],
      template: `modules/${MODULE_ID}/templates/dashboard.hbs`,
      title: 'DASHBOARD', width: 320, height: 640,
      minimizable: false, resizable: false, popOut: true
    });
  }

  getData() {
    const now    = new Date();
    const tracks = this._getMusicData();
    const nowPlay = tracks.flatMap(p => p.sounds).find(s => s.playing) ?? null;
    return {
      time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      date: now.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }),
      userName: game.user.name, userAvatar: game.user.avatar || 'icons/svg/mystery-man.svg',
      currentApp: this._currentApp, tracks, nowPlaying: nowPlay,
      contacts: this._getContacts(this._searchQuery),
      localVolume: Math.round(this._localVolume * 100), localMuted: this._localMuted,
      apps: Object.values(APP_REGISTRY)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-app]').on('click', ev => { const a = ev.currentTarget.dataset.app; if (a) this._switchApp(html, a); });
    html.find('.sf-grid-icon').on('click', ev => this._switchApp(html, ev.currentTarget.dataset.app));
    html.find('[data-action="open-music"]').on('click', () => this._switchApp(html, 'music'));
    html.find('[data-action="go-home"]').on('click', () => this._switchApp(html, 'home'));
    html.find('[data-action="toggle-mute"]').on('click', () => this._onToggleMute(html));
    html.find('[data-action="prev-track"]').on('click', () => { if (game.user.isGM) game.playlists?.playing?.[0]?.previousSound?.(); });
    html.find('[data-action="next-track"]').on('click', () => { if (game.user.isGM) game.playlists?.playing?.[0]?.nextSound?.(); });
    html.find('[data-action="local-volume"]').on('input', ev => this._onVolumeChange(html, ev));
    html.find('[data-action="add-contact"]').on('click', this._onAddContact.bind(this));
    html.find('[data-action="remove-contact"]').on('click', this._onRemoveContact.bind(this));
    html.find('[data-action="search-contacts"]').on('input', ev => {
      this._searchQuery = ev.currentTarget.value;
      this._renderContactList(html.find('#sf-contact-list'), this._getContacts(this._searchQuery));
    });
    this._activateDrag(html);
    this._startClockTimer(html);
    this._startProgressTimer(html);
    this._startIdleTimer(html);
    if (['bounty','news','calendar','chat','market','journal'].includes(this._currentApp)) {
      const el = html.find(`#sf-lazy-${this._currentApp}`)[0];
      if (el) this._lazyInit(this._currentApp, el);
    }
  }

  async close(options = {}) {
    clearInterval(this._clockTimer);
    clearInterval(this._progressTimer);
    clearTimeout(this._idleTimer);
    if (this._idleActivity) {
      this.element?.[0]?.removeEventListener('mousemove', this._idleActivity);
      this.element?.[0]?.removeEventListener('click',     this._idleActivity);
      this.element?.[0]?.removeEventListener('keydown',   this._idleActivity);
      this._idleActivity = null;
    }
    this._appInstances.chat?.destroy?.();
    game.settings.set(MODULE_ID, 'dashboardOpen', false);
    return super.close(options);
  }

  refreshMusicPlayer() {
    if (!this.rendered || !this.element) return;
    const d = this.getData();
    if (d.nowPlaying) {
      this.element.find('#sf-track-name').text(d.nowPlaying.name);
      this.element.find('#sf-playlist-name').text(d.nowPlaying.playlistName);
      this.element.find('.sf-miniplayer-track').text(d.nowPlaying.name);
    }
  }

  _switchApp(html, appId) {
    if (!appId) return;
    this._currentApp = appId;
    html.find('.sf-nav-btn').removeClass('sf-nav-btn--active');
    html.find(`.sf-nav-btn[data-app="${appId}"]`).addClass('sf-nav-btn--active');
    html.find('.sf-app').removeClass('sf-app--active');
    html.find(`.sf-app[data-app-id="${appId}"]`).addClass('sf-app--active');
    if (['bounty','news','calendar','chat','market','journal'].includes(appId)) {
      const el = html.find(`#sf-lazy-${appId}`)[0];
      if (el) this._lazyInit(appId, el);
    }
  }

  async _lazyInit(appId, container) {
    const lazy = (key, Cls, alwaysRender = false) => {
      if (!this._appInstances[key]) this._appInstances[key] = new Cls();
      const inst = this._appInstances[key];
      if (alwaysRender || !inst._initialized || !container.children.length) {
        return inst.renderInto(container);
      }
      return Promise.resolve();
    };
    switch (appId) {
      case 'bounty':   await lazy('bounty',   BountyNetworkApp);       break;
      case 'news':     await lazy('news',     NewsTerminalApp);        break;
      case 'calendar': await lazy('calendar', SFCalendarApp);          break;
      case 'chat':     await lazy('chat',     SecureChatApp, true);    break;
      case 'market':   await lazy('market',   StarfinderShopApp);      break;
      case 'journal':  await lazy('journal',  StarfinderJournalApp);   break;
    }
  }

  _getMusicData() {
    if (!game.playlists) return [];
    return game.playlists.map(pl => ({
      id: pl.id, name: pl.name, isPlaying: pl.playing, soundCount: pl.sounds.size,
      sounds: [...pl.sounds].filter(s => s.playing || s.pausedTime != null).map(s => ({
        id: s.id, name: s.name, img: s.img ?? pl.img ?? null, playing: s.playing,
        playlistName: pl.name, playlistId: pl.id, volume: s.volume ?? 1, _sound: s.sound ?? null
      }))
    }));
  }

  _getNowPlayingSound() {
    for (const pl of (game.playlists ?? [])) for (const s of pl.sounds) if (s.playing && s.sound) return s.sound;
    return null;
  }

  _applyLocalVolume() {
    const vol = this._localMuted ? 0 : this._localVolume;
    for (const pl of (game.playlists ?? [])) for (const s of pl.sounds) if (s.sound?.howl) s.sound.howl.volume(vol * (s.volume ?? 1));
  }

  _onToggleMute(html) {
    this._localMuted = !this._localMuted;
    this._applyLocalVolume();
    const mSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>';
    const sSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    html.find('#sf-play-btn').html(this._localMuted ? mSvg : sSvg).toggleClass('sf-ctrl-muted', this._localMuted);
  }

  _onVolumeChange(html, ev) {
    const pct = Number.parseInt(ev.currentTarget.value);
    this._localVolume = pct / 100; this._localMuted = pct === 0;
    game.settings.set(MODULE_ID, 'localMusicVolume', this._localVolume);
    this._applyLocalVolume();
    html.find('.sf-volume-fill').css('width', `${pct}%`);
    html.find('#sf-vol-pct').text(`${pct}%`);
  }

  _startProgressTimer(html) {
    clearInterval(this._progressTimer);
    this._progressTimer = setInterval(() => {
      if (!this.rendered) return;
      const s = this._getNowPlayingSound();
      if (s?.howl) {
        const seek = s.howl.seek() || 0, dur = s.howl.duration() || 1;
        const pct = Math.min(100, (seek / dur) * 100);
        html.find('#sf-progress-fill').css('width', `${pct}%`);
        html.find('#sf-progress-dot').css('left', `${pct}%`);
        html.find('#sf-time-current').text(this._fmt(seek));
        html.find('#sf-time-total').text(this._fmt(dur));
      }
    }, 500);
  }

  _startClockTimer(html) {
    clearInterval(this._clockTimer);
    this._clockTimer = setInterval(() => {
      if (this.rendered) html.find('#sf-clock').text(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }));
    }, 5000);
  }

  _fmt(sec) { const s = Math.floor(sec % 60), m = Math.floor(sec / 60); return `${m}:${s.toString().padStart(2,'0')}`; }

  _getContacts(filter = '') {
    const raw = game.settings.get(MODULE_ID, 'contacts') ?? [], q = filter.toLowerCase();
    const map = { active:'ONLINE', inactive:'OFFLINE', unknown:'UNKNOWN' };
    return raw.filter(c => !q || c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
              .map(c => ({ ...c, statusLabel: map[c.status] ?? 'UNKNOWN' }));
  }

  _renderContactList(container, contacts) {
    if (!contacts.length) { container.html('<div class="sf-empty-state"><p>No contacts.</p></div>'); return; }
    container.html(contacts.map(c => `
      <div class="sf-contact-item" data-contact-id="${c.id}">
        <div class="sf-contact-avatar-wrap"><img class="sf-contact-avatar" src="${c.img || 'icons/svg/mystery-man.svg'}" onerror="this.src='icons/svg/mystery-man.svg'"><span class="sf-contact-status-dot sf-contact-status-dot--${c.status}"></span></div>
        <div class="sf-contact-info"><div class="sf-contact-name">${c.name}</div><div class="sf-contact-desc">${c.description||''}</div></div>
        <div class="sf-contact-actions"><span class="sf-contact-badge sf-contact-badge--${c.status}">${c.statusLabel}</span>
          <button class="sf-contact-del" data-action="remove-contact" data-contact-id="${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
      </div>`).join(''));
    container.find('[data-action="remove-contact"]').on('click', this._onRemoveContact.bind(this));
  }

  _onRemoveContact(ev) {
    ev.stopPropagation();
    const id = ev.currentTarget.dataset.contactId;
    const current = game.settings.get(MODULE_ID, 'contacts') ?? [];
    const contact = current.find(c => c.id === id);
    if (!contact) return;
    Dialog.confirm({ title:'Remove Contact', content:`<p>Remove <b>${contact.name}</b>?</p>`,
      yes: () => { game.settings.set(MODULE_ID, 'contacts', current.filter(c => c.id !== id)); this.element?.find(`[data-contact-id="${id}"]`).remove(); }
    });
  }

  _onAddContact() {
    const actors = game.actors.map(a => ({ id:a.id, name:a.name, img:a.img, type:a.type }));
    let selId = null;
    const content = `<div class="sf-add-contact-dialog">
      <div class="sf-tab-bar"><div class="sf-tab active" data-tab="actor">FROM ACTORS</div><div class="sf-tab" data-tab="manual">MANUAL</div></div>
      <div class="sf-tab-content active" data-content="actor">
        <input type="text" class="sf-actor-filter" placeholder="Filter..." style="width:100%;background:#0a0a14;border:1px solid rgba(0,229,255,.3);color:#c8d8f0;padding:6px 10px;border-radius:6px;font-size:11px;margin-bottom:6px;box-sizing:border-box;outline:none">
        <div class="sf-actor-list">${actors.map(a => `<div class="sf-actor-list-item" data-actor-id="${a.id}"><img src="${a.img||'icons/svg/mystery-man.svg'}" width="28" height="28" onerror="this.src='icons/svg/mystery-man.svg'"><span class="sf-actor-list-name">${a.name}</span><span class="sf-actor-list-type">${a.type}</span></div>`).join('')}</div>
        <div class="sf-dialog-field" style="margin-top:8px"><label>STATUS</label><select name="actor-status"><option value="unknown">Unknown</option><option value="active">Online</option><option value="inactive">Offline</option></select></div>
        <div class="sf-dialog-field"><label>NOTE</label><input type="text" name="actor-desc" placeholder="Brief note..."></div>
      </div>
      <div class="sf-tab-content" data-content="manual">
        <div class="sf-dialog-field"><label>NAME *</label><input type="text" name="manual-name" placeholder="Contact name..."></div>
        <div class="sf-dialog-field"><label>IMAGE URL</label><input type="text" name="manual-img"></div>
        <div class="sf-dialog-field"><label>DESCRIPTION</label><input type="text" name="manual-desc"></div>
        <div class="sf-dialog-field"><label>STATUS</label><select name="manual-status"><option value="unknown">Unknown</option><option value="active">Online</option><option value="inactive">Offline</option></select></div>
      </div></div>`;
    new Dialog({ title:'[ ADD CONTACT ]', content,
      buttons:{ add:{label:'Add',callback:html=>this._processContact(html,selId)}, cancel:{label:'Cancel'} },
      render: html => {
        html.find('.sf-tab').on('click', ev => { const t=ev.currentTarget.dataset.tab; html.find('.sf-tab,.sf-tab-content').removeClass('active'); html.find(`.sf-tab[data-tab="${t}"],[data-content="${t}"]`).addClass('active'); });
        html.find('.sf-actor-list-item').on('click', ev => { html.find('.sf-actor-list-item').removeClass('selected'); ev.currentTarget.classList.add('selected'); selId=ev.currentTarget.dataset.actorId; });
        html.find('.sf-actor-filter').on('input', ev => { const q=ev.currentTarget.value.toLowerCase(); html.find('.sf-actor-list-item').each((_,el)=>{ el.style.display=el.querySelector('.sf-actor-list-name')?.textContent?.toLowerCase().includes(q)?'':'none'; }); });
      }, default:'add'
    }).render(true);
  }

  _processContact(html, selId) {
    const tab = html.find('.sf-tab.active').data('tab');
    const current = game.settings.get(MODULE_ID, 'contacts') ?? [];
    if (tab === 'actor') {
      const id = selId || html.find('.sf-actor-list-item.selected').data('actorId');
      const actor = game.actors.get(id);
      if (!actor) { ui.notifications.warn('Select an actor first.'); return false; }
      current.push({ id:foundry.utils.randomID(), name:actor.name, img:actor.img, description:html.find('[name="actor-desc"]').val().trim()||actor.type, status:html.find('[name="actor-status"]').val(), actorId:id });
    } else {
      const name = html.find('[name="manual-name"]').val().trim();
      if (!name) { ui.notifications.warn('Name is required.'); return false; }
      current.push({ id:foundry.utils.randomID(), name, img:html.find('[name="manual-img"]').val().trim()||'icons/svg/mystery-man.svg', description:html.find('[name="manual-desc"]').val().trim(), status:html.find('[name="manual-status"]').val() });
    }
    game.settings.set(MODULE_ID, 'contacts', current);
    if (this.rendered && this.element) this._renderContactList(this.element.find('#sf-contact-list'), this._getContacts(this._searchQuery));
  }

  _startIdleTimer(html) {
    const IDLE_MS = 12000;
    const ss = html.find('#sf-screensaver')[0];
    if (!ss) return;
    const video = ss.querySelector('video');

    const showSS = () => {
      ss.classList.add('sf-screensaver--visible');
      if (video) video.play().catch(() => {});
    };

    const hideSS = () => {
      ss.classList.remove('sf-screensaver--visible');
      if (video) { video.pause(); video.currentTime = 0; }
    };

    const resetIdle = () => {
      if (ss.classList.contains('sf-screensaver--visible')) hideSS();
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(showSS, IDLE_MS);
    };

    this._idleActivity = resetIdle;
    const phone = html[0];
    phone.addEventListener('mousemove', resetIdle);
    phone.addEventListener('click',     resetIdle);
    phone.addEventListener('keydown',   resetIdle);

    this._idleTimer = setTimeout(showSS, IDLE_MS);
  }

  _activateDrag(html) {
    const handle = html.find('.sf-drag-handle')[0]; if (!handle) return;
    let drag = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      drag = true;
      const r = html[0].getBoundingClientRect();
      ox = ev.clientX - r.left;
      oy = ev.clientY - r.top;
      ev.preventDefault();
    });
    const mv = ev => { if (drag) { html[0].style.left=`${ev.clientX-ox}px`; html[0].style.top=`${ev.clientY-oy}px`; } };
    const up = () => { drag = false; };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  }
}
