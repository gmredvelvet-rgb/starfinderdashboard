import { StarfinderDashboard   } from './StarfinderDashboard.js';
import { BountyNetworkApp      } from './apps/BountyNetwork.js';
import { NewsTerminalApp       } from './apps/NewsTerminal.js';
import { SFCalendarApp         } from './apps/SFCalendar.js';
import { StarfinderShopApp     } from './apps/StarfinderShop.js';
import { StarfinderJournalApp  } from './apps/StarfinderJournal.js';
import { SFDashboardLicenseClient, SFDashboardLicenseUI } from './license-client.js';

const MODULE_ID = 'starfinderdashboard';

// ─── Register Handlebars helpers ──────────────────────────────────────────────
Handlebars.registerHelper('sfEq', (a, b) => String(a) === String(b));

// ─── Settings ─────────────────────────────────────────────────────────────────
Hooks.once('init', () => {
  BountyNetworkApp.registerSettings();
  NewsTerminalApp.registerSettings();
  SFCalendarApp.registerSettings();
  StarfinderShopApp.registerSettings();
  StarfinderJournalApp.registerSettings();

  game.settings.register(MODULE_ID, 'contacts', {
    name:    'Dashboard Contacts',
    scope:   'client',
    config:  false,
    type:    Array,
    default: []
  });

  game.settings.register(MODULE_ID, 'localMusicVolume', {
    name:    'Local Music Volume',
    scope:   'client',
    config:  false,
    type:    Number,
    default: 1
  });

  game.settings.register(MODULE_ID, 'dashboardOpen', {
    name:    'Dashboard Open',
    scope:   'client',
    config:  false,
    type:    Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, 'startOpen', {
    name:   'Auto-open Dashboard on Load',
    hint:   'Automatically show the Starfinder Dashboard when you log in.',
    scope:  'client',
    config: true,
    type:   Boolean,
    default: true
  });

  // World-level license flag — written by GM client after Patreon auth,
  // read by all clients to decide whether to activate the module.
  game.settings.register(MODULE_ID, 'worldLicensed', {
    scope:   'world',
    type:    Boolean,
    config:  false,
    default: false
  });
});

// ─── License-gated activation ─────────────────────────────────────────────────
let _activated = false;

function _activateDashboard() {
  if (_activated) return;
  _activated = true;

  game.starfinderDashboard = new StarfinderDashboard();

  const shouldOpen = game.settings.get(MODULE_ID, 'startOpen');
  if (shouldOpen) {
    game.starfinderDashboard.render(true);
    game.settings.set(MODULE_ID, 'dashboardOpen', true);
  }

  globalThis.sfDashboard = {
    toggle: () => {
      const dash = game.starfinderDashboard;
      if (dash.rendered) {
        dash.close();
      } else {
        dash.render(true);
        game.settings.set(MODULE_ID, 'dashboardOpen', true);
      }
    },
    open: () => {
      game.starfinderDashboard.render(true);
      game.settings.set(MODULE_ID, 'dashboardOpen', true);
    },
    close: () => game.starfinderDashboard.close(),
    openComms: () => {
      const dash = game.starfinderDashboard;
      const doSwitch = () => dash.element?.find('[data-app="chat"]')?.trigger('click');
      if (dash.rendered) {
        doSwitch();
      } else {
        dash.render(true);
        game.settings.set(MODULE_ID, 'dashboardOpen', true);
        setTimeout(doSwitch, 380);
      }
    }
  };

  // Keyboard shortcut
  globalThis.addEventListener('keydown', ev => {
    if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyD') {
      ev.preventDefault();
      sfDashboard?.toggle?.();
    }
  });

  // Playlist hooks
  const MUSIC_HOOKS = ['createPlaylistSound', 'updatePlaylistSound', 'deletePlaylistSound',
                       'updatePlaylist', 'createPlaylist', 'deletePlaylist'];
  MUSIC_HOOKS.forEach(hookName => {
    Hooks.on(hookName, () => game.starfinderDashboard?.refreshMusicPlayer?.());
  });

  console.log(`%c[Starfinder Dashboard] %cActivated`,
    'color:#00e5ff;font-weight:bold', 'color:#7a90b8');
}

