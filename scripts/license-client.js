/**
 * Starfinder Dashboard — License Client
 *
 * Handles Patreon OAuth, JWT token management, device fingerprinting,
 * periodic heartbeat, and feature gating. Shares the same backend as
 * vnd-enhanced but uses a separate module ID and localStorage keys.
 */

const MODULE_ID = 'starfinderdashboard';
const API_BASE  = 'https://vnd-license.gmredvelvet.workers.dev';

// RSA public key (SPKI base64url) — same backend as vnd-enhanced, same key.
const RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3-hTzuHo9lgENNQiA4-Fm7VIdalqisZ5NhqrBioXmIXSMbEhYpy1TnPkCBAdAzXAsyX1YdTYLcMADETPnERvceLsDoAWHFZzHGxoXBkOGw0ukAyHJyrwBZxCf_bY_FSbip_-XQuTS4YuyhLPVNjbGMZdVarkegh7BKwW4CR9MDb1DMtf_NxtfNqJ3MxhfAiTxIod4AWer8esisr0IekQlPLmMPA2KggzQw9rFj61B4DAVk2F_TAXPMOKyEcX_zVGpp00JTurTsfwK2023UHKO9t98R0rG17oX0rK_x2EOBiW2Nla3NChZyR4yi8zHe0vjYhprqcwozv9wN0wbANnzwIDAQAB';

const SK = {
  accessToken:    `${MODULE_ID}:at`,
  refreshToken:   `${MODULE_ID}:rt`,
  tokenExpiry:    `${MODULE_ID}:exp`,
  installationId: `${MODULE_ID}:iid`,
  tier:           `${MODULE_ID}:tier`,
  features:       `${MODULE_ID}:features`,
};

// ── SFDashboardLicenseClient ──────────────────────────────────────────────────

export class SFDashboardLicenseClient {
  static #instance = null;

  #accessToken           = null;
  #refreshToken          = null;
  #tokenExpiry           = 0;
  #installationId        = null;
  #fingerprint           = null;
  #features              = [];
  #tier                  = 'none';
  #heartbeatTimer        = null;
  #initialHeartbeatTimer = null;
  #lastHeartbeat         = 0;
  #gracePeriodMs         = 5 * 60 * 1000;
  #degraded              = false;
  #rsaPublicKey          = null;

  static get instance() {
    if (!this.#instance) this.#instance = new SFDashboardLicenseClient();
    return this.#instance;
  }

  async initialize() {
    this.#installationId = this.#getOrCreateInstallationId();
    this.#fingerprint    = await this.#computeFingerprint();
    this.#loadStoredTokens();

    if (this.#accessToken && this.#isAccessTokenValid()) {
      try {
        await this.#loadVerifiedClaims();
      } catch {
        this.#clearStoredTokens();
        return false;
      }
      this.#startHeartbeat();
      return true;
    }

    if (this.#refreshToken) {
      try {
        await this.#doRefresh();
        this.#startHeartbeat();
        return true;
      } catch {
        this.#clearStoredTokens();
      }
    }

    return false;
  }

  hasFeature(featureName) {
    if (this.#degraded) return false;
    if (!this.#accessToken || !this.#isAccessTokenValid()) return false;
    return this.#features.includes(featureName);
  }

  get tier() { return this.#tier; }
  get isLicensed() { return this.#tier !== 'none' && !this.#degraded; }

  // ── OAuth flow ─────────────────────────────────────────────────────────────

  async startOAuth() {
    const { url } = await this.#apiCall('/oauth/start', {
      origin:   globalThis.location.origin,
      moduleId: MODULE_ID
    });
    const popup = window.open(url, 'sf-patreon-auth', 'width=600,height=700,popup=yes');

    return new Promise((resolve, reject) => {
      const expectedOrigin = new URL(API_BASE).origin;

      const handler = async (event) => {
        if (event.origin !== expectedOrigin) return;
        if (event.data?.type !== 'vnd-auth-code') return;
        window.removeEventListener('message', handler);
        popup?.close();
        try {
          await this.activateWithCode(event.data.authCode);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      };
      window.addEventListener('message', handler);

      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          window.removeEventListener('message', handler);
          resolve(false);
        }
      }, 1000);
    });
  }

  async activateWithCode(authCode) {
    const result = await this.#apiCall('/oauth/exchange', {
      authCode,
      installationId:  this.#installationId,
      fingerprintHash: this.#fingerprint,
      moduleId:        MODULE_ID
    });

