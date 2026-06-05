/**
 * BookSwipe Browse Party
 * 
 * Share a session link, everyone browses the same deck, consensus pick revealed.
 */

const STORAGE_KEY = 'bs-party';

export class BrowseParty {
  constructor(app) {
    this.app = app;
    this.sessionId = null;
    this.isHost = false;
    this.participants = [];
    this.results = {};
    this._pollTimer = null;
  }

  async createSession(deck) {
    try {
      const r = await fetch('/proxy/party/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: this._fingerprint(),
          deck: deck.map(c => ({ id: c.id, title: c.title, cover: c.cover, year: c.year }))
        })
      });
      const data = await r.json();
      if (data.id) {
        this.sessionId = data.id;
        this.isHost = true;
        this._saveSession();
        this._startPolling();
        return data;
      }
    } catch (e) { console.warn('Party create error:', e); }
    return null;
  }

  async joinSession(sessionId) {
      this.sessionId = sessionId;
      this.isHost = false;
      this._saveSession();
      this._startPolling();
      // Register as participant
      try {
        await fetch('/proxy/party/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: sessionId, user: this._fingerprint() })
        });
      } catch {}
      return true;
  }

  async submitBrowse(itemId, direction) {
    if (!this.sessionId) return;
    try {
      await fetch('/proxy/party/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: this.sessionId,
          user: this._fingerprint(),
          itemId,
          direction
        })
      });
    } catch {}
  }

  async getState() {
    if (!this.sessionId) return null;
    try {
      const r = await fetch(`/proxy/party/state?session=${this.sessionId}`);
      return await r.json();
    } catch { return null; }
  }

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(async () => {
      const state = await this.getState();
      if (state) {
        this.participants = state.participants || [];
        this.results = state.results || {};
        if (this._onUpdate) this._onUpdate(state);
      }
    }, 2000);
  }

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  onUpdate(fn) { this._onUpdate = fn; }

  leave() {
    this._stopPolling();
    this.sessionId = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  _saveSession() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: this.sessionId, isHost: this.isHost }));
  }

  _fingerprint() {
    let fp = localStorage.getItem('bs-fingerprint');
    if (!fp) {
      fp = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('bs-fingerprint', fp);
    }
    return fp;
  }

  static loadSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
}

/** Render the Browse Party UI */
export function renderBrowseParty(app, party) {
  const de = app.lang === 'de';

  let html = `<div class="party-view">`;
  html += `<div class="party-header">`;
  html += `<span class="party-icon">🎉</span>`;
  html += `<h2>${de ? 'Browse Party' : 'Browse Party'}</h2>`;
  html += `<p>${de ? 'Gemeinsam stoebern, gemeinsam entscheiden' : 'Browse together, decide together'}</p>`;
  html += `</div>`;

  if (party.sessionId) {
    // In session
    html += `
      <div class="party-session">
        <div class="party-session-id">
          <span>${de ? 'Session' : 'Session'}: <strong>${party.sessionId}</strong></span>
          <button class="btn btn-sm" onclick="navigator.clipboard.writeText(window.location.origin+'?party=${party.sessionId}')">📋 ${de?'Einladung kopieren':'Copy invite'}</button>
        </div>
        <div class="party-participants">
          <h3>👥 ${party.participants.length || 1} ${de ? 'Teilnehmer' : 'participants'}</h3>
        </div>
        <button class="btn btn-nope" data-action="leave-party">${de ? 'Party verlassen' : 'Leave Party'}</button>
      </div>`;
  } else {
    // Create or join
    html += `
      <div class="party-actions">
        <button class="btn btn-primary" data-action="create-party">🎉 ${de ? 'Party starten' : 'Start Party'}</button>
        <div class="party-join">
          <input type="text" class="party-join-input" placeholder="${de ? 'Session-ID eingeben...' : 'Enter session ID...'}">
          <button class="btn" data-action="join-party">${de ? 'Beitreten' : 'Join'}</button>
        </div>
      </div>`;
  }

  // Results
  if (Object.keys(party.results || {}).length > 0) {
    html += `<div class="party-results">`;
    html += `<h3>📊 ${de ? 'Ergebnisse' : 'Results'}</h3>`;
    const entries = Object.entries(party.results).sort((a, b) => b[1].likes - a[1].likes);
    entries.slice(0, 5).forEach(([id, r], i) => {
      html += `
        <div class="party-result ${i === 0 ? 'winner' : ''}">
          <span class="party-result-rank">#${i+1}</span>
          <span class="party-result-title">${r.title || id}</span>
          <span class="party-result-votes">📚 ${r.likes || 0} | ✕ ${r.nopes || 0}</span>
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}
