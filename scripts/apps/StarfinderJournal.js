const JOURNAL_NS  = 'starfinderdashboard';
const JOURNAL_KEY = 'journalNotes';

const JTAGS = [
  { id:'npc',      label:'NPC',      col:'#b44fff' },
  { id:'location', label:'LOCATION', col:'#00e5ff' },
  { id:'zone',     label:'ZONE',     col:'#00ff88' },
  { id:'ship',     label:'SHIP',     col:'#ff9500' },
  { id:'loot',     label:'LOOT',     col:'#ffdd00' },
  { id:'session',  label:'SESSION',  col:'#ff3366' },
  { id:'info',     label:'INFO',     col:'#7a90b8' },
];

const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>';
const ADD_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>';
const DEL_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>';
const BOOK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;color:var(--sf-cyan)"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

export class StarfinderJournalApp {
  constructor() {
    this._container   = null;
    this._initialized = false;
    this._view        = 'list';
    this._noteId      = null;
    this._filter      = '';
    this._tagFilter   = null;
    this._saveTimer   = null;
  }

  static registerSettings() {
    try {
      game.settings.register(JOURNAL_NS, JOURNAL_KEY, {
        name: 'SF Journal Notes', scope: 'client', config: false,
        type: Array, default: []
      });
    } catch(e) { console.debug('SF Journal: settings already registered', e); }
  }

  async renderInto(container) {
    this._container = container;
    this._render();
    this._initialized = true;
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  _loadNotes() {
    return (game.settings.get(JOURNAL_NS, JOURNAL_KEY) ?? [])
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
  }

  _saveNotes(notes) { return game.settings.set(JOURNAL_NS, JOURNAL_KEY, notes); }

  _getNote(id) { return this._loadNotes().find(n => n.id === id); }

  _esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

  _render() {
    if (!this._container) return;
    if (this._view === 'editor') this._renderEditor();
    else this._renderList();
  }

  // ── List view ─────────────────────────────────────────────────────────────

  _renderList() {
    let notes = this._loadNotes();
    if (this._filter) {
      const q = this._filter.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        (n.body || '').replace(/<[^>]*>/g, '').toLowerCase().includes(q));
    }
    if (this._tagFilter) notes = notes.filter(n => (n.tags ?? []).includes(this._tagFilter));

    const filterBtns = [
      `<button class="sf-j-tag-filter ${!this._tagFilter ? 'active' : ''}" data-tag="" style="--tag-col:#7a90b8">ALL</button>`,
      ...JTAGS.map(t => `<button class="sf-j-tag-filter ${this._tagFilter === t.id ? 'active' : ''}" data-tag="${t.id}" style="--tag-col:${t.col}">${t.label}</button>`)
    ].join('');

    const cards = notes.length ? notes.map((n, i) => {
      const preview = (n.body || '').replace(/<[^>]*>/g, '').slice(0, 90);
      const badges  = (n.tags || []).map(tid => {
        const t = JTAGS.find(x => x.id === tid);
        return t ? `<span class="sf-j-badge" style="--tag-col:${t.col}">${t.label}</span>` : '';
      }).join('');
      const date = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString([], { month:'short', day:'numeric' }) : '';
      return `
        <div class="sf-j-card${n.pinned ? ' sf-j-card--pinned' : ''}" data-note-id="${n.id}" style="animation-delay:${i * 40}ms">
          <div class="sf-j-card-scan"></div>
          <div class="sf-j-card-head">
            <span class="sf-j-card-title">${this._esc(n.title || 'Untitled')}</span>
            ${n.pinned ? '<span class="sf-j-pin">◈</span>' : ''}
          </div>
          ${preview
            ? `<div class="sf-j-card-preview">${this._esc(preview)}</div>`
            : `<div class="sf-j-card-preview sf-j-card-preview--empty">Empty entry…</div>`}
          <div class="sf-j-card-foot">
            <div class="sf-j-badges">${badges}</div>
            <span class="sf-j-date">${date}</span>
          </div>
        </div>`;
    }).join('') : `
      <div class="sf-empty-state sf-j-empty">
        <div class="sf-j-holo-icon">◈</div>
        <p>NO RECORDS FOUND</p>
        <p class="sf-empty-sub">Tap + to create a new entry</p>
      </div>`;

    this._container.innerHTML = `
      <div class="sf-j-list-view">
        <div class="sf-j-inner-header">
          ${BOOK_SVG}
          <span class="sf-j-inner-title">FIELD JOURNAL</span>
          <button class="sf-add-btn sf-j-new-btn" data-action="j-new" title="New Note">${ADD_SVG}</button>
        </div>
        <div class="sf-j-search-row">
          <div class="sf-search-bar sf-j-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" class="sf-search-input" placeholder="Search notes…" value="${this._esc(this._filter)}" data-action="j-search">
          </div>
        </div>
        <div class="sf-j-tag-filters">${filterBtns}</div>
        <div class="sf-j-notes-list">${cards}</div>
      </div>`;

    const c = this._container;
    c.querySelector('[data-action="j-search"]')?.addEventListener('input', ev => {
      this._filter = ev.target.value; this._renderList();
    });
    c.querySelector('[data-action="j-new"]')?.addEventListener('click', () => this._newNote());
    c.querySelectorAll('.sf-j-tag-filter').forEach(btn =>
      btn.addEventListener('click', () => { this._tagFilter = btn.dataset.tag || null; this._renderList(); }));
    c.querySelectorAll('.sf-j-card').forEach(card =>
      card.addEventListener('click', () => { this._noteId = card.dataset.noteId; this._view = 'editor'; this._renderEditor(); }));
  }