    this.#storeTokens(result.accessToken, result.refreshToken, result.expiresIn, result.tier, result.features);
    this.#tier     = result.tier;
    this.#features = result.features ?? [];
    this.#startHeartbeat();

    // Activate immediately on this client, then persist for all clients via the world setting.
    Hooks.callAll('starfinderdashboard.activate');
    game.settings?.set?.(MODULE_ID, 'worldLicensed', true).catch(() => {});

    ui.notifications?.info(`Starfinder Dashboard: Connected as ${result.tier} subscriber.`);
  }

  async releaseInstallation() {
    try {
      await this.#apiCall('/license/release', { installationId: this.#installationId });
      this.#clearStoredTokens();
      this.#stopHeartbeat();
      game.settings?.set?.(MODULE_ID, 'worldLicensed', false).catch(() => {});
      ui.notifications?.info('Starfinder Dashboard: Installation slot released.');
    } catch (e) {
      ui.notifications?.error(`Starfinder Dashboard: Failed to release slot — ${e.message}`);
    }
  }

  // ── Token storage ───────────────────────────────────────────────────────────

  #loadStoredTokens() {
    this.#accessToken  = localStorage.getItem(SK.accessToken);
    this.#refreshToken = localStorage.getItem(SK.refreshToken);
    this.#tokenExpiry  = Number.parseInt(localStorage.getItem(SK.tokenExpiry) ?? '0', 10);
    const rawFeatures  = JSON.parse(localStorage.getItem(SK.features) ?? '[]');
    this.#features     = Array.isArray(rawFeatures) ? rawFeatures : [];
    this.#tier         = localStorage.getItem(SK.tier) ?? 'none';
  }

  #storeTokens(at, rt, expiresIn, tier, features) {
    const expiry       = Date.now() + expiresIn * 1000;
    this.#accessToken  = at;
    this.#refreshToken = rt;
    this.#tokenExpiry  = expiry;
    this.#tier         = tier;
    this.#features     = features ?? [];

    localStorage.setItem(SK.accessToken,  at);
    localStorage.setItem(SK.refreshToken, rt);
    localStorage.setItem(SK.tokenExpiry,  String(expiry));
    localStorage.setItem(SK.tier,         tier);
    localStorage.setItem(SK.features,     JSON.stringify(features ?? []));
  }

  #clearStoredTokens() {
    this.#accessToken  = null;
    this.#refreshToken = null;
    this.#tokenExpiry  = 0;
    this.#tier         = 'none';
    this.#features     = [];
    Object.values(SK).forEach(k => localStorage.removeItem(k));
  }

  #isAccessTokenValid() {
    return !!this.#accessToken && this.#tokenExpiry > Date.now() + 60_000;
  }

  async #loadVerifiedClaims() {
    const claims   = await this.#verifyAndParseJwt(this.#accessToken);
    this.#tier     = claims.tier     ?? 'none';
    this.#features = claims.features ?? [];
  }

  // ── Installation ID ─────────────────────────────────────────────────────────

  #getOrCreateInstallationId() {
    let iid = localStorage.getItem(SK.installationId);
    if (!iid) {
      iid = crypto.randomUUID();
      localStorage.setItem(SK.installationId, iid);
    }
    return iid;
  }

  // ── Device fingerprint ──────────────────────────────────────────────────────

  async #computeFingerprint() {
    const components = [
      game.world?.id ?? 'unknown',
      game.version   ?? '',
      this.#installationId,
      navigator.language,
      navigator.hardwareConcurrency,
      screen.width, screen.height, screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      await this.#canvasFingerprint()
    ].join('|');

    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
    return btoa(String.fromCodePoint(...new Uint8Array(buf)));
  }

  async #canvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#0a0f1a';
      ctx.fillText('sf-dash', 2, 15);
      ctx.fillStyle = 'rgba(0,229,255,0.7)';
      ctx.fillText('sf-dash', 4, 17);
      return canvas.toDataURL().slice(-32);
    } catch { return 'no-canvas'; }
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async #doRefresh() {
    const result = await this.#apiCall('/token/refresh', {
      refreshToken:    this.#refreshToken,
      fingerprintHash: this.#fingerprint
    });
    this.#storeTokens(result.accessToken, result.refreshToken, result.expiresIn, result.tier, result.features);
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  #startHeartbeat() {
    this.#stopHeartbeat();
    const INTERVAL = 15 * 60 * 1000;
    this.#lastHeartbeat = Date.now();

    this.#initialHeartbeatTimer = setTimeout(() => {
      this.#initialHeartbeatTimer = null;
      this.#doHeartbeat();
    }, 60_000);
    this.#heartbeatTimer = setInterval(() => this.#doHeartbeat(), INTERVAL);
  }

  #stopHeartbeat() {
    if (this.#initialHeartbeatTimer) {
      clearTimeout(this.#initialHeartbeatTimer);
      this.#initialHeartbeatTimer = null;
    }
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }

  async #doHeartbeat() {
    try {
      const result = await this.#apiCall('/heartbeat', {
        installationId:  this.#installationId,
        fingerprintHash: this.#fingerprint
      });
      this.#storeTokens(result.accessToken, this.#refreshToken, result.expiresIn, result.tier, result.features);
      this.#lastHeartbeat = Date.now();
      this.#degraded = false;
    } catch {
      this.#handleHeartbeatFailure();
    }
  }

  #handleHeartbeatFailure() {
    const timeSinceLast = Date.now() - this.#lastHeartbeat;
    if (timeSinceLast > this.#gracePeriodMs) {
      if (!this.#degraded) {
        this.#degraded = true;
        if (game.user?.isGM) {
          game.settings?.set?.(MODULE_ID, 'worldLicensed', false).catch(() => {});
          ui.notifications?.warn('Starfinder Dashboard: License server unreachable. Module suspended until reconnected.');
        }
      }
    }
  }

  // ── API call ────────────────────────────────────────────────────────────────

  async #apiCall(endpoint, body, method = 'POST') {
    const nonce     = crypto.randomUUID();
    const timestamp = Date.now();

    const init = {
      method,
      headers: {
        'Content-Type':      'application/json',
        'X-Installation-ID': this.#installationId ?? '',
      }
    };

    if (this.#accessToken) {
      init.headers['Authorization'] = `Bearer ${this.#accessToken}`;
    }

    if (method === 'POST' && body !== null) {
      init.body = JSON.stringify({ ...body, nonce, timestamp });
    }

    const resp = await fetch(`${API_BASE}${endpoint}`, init);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Network error', code: 'NETWORK_ERROR' }));
      throw new SFLicenseError(err.error ?? 'Request failed', err.code ?? 'API_ERROR');
    }

    const data = await resp.json();

    if (data.sig && data.payload) {
      await this.#verifyResponseSig(data.payload, data.sig);
      return data.payload;
    }

    return data;
  }

  // ── RSA helpers ─────────────────────────────────────────────────────────────

  async #importRsaPublicKey() {
    if (this.#rsaPublicKey) return this.#rsaPublicKey;
    const keyBytes = Uint8Array.from(
      atob(RSA_PUBLIC_KEY.replaceAll('-', '+').replaceAll('_', '/')),
      c => c.codePointAt(0)
    );
    this.#rsaPublicKey = await crypto.subtle.importKey(
      'spki', keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify']
    );
    return this.#rsaPublicKey;
  }

  async #verifyResponseSig(payload, jwt) {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new SFLicenseError('Malformed response token', 'SIGNATURE_INVALID');

    const [hdr, body, sig] = parts;
    const key      = await this.#importRsaPublicKey();
    const data     = new TextEncoder().encode(`${hdr}.${body}`);
    const sigBytes = Uint8Array.from(
      atob(sig.replaceAll('-', '+').replaceAll('_', '/')),
      c => c.codePointAt(0)
    );

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, data);
    if (!valid) throw new SFLicenseError('Server response verification failed', 'SIGNATURE_INVALID');

    const claims = JSON.parse(atob(body.replaceAll('-', '+').replaceAll('_', '/')));
    const now    = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) throw new SFLicenseError('Response token expired', 'REPLAY_DETECTED');

    const payloadHash = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(JSON.stringify(payload))
    );
    const expectedPh = btoa(String.fromCodePoint(...new Uint8Array(payloadHash)))
      .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    if (claims.ph !== expectedPh) throw new SFLicenseError('Response payload tampered', 'SIGNATURE_INVALID');
  }

  async #verifyAndParseJwt(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new SFLicenseError('Malformed JWT', 'INVALID_TOKEN');

    const [hdr, body, sig] = parts;
    const key      = await this.#importRsaPublicKey();
    const data     = new TextEncoder().encode(`${hdr}.${body}`);
    const sigBytes = Uint8Array.from(
      atob(sig.replaceAll('-', '+').replaceAll('_', '/')),
      c => c.codePointAt(0)
    );

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, data);
    if (!valid) throw new SFLicenseError('JWT signature invalid', 'INVALID_TOKEN');

    const payload = JSON.parse(atob(body.replaceAll('-', '+').replaceAll('_', '/')));
    const now     = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new SFLicenseError('JWT expired', 'TOKEN_EXPIRED');
    return payload;
  }
}