// ─── Setup: license gate ──────────────────────────────────────────────────────
// Async so the license check completes before VNE-style activation logic reads
// the worldLicensed setting at the bottom of this hook.
Hooks.once('setup', async () => {
  if (game.user?.isGM) {
    const licensed = await SFDashboardLicenseClient.instance.initialize();
    if (licensed) {
      try { await game.settings.set(MODULE_ID, 'worldLicensed', true); } catch { /* ignore */ }
    } else {
      // Show the connect prompt once the UI is ready
      Hooks.once('ready', () => SFDashboardLicenseUI.show());
    }
  }

  const worldLicensed = game.settings.get(MODULE_ID, 'worldLicensed') ?? false;
  if (!worldLicensed) return;

  _activateDashboard();
});

// ─── Ready: FAB toggle button + encrypted whisper UI ─────────────────────────
Hooks.once('ready', () => {
  // Re-check in case setup's async completed after worldLicensed was written
  const worldLicensed = game.settings.get(MODULE_ID, 'worldLicensed') ?? false;
  if (worldLicensed && !_activated) _activateDashboard();
});

// ─── Mid-session activation when GM connects Patreon ─────────────────────────

// Immediate activation on the GM client — fires synchronously from activateWithCode
// before the worldLicensed setting round-trips to the server and back.
Hooks.on('starfinderdashboard.activate', () => {
  if (!_activated) {
    document.getElementById('sf-license-prompt')?.remove();
    _activateDashboard();
  }
});

// All other clients receive the worldLicensed = true via updateSetting
Hooks.on('updateSetting', (setting) => {
  if (setting.key === `${MODULE_ID}.worldLicensed`) {
    if (game.settings.get(MODULE_ID, 'worldLicensed') === true && !_activated) {
      document.getElementById('sf-license-prompt')?.remove();
      _activateDashboard();
    }
  }
});

// ─── Toggle button in Players list ───────────────────────────────────────────
Hooks.on('renderPlayerList', (app, html) => {
  if (html.find('#sf-dashboard-toggle').length) return;

  const worldLicensed = game.settings.get(MODULE_ID, 'worldLicensed') ?? false;
  const btnTitle  = worldLicensed ? 'Toggle Starfinder Dashboard' : 'Starfinder Dashboard — Patreon required';
  const btnBorder = worldLicensed ? 'rgba(0,229,255,0.4)' : 'rgba(255,100,100,0.3)';
  const btnColor  = worldLicensed ? '#00e5ff' : '#804040';
  const btnLabel  = worldLicensed ? '◈ DASH' : '🔒 DASH';

  const btn = $(`
    <button id="sf-dashboard-toggle" title="${btnTitle}"
      style="
        position:absolute; bottom:0; right:0;
        background:rgba(0,0,0,0.6);
        border:1px solid ${btnBorder};
        border-radius:6px 0 0 0;
        color:${btnColor};
        padding:4px 8px;
        font-size:10px;
        font-family:'Orbitron',monospace;
        letter-spacing:0.1em;
        cursor:pointer;
        z-index:100;
        line-height:1;
      ">
      ${btnLabel}
    </button>
  `);

  btn.on('click', () => {
    const licensed = game.settings.get(MODULE_ID, 'worldLicensed') ?? false;
    if (!licensed) {
      if (game.user?.isGM) SFDashboardLicenseUI.show();
      return;
    }
    sfDashboard?.toggle?.();
  });

  html.css('position', 'relative');
  html.append(btn);
});

// ─── Encrypted whisper UI in the Foundry sidebar ─────────────────────────────
Hooks.on('renderChatMessage', (message, html) => {
  const whisper = message.whisper;
  if (!whisper?.length) return;

  const myId    = game.user.id;
  const isMine  = message.author?.id === myId;
  const isForMe = whisper.includes(myId);
  if (!isMine && !isForMe) return;

  const el = html.find('.message-content')[0];
  if (!el) return;

  const raw    = (message.content || '').replace(/<[^>]*>/g, '').slice(0, 50);
  const GLYPH  = '░▒▓█▪';
  const glitch = raw.split('').map(c =>
    c === ' ' ? ' ' : (Math.random() > 0.5 ? c : GLYPH[Math.floor(Math.random() * GLYPH.length)])
  ).join('');

  const tag = isMine ? '▲ SENT · ENCRYPTED' : '▼ INCOMING · ENCRYPTED';

  el.innerHTML = `
    <div class="sf-enc-msg">
      <div class="sf-enc-top">
        <span class="sf-enc-pulse"></span>
        <span class="sf-enc-tag">${tag}</span>
      </div>
      <div class="sf-enc-preview">${glitch || '░░░░░░░░░░░░░░░░'}</div>
      <button class="sf-enc-btn" onclick="sfDashboard?.openComms?.()">◈ OPEN COMMS</button>
    </div>
  `;
});