  // ── Editor view ───────────────────────────────────────────────────────────

  _renderEditor() {
    const note = this._getNote(this._noteId);
    if (!note) { this._view = 'list'; this._renderList(); return; }

    const tagToggles = JTAGS.map(t =>
      `<button class="sf-j-tag-toggle${(note.tags || []).includes(t.id) ? ' active' : ''}" data-tag="${t.id}" style="--tag-col:${t.col}">${t.label}</button>`
    ).join('');

    this._container.innerHTML = `
      <div class="sf-j-editor-view">
        <div class="sf-j-inner-header">
          <button class="sf-back-btn" data-action="j-back" title="Back to list">${BACK_SVG}</button>
          <span class="sf-j-inner-title">FIELD JOURNAL</span>
          <button class="sf-j-pin-btn${note.pinned ? ' active' : ''}" data-action="j-pin">
            ${note.pinned ? '◈ PINNED' : '◇ PIN'}
          </button>
        </div>
        <div class="sf-j-editor-toolbar">
          <button class="sf-j-tool" data-cmd="bold"      title="Bold"><b>B</b></button>
          <button class="sf-j-tool" data-cmd="italic"    title="Italic"><i>I</i></button>
          <button class="sf-j-tool" data-cmd="underline" title="Underline"><u>U</u></button>
          <div class="sf-j-tool-sep"></div>
          <button class="sf-j-tool sf-j-tool--link" data-action="j-link-actor" title="Link NPC">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>NPC
          </button>
          <button class="sf-j-tool sf-j-tool--link" data-action="j-link-journal" title="Link Journal Entry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>LOC
          </button>
          <button class="sf-j-tool sf-j-tool--link" data-action="j-link-scene" title="Link Scene/Zone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 9 4-4 4 4 4-4 4 4"/></svg>ZONE
          </button>
          <div class="sf-j-tool-sep"></div>
          <button class="sf-j-tool sf-j-tool--del" data-action="j-delete" title="Delete note">${DEL_SVG}</button>
        </div>
        <div class="sf-j-tags-row">${tagToggles}</div>
        <div class="sf-j-holo-frame">
          <div class="sf-j-holo-corner sf-j-holo-corner--tl"></div>
          <div class="sf-j-holo-corner sf-j-holo-corner--tr"></div>
          <div class="sf-j-holo-corner sf-j-holo-corner--bl"></div>
          <div class="sf-j-holo-corner sf-j-holo-corner--br"></div>
          <input class="sf-j-title-input" type="text" value="${this._esc(note.title || '')}"
            placeholder="NOTE TITLE…" maxlength="80" data-action="j-title">
          <div class="sf-j-body" contenteditable="true" spellcheck="false"
            data-action="j-body" data-placeholder="Start typing your field notes…">${note.body || ''}</div>
        </div>
      </div>`;

    const c = this._container;

    // Formatting commands
    c.querySelectorAll('[data-cmd]').forEach(btn =>
      btn.addEventListener('mousedown', ev => {
        ev.preventDefault();
        document.execCommand(btn.dataset.cmd, false, null);
        this._scheduleSave();
      }));

    // Tag toggles
    c.querySelectorAll('.sf-j-tag-toggle').forEach(btn =>
      btn.addEventListener('click', () => {
        const notes = this._loadNotes(), n = notes.find(x => x.id === this._noteId);
        if (!n) return;
        const tid = btn.dataset.tag;
        n.tags = (n.tags ?? []).includes(tid)
          ? n.tags.filter(t => t !== tid)
          : [...(n.tags ?? []), tid];
        n.updatedAt = Date.now();
        this._saveNotes(notes);
        btn.classList.toggle('active', n.tags.includes(tid));
      }));

    // Title auto-save
    c.querySelector('[data-action="j-title"]')?.addEventListener('input', () => this._scheduleSave());

    // Body auto-save
    const body = c.querySelector('[data-action="j-body"]');
    if (body) {
      body.addEventListener('input', () => {
        if (body.innerHTML === '<br>' || body.innerHTML === '<br/>') body.innerHTML = '';
        this._scheduleSave();
      });
      body.addEventListener('blur', () => this._flushSave());
      setTimeout(() => { if (!note.title) c.querySelector('[data-action="j-title"]')?.focus(); else body.focus(); }, 60);
    }

    // Link pickers
    c.querySelector('[data-action="j-link-actor"]')?.addEventListener('click', () =>
      this._openLinkPicker('[ LINK NPC ]',
        game.actors.map(a => ({
          id: a.id, name: a.name,
          imgEl: `<img src="${a.img || 'icons/svg/mystery-man.svg'}" onerror="this.src='icons/svg/mystery-man.svg'" class="sf-j-link-img">`
        })),
        item => `<span class="sf-note-link sf-note-link--actor" contenteditable="false" data-type="actor" data-id="${item.id}"> ◈ ${this._esc(item.name)} </span>`
      ));

    c.querySelector('[data-action="j-link-journal"]')?.addEventListener('click', () =>
      this._openLinkPicker('[ LINK LOCATION ]',
        game.journal.map(j => ({
          id: j.id, name: j.name,
          imgEl: `<svg viewBox="0 0 24 24" fill="none" stroke="#00e5ff" stroke-width="2" class="sf-j-link-icon"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
        })),
        item => `<span class="sf-note-link sf-note-link--journal" contenteditable="false" data-type="journal" data-id="${item.id}"> ◉ ${this._esc(item.name)} </span>`
      ));

    c.querySelector('[data-action="j-link-scene"]')?.addEventListener('click', () =>
      this._openLinkPicker('[ LINK ZONE ]',
        game.scenes.map(s => ({
          id: s.id, name: s.name,
          imgEl: `<svg viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2" class="sf-j-link-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 9 4-4 4 4 4-4 4 4"/></svg>`
        })),
        item => `<span class="sf-note-link sf-note-link--scene" contenteditable="false" data-type="scene" data-id="${item.id}"> ◫ ${this._esc(item.name)} </span>`
      ));

    // Back to list
    c.querySelector('[data-action="j-back"]')?.addEventListener('click', () => {
      this._flushSave();
      this._view = 'list';
      this._renderList();
    });

    // Pin toggle
    c.querySelector('[data-action="j-pin"]')?.addEventListener('click', () => {
      const notes = this._loadNotes(), n = notes.find(x => x.id === this._noteId);
      if (!n) return;
      n.pinned = !n.pinned; n.updatedAt = Date.now();
      this._saveNotes(notes);
      this._renderEditor();
    });

    // Delete
    c.querySelector('[data-action="j-delete"]')?.addEventListener('click', () => {
      Dialog.confirm({
        title: 'Delete Entry',
        content: `<p>Permanently delete <b>${this._esc(note.title || 'Untitled')}</b>?</p>`,
        yes: () => {
          clearTimeout(this._saveTimer);
          this._saveNotes(this._loadNotes().filter(n => n.id !== this._noteId));
          this._view = 'list'; this._noteId = null; this._renderList();
        }
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._autoSave(), 600);
  }

  _flushSave() { clearTimeout(this._saveTimer); this._autoSave(); }

  _autoSave() {
    if (!this._container || this._view !== 'editor') return;
    const title = this._container.querySelector('[data-action="j-title"]')?.value ?? '';
    const body  = this._container.querySelector('[data-action="j-body"]')?.innerHTML ?? '';
    const notes = this._loadNotes();
    const n     = notes.find(x => x.id === this._noteId);
    if (!n) return;
    n.title = title; n.body = body; n.updatedAt = Date.now();
    this._saveNotes(notes);
  }

  _newNote() {
    this._flushSave();
    const notes = this._loadNotes();
    const note  = {
      id: foundry.utils.randomID(), title: '', body: '', tags: [],
      pinned: false, createdAt: Date.now(), updatedAt: Date.now()
    };
    notes.unshift(note);
    this._saveNotes(notes);
    this._noteId = note.id;
    this._view   = 'editor';
    this._renderEditor();
  }

  _openLinkPicker(title, items, chipFn) {
    const body = this._container?.querySelector('[data-action="j-body"]');
    if (!body) return;

    // Save cursor position before dialog steals focus
    body.focus();
    const sel = window.getSelection();
    let savedRange = null;
    if (sel.rangeCount) {
      const r = sel.getRangeAt(0);
      if (body.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
    }

    const listHtml = items.length
      ? items.map(item => `
          <div class="sf-j-link-item" data-id="${item.id}" data-name="${this._esc(item.name)}">
            ${item.imgEl || ''}
            <span>${this._esc(item.name)}</span>
          </div>`).join('')
      : `<div style="padding:14px;text-align:center;color:#7a90b8;font-size:10px">No entries found.</div>`;

    new Dialog({
      title,
      content: `<div class="sf-j-link-picker">
        <input type="text" class="sf-j-link-filter" placeholder="Filter…">
        <div class="sf-j-link-list">${listHtml}</div>
      </div>`,
      buttons: {
        insert: {
          label: 'Link',
          callback: (html) => {
            const sel2 = html.find('.sf-j-link-item.selected')[0];
            if (!sel2) return;
            const chip = chipFn({ id: sel2.dataset.id, name: sel2.dataset.name });
            body.focus();
            const s = window.getSelection();
            s.removeAllRanges();
            if (savedRange) {
              s.addRange(savedRange);
            } else {
              const r = document.createRange();
              r.selectNodeContents(body);
              r.collapse(false);
              s.addRange(r);
            }
            document.execCommand('insertHTML', false, chip + '&nbsp;');
            this._scheduleSave();
          }
        },
        cancel: { label: 'Cancel' }
      },
      render: (html) => {
        html.find('.sf-j-link-item').on('click', ev => {
          html.find('.sf-j-link-item').removeClass('selected');
          ev.currentTarget.classList.add('selected');
        });
        html.find('.sf-j-link-item').first().trigger('click');
        html.find('.sf-j-link-filter').on('input', ev => {
          const q = ev.target.value.toLowerCase();
          html.find('.sf-j-link-item').each((_, el) => {
            el.style.display = (el.dataset.name || '').toLowerCase().includes(q) ? '' : 'none';
          });
        });
        html.find('.sf-j-link-filter').trigger('focus');
      },
      default: 'insert'
    }).render(true);
  }
}
