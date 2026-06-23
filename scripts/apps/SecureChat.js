// Internal whisper-based chat — players can message NPCs which routes to the GM,
// and the GM can reply AS the NPC (speaker alias + whisper back to player).

const MODULE_ID = 'starfinderdashboard';

export class SecureChatApp {
  constructor() {
    this._container     = null;
    this._chatHook      = null;
    this._contacts      = [];
    this._activeContact = null;
  }

  async renderInto(container) {
    this._container = container;
    this._loadContacts();
    this._render();
    this._hookChat();
  }

  destroy() {
    if (this._chatHook) { Hooks.off('createChatMessage', this._chatHook); this._chatHook = null; }
  }

  // ── Contact loading ──────────────────────────────────────────────────────

  _loadContacts() {
    const saved = game.settings.get(MODULE_ID, 'contacts') || [];
    const users = game.users.filter(u => u.id !== game.user.id);
    this._contacts = [];

    for (const u of users) {
      this._contacts.push({ type: 'user', name: u.name, userId: u.id, active: u.active, avatar: u.avatar });
    }

    for (const c of saved) {
      if (!this._contacts.find(x => x.name === c.name)) {
        this._contacts.push({
          type: 'npc', name: c.name, userId: null,
          active: c.status === 'active', avatar: c.img,
          status: c.status, contactId: c.id, actorId: c.actorId
        });
      }
    }
  }

  // ── Message retrieval ────────────────────────────────────────────────────

  _getMessages(contact) {
    if (!contact || contact.type !== 'user') return [];
    const myId = game.user.id, theirId = contact.userId;
    return game.messages.filter(msg => {
      const w = msg.whisper;
      if (!w?.length || msg.getFlag(MODULE_ID, 'forNpc')) return false;
      return (w.includes(theirId) && msg.author?.id === myId)
          || (w.includes(myId)    && msg.author?.id === theirId);
    }).slice(-50);
  }

  _getGroupMessages() {
    const myId = game.user.id;
    return game.messages.filter(msg => {
      const w = msg.whisper;
      if (!w?.length || msg.getFlag(MODULE_ID, 'forNpc')) return false;
      return w.includes(myId) || msg.author?.id === myId;
    }).slice(-60);
  }

  _getNpcMessages(npcName) {
    return game.messages.filter(msg =>
      msg.getFlag(MODULE_ID, 'forNpc') === true &&
      msg.getFlag(MODULE_ID, 'npcName') === npcName
    ).slice(-50);
  }

  // NPCs with at least one flagged message — drives GM inbox list
  _getNpcInboxNames() {
    const seen = new Set();
    for (const msg of game.messages) {
      if (msg.getFlag(MODULE_ID, 'forNpc')) seen.add(msg.getFlag(MODULE_ID, 'npcName'));
    }
    return [...seen];
  }