// ── SFLicenseError ────────────────────────────────────────────────────────────

export class SFLicenseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SFLicenseError';
    this.code = code;
  }
}

// ── SFDashboardLicenseUI ──────────────────────────────────────────────────────

export class SFDashboardLicenseUI {
  static show() {
    if (!game.user?.isGM) return;

    const id = 'sf-license-prompt';
    if (document.getElementById(id)) return;

    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      position:fixed; bottom:80px; right:20px; z-index:9999;
      background:#080d14; border:1px solid rgba(0,229,255,0.25); border-radius:10px;
      padding:20px 24px; max-width:320px;
      box-shadow:0 8px 32px rgba(0,0,0,.85), 0 0 24px rgba(0,229,255,0.07);
      font-family:system-ui,sans-serif; color:#9ab8cc;
    `;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="color:#00e5ff;font-size:1.1rem;font-family:'Orbitron',monospace">◈</span>
        <strong style="color:#00e5ff;font-size:.8rem;letter-spacing:.15em;font-family:'Orbitron',monospace">
          STARFINDER DASHBOARD
        </strong>
      </div>
      <p style="font-size:.8rem;color:#506070;margin-bottom:16px;line-height:1.5">
        Connect your Patreon account to enable this module.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="sf-connect-btn" style="
          background:linear-gradient(135deg,#00b8d4 0%,#006a88 100%);
          color:#000d14;border:none;border-radius:6px;
          padding:10px;font-size:.75rem;font-weight:700;cursor:pointer;width:100%;
          font-family:'Orbitron',monospace;letter-spacing:.1em;
        ">◈ CONNECT PATREON</button>
        <button id="sf-code-btn" style="
          background:transparent;color:#506070;
          border:1px solid rgba(0,229,255,0.15);border-radius:6px;
          padding:8px;font-size:.75rem;cursor:pointer;width:100%;
        ">I have an auth code</button>
        <button id="sf-dismiss-btn" style="
          background:none;border:none;color:#304050;font-size:.7rem;
          cursor:pointer;text-align:right;padding:0;
        ">Dismiss</button>
      </div>
    `;

    el.querySelector('#sf-connect-btn').addEventListener('click', async () => {
      const btn = el.querySelector('#sf-connect-btn');
      btn.textContent = 'CONNECTING...';
      btn.disabled = true;
      try {
        const success = await SFDashboardLicenseClient.instance.startOAuth();
        if (success) el.remove();
        else { btn.textContent = '◈ CONNECT PATREON'; btn.disabled = false; }
      } catch (e) {
        btn.textContent = '◈ CONNECT PATREON'; btn.disabled = false;
        ui.notifications?.error(`Starfinder Dashboard: ${e.message}`);
      }
    });

    el.querySelector('#sf-code-btn').addEventListener('click', () => {
      SFDashboardLicenseUI.showCodeInput();
      el.remove();
    });

    el.querySelector('#sf-dismiss-btn').addEventListener('click', () => el.remove());

    document.body.appendChild(el);
  }

  static showCodeInput() {
    new Dialog({
      title: 'Starfinder Dashboard — Auth Code',
      content: `
        <p style="margin-bottom:12px;font-size:.9rem">
          Paste the code shown after connecting your Patreon account.
        </p>
        <input id="sf-auth-code-input" type="text"
          placeholder="Paste auth code here..."
          style="width:100%;padding:8px;border-radius:6px;
                 border:1px solid rgba(0,229,255,0.3);
                 background:#080d14;color:#9ab8cc;
                 font-family:monospace;font-size:.85rem"/>
      `,
      buttons: {
        activate: {
          label: '<i class="fas fa-key"></i> Activate',
          callback: async (html) => {
            const code = html.find('#sf-auth-code-input').val().trim();
            if (!code) return;
            try {
              await SFDashboardLicenseClient.instance.activateWithCode(code);
            } catch (e) {
              ui.notifications?.error(`Starfinder Dashboard: ${e.message}`);
            }
          }
        },
        cancel: { label: 'Cancel' }
      }
    }).render(true, { width: 420 });
  }
}