  _resolveNpcContact(name) {
    const saved = game.settings.get(MODULE_ID, 'contacts') || [];
    const c     = saved.find(x => x.name === name);
    const actor = c?.actorId ? game.actors.get(c.actorId) : null;
    return {
      type: 'npc', name,
      avatar: c?.img || actor?.img || 'icons/svg/mystery-man.svg',
      contactId: c?.id, actorId: c?.actorId
    };
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  _render() {
    if (!this._container) return;
    if (!this._activeContact) this._renderContactList(this._container);
    else                      this._renderChat(this._container, this._activeContact);
  }

  _renderContactList(c) {
    this._loadContacts();
    const isGM        = game.user.isGM;
    const userContacts = this._contacts.filter(ct => ct.type === 'user');
    const npcContacts  = this._contacts.filter(ct => ct.type === 'npc');
    const inboxNames   = isGM ? this._getNpcInboxNames() : [];

    const inboxItems = inboxNames.map(name => {
      const r = this._resolveNpcContact(name);
      const msgs = this._getNpcMessages(name);
      const playerCount = new Set(msgs.filter(m => !m.author?.isGM).map(m => m.getFlag(MODULE_ID, 'fromPlayer'))).size;
      return { name, avatar: r.avatar, playerCount };
    });

    c.innerHTML = `
      <div class="sf-chat">
        <div class="sf-chat-header-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sf-chat-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="sf-chat-heading">SECURE COMMS</span>
          <button class="sf-chat-broadcast-btn" title="Group message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>
        </div>

        <div class="sf-chat-list">

          <div class="sf-chat-contact-item sf-chat-contact-item--group" data-contact="__group__">
            <div class="sf-chat-contact-avatar sf-chat-contact-avatar--group">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div class="sf-chat-contact-meta">
              <span class="sf-chat-contact-name">Group Channel</span>
              <span class="sf-chat-contact-sub">All whispers</span>
            </div>
          </div>

          ${userContacts.map(ct => `
            <div class="sf-chat-contact-item" data-user-id="${ct.userId}">
              <div class="sf-chat-contact-avatar-wrap">
                <img class="sf-chat-contact-avatar" src="${ct.avatar || 'icons/svg/mystery-man.svg'}"
                  onerror="this.src='icons/svg/mystery-man.svg'">
                <span class="sf-chat-online-dot ${ct.active ? 'sf-chat-online-dot--on' : ''}"></span>
              </div>
              <div class="sf-chat-contact-meta">
                <span class="sf-chat-contact-name">${ct.name}</span>
                <span class="sf-chat-contact-sub">${ct.active ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          `).join('')}

          ${isGM && inboxItems.length ? `
            <div class="sf-chat-section-label">▼ NPC INBOX</div>
            ${inboxItems.map(item => `
              <div class="sf-chat-contact-item sf-chat-contact-item--npc-inbox" data-npc-name="${item.name}">
                <div class="sf-chat-contact-avatar-wrap">
                  <img class="sf-chat-contact-avatar" src="${item.avatar}"
                    onerror="this.src='icons/svg/mystery-man.svg'">
                  <span class="sf-chat-online-dot sf-chat-online-dot--npc"></span>
                </div>
                <div class="sf-chat-contact-meta">
                  <span class="sf-chat-contact-name">${item.name}</span>
                  <span class="sf-chat-contact-sub">
                    ${item.playerCount} player${item.playerCount !== 1 ? 's' : ''} in contact
                  </span>
                </div>
                <div class="sf-chat-npc-send-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
              </div>
            `).join('')}
          ` : ''}

          ${npcContacts.length ? `
            <div class="sf-chat-section-label">${isGM ? '▼ NPCs' : '▼ CONTACTS'}</div>
            ${npcContacts.map(ct => `
              <div class="sf-chat-contact-item sf-chat-contact-item--npc-active" data-npc-name="${ct.name}">
                <div class="sf-chat-contact-avatar-wrap">
                  <img class="sf-chat-contact-avatar" src="${ct.avatar || 'icons/svg/mystery-man.svg'}"
                    onerror="this.src='icons/svg/mystery-man.svg'">
                  <span class="sf-chat-online-dot sf-chat-online-dot--npc"></span>
                </div>
                <div class="sf-chat-contact-meta">
                  <span class="sf-chat-contact-name">${ct.name}</span>
                  <span class="sf-chat-contact-sub">${isGM ? 'Reply as NPC' : 'Encrypted channel'}</span>
                </div>
                <div class="sf-chat-npc-send-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </div>
              </div>
            `).join('')}
          ` : ''}

        </div>
      </div>
    `;

    const $c = $(c);

    $c.find('[data-contact="__group__"], .sf-chat-broadcast-btn').on('click', () => {
      this._activeContact = { type: 'group', name: 'Group Channel' };
      this._renderChat(c, this._activeContact);
    });

    $c.find('[data-user-id]').on('click', ev => {
      const contact = this._contacts.find(x => x.userId === ev.currentTarget.dataset.userId);
      if (contact) { this._activeContact = contact; this._renderChat(c, contact); }
    });

    $c.find('[data-npc-name]').on('click', ev => {
      const contact = this._resolveNpcContact(ev.currentTarget.dataset.npcName);
      this._activeContact = contact;
      this._renderChat(c, contact);
    });
  }

  _renderChat(c, contact) {
    const isGM    = game.user.isGM;
    const myId    = game.user.id;
    const isGroup = contact.type === 'group';
    const isNpc   = contact.type === 'npc';

    let messages;
    if (isGroup)    messages = this._getGroupMessages();
    else if (isNpc) messages = this._getNpcMessages(contact.name);
    else            messages = this._getMessages(contact);

    const bubbles = messages.map(msg => {
      const authorIsGM = msg.author?.isGM;
      const fromPName  = msg.getFlag?.(MODULE_ID, 'fromPlayerName');
      const isMine     = msg.author?.id === myId;

      let senderName, side;
      if (isNpc) {
        if (authorIsGM) {
          senderName = contact.name;
          side = isGM ? 'mine' : 'theirs';
        } else {
          senderName = fromPName || msg.author?.name || 'Unknown';
          side = isGM ? 'theirs' : 'mine';
        }
      } else {
        senderName = isMine ? 'You' : (msg.author?.name || 'Unknown');
        side = isMine ? 'mine' : 'theirs';
      }

      const content = msg.content.replace(/<[^>]*>/g, '') || '[Media]';
      const time    = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `<div class="sf-bubble sf-bubble--${side}">
        ${side === 'theirs' ? `<span class="sf-bubble-sender">${senderName}</span>` : ''}
        <div class="sf-bubble-text">${content}</div>
        <span class="sf-bubble-time">${time}</span>
      </div>`;
    }).join('');

    let inputHtml = '';
    if (isNpc) {
      const labelText = isGM
        ? `Speaking as: <span class="sf-npc-alias">${contact.name}</span>`
        : `Encrypted channel → <span class="sf-npc-alias">${contact.name}</span>`;
      inputHtml = `
        <div class="sf-chat-input-row">
          <input type="text" class="sf-chat-input" id="sf-chat-input"
            placeholder="${isGM ? `Reply as ${contact.name}…` : `Message ${contact.name}…`}" maxlength="500">
          <button class="sf-chat-send-btn" id="sf-chat-send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="sf-chat-npc-label">${labelText}</div>
      `;
    } else {
      inputHtml = `
        <div class="sf-chat-input-row">
          <input type="text" class="sf-chat-input" id="sf-chat-input" placeholder="Type message…" maxlength="500">
          <button class="sf-chat-send-btn" id="sf-chat-send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      `;
    }

    c.innerHTML = `
      <div class="sf-chat sf-chat--open">
        <div class="sf-chat-topbar">
          <button class="sf-chat-back-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          ${isNpc ? `<img class="sf-chat-topbar-avatar"
            src="${contact.avatar || 'icons/svg/mystery-man.svg'}"
            onerror="this.src='icons/svg/mystery-man.svg'">` : ''}
          <div class="sf-chat-topbar-info">
            <span class="sf-chat-topbar-name">${contact.name}</span>
            ${isNpc ? `<span class="sf-chat-topbar-status ${isGM ? 'sf-chat-topbar-status--gm' : ''}">
              ${isGM ? '◈ GM · REPLY AS NPC' : '● ENCRYPTED CHANNEL'}
            </span>` : ''}
            ${!isNpc && !isGroup ? `<span class="sf-chat-topbar-status ${contact.active ? 'sf-chat-topbar-status--on' : ''}">
              ${contact.active ? '● ONLINE' : '○ OFFLINE'}
            </span>` : ''}
          </div>
        </div>

        <div class="sf-chat-messages" id="sf-chat-messages">
          ${bubbles || '<div class="sf-chat-empty">No messages yet.</div>'}
        </div>

        ${inputHtml}
      </div>
    `;

    const msgEl = c.querySelector('#sf-chat-messages');
    if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;

    $(c).find('.sf-chat-back-btn').on('click', () => { this._activeContact = null; this._render(); });

    const inputEl = c.querySelector('#sf-chat-input');
    if (inputEl) {
      const send = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = '';
        if (isNpc) {
          if (isGM) {
            const playerIds = [...new Set(
              messages
                .filter(m => !m.author?.isGM && m.getFlag?.(MODULE_ID, 'fromPlayer'))
                .map(m => m.getFlag(MODULE_ID, 'fromPlayer'))
            )];
            this._replyAsNpc(text, contact, playerIds);
          } else {
            this._sendNpcMessage(text, contact);
          }
        } else {
          this._sendMessage(text, contact);
        }
      };
      $(c).find('#sf-chat-send').on('click', send);
      $(c).find('#sf-chat-input').on('keydown', ev => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
      });
    }
  }

  // ── Send helpers ─────────────────────────────────────────────────────────

  async _sendMessage(text, contact) {
    const whisper = contact.type === 'group'
      ? game.users.filter(u => u.id !== game.user.id).map(u => u.id)
      : [contact.userId];
    await ChatMessage.create({ content: text, whisper, type: CONST.CHAT_MESSAGE_STYLES?.WHISPER ?? 4 });
    setTimeout(() => this._renderChat(this._container, contact), 150);
  }

  async _sendNpcMessage(text, contact) {
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
    if (!gmIds.length) { ui.notifications.warn('No GM is currently online.'); return; }
    await ChatMessage.create({
      content: text,
      whisper: gmIds,
      type: CONST.CHAT_MESSAGE_STYLES?.WHISPER ?? 4,
      flags: { [MODULE_ID]: {
        forNpc: true,
        npcName: contact.name,
        npcImg: contact.avatar || '',
        fromPlayer: game.user.id,
        fromPlayerName: game.user.name
      }}
    });
    setTimeout(() => this._renderChat(this._container, contact), 150);
  }

  async _replyAsNpc(text, contact, playerIds) {
    if (!playerIds.length) { ui.notifications.warn('No player has contacted this NPC yet.'); return; }
    await ChatMessage.create({
      content: text,
      whisper: playerIds,
      speaker: { alias: contact.name },
      type: CONST.CHAT_MESSAGE_STYLES?.WHISPER ?? 4,
      flags: { [MODULE_ID]: {
        forNpc: true,
        npcName: contact.name,
        npcImg: contact.avatar || '',
        replyToPlayers: playerIds
      }}
    });
    setTimeout(() => this._renderChat(this._container, contact), 150);
  }

  // ── Chat hook ────────────────────────────────────────────────────────────

  _hookChat() {
    if (this._chatHook) Hooks.off('createChatMessage', this._chatHook);
    this._chatHook = Hooks.on('createChatMessage', msg => {
      if (!this._container) return;
      const myId     = game.user.id;
      const w        = msg.whisper || [];
      const isNpcMsg = msg.getFlag?.(MODULE_ID, 'forNpc');

      if (!this._activeContact) {
        if (isNpcMsg && game.user.isGM) this._renderContactList(this._container);
        return;
      }

      if (this._activeContact.type === 'npc') {
        if (msg.getFlag?.(MODULE_ID, 'npcName') === this._activeContact.name) {
          this._renderChat(this._container, this._activeContact);
        }
      } else if (this._activeContact.type === 'group') {
        if (!isNpcMsg && (w.includes(myId) || msg.author?.id === myId)) {
          this._renderChat(this._container, this._activeContact);
        }
      } else {
        const theirId    = this._activeContact.userId;
        const isToThem   = w.includes(theirId) && msg.author?.id === myId;
        const isFromThem = w.includes(myId) && msg.author?.id === theirId;
        if (isToThem || isFromThem) this._renderChat(this._container, this._activeContact);
      }
    });
  }
}
