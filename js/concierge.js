/**
 * BookSwipe AI Concierge Chat
 * Natural language media recommendations via LLM proxy.
 * Uses the existing recommender engine + optional LLM integration.
 */

import { encodeDNA } from './compatibility.js';
import { escapeHTML } from './utils.js';

export class Concierge {
  constructor(app) {
    this.app = app;
    this.history = [];
    this._loadHistory();
  }

  _loadHistory() {
    try { this.history = JSON.parse(localStorage.getItem('bs-concierge')) || []; }
    catch { this.history = []; }
  }

  _saveHistory() {
    try { localStorage.setItem('bs-concierge', JSON.stringify(this.history.slice(-50))); } catch {}
  }

  /**
   * Query the concierge. If an LLM endpoint is available, uses the LLM.
   * Falls back to a rule-based recommender query using the existing profile.
   */
  async query(userMessage) {
    const de = this.app.lang === 'de';
    this.history.push({ role:'user', content:userMessage, time:Date.now() });

    let response;

    // Try LLM proxy first
    try {
      const r = await fetch('/proxy/ai/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          lang: this.app.lang,
          profile: {
            topGenres: this.app.recommender?.getTopGenres(5) || [],
            topTropes: this.app.recommender?.getTopTropes(3) || [],
            mediaType: this.app.state.mediaType,
            watchlistSample: (this.app.watchlist || []).slice(0, 5).map(w => w.title),
          },
          history: this.history.slice(-10),
        })
      });
      if (r.ok) {
        const data = await r.json();
        response = data.response;
      }
    } catch {
      // Fallback: rule-based response
      response = this._ruleBasedResponse(userMessage, de);
    }

    if (!response) response = this._ruleBasedResponse(userMessage, de);

    this.history.push({ role:'assistant', content:response, time:Date.now() });
    this._saveHistory();
    return response;
  }

  _ruleBasedResponse(msg, de) {
    const lower = msg.toLowerCase();
    const profile = this.app.recommender?.profile || {};
    const topGenres = this.app.recommender?.getTopGenres(3) || [];
    const watchlistCount = (this.app.watchlist || []).length;

    // Pattern matching for rule-based responses
    if (/länger|longer|epic|lang/i.test(lower) && /film|movie|spiel|game/i.test(lower)) {
      return de
        ? `Du magst epische Erlebnisse! Basierend auf deinem Profil (${topGenres.join(', ')}) empfehle ich dir längere Titel — schau dir die Karten mit längerer Spielzeit oder epischen Filmen in deinem Deck an. Versuch den "Epic"-Filter in den Genres.`
        : `You enjoy epic experiences! Based on your profile (${topGenres.join(', ')}), try longer titles — look for cards with longer playtime or check the epic genre filters.`;
    }

    if (/kurz|short|schnell|quick/i.test(lower)) {
      const rec = this._findShortItem(de);
      return rec || (de
        ? `Für was Kurzes: Filtere nach Spielen unter 10 Stunden oder such nach Kurzfilmen. Deine ${topGenres[0] || 'Top-Genres'}-Vorliebe bleibt erhalten!`
        : `For something quick: filter for games under 10 hours or look for short films. Your ${topGenres[0] || 'top genre'} preference stays intact!`);
    }

    if (/lustig|funny|comedy|komödie/i.test(lower)) {
      return de
        ? `Lust auf was Lustiges! 🎭 In deinem Deck findest du Comedy/Feel-Good-Titel. Probier den "Feel Good" Mood-Filter. Basierend auf deinen ${topGenres[0] || ''}-Vorlieben findest du garantiert was Passendes.`
        : `In the mood for laughs! 🎭 Check your deck for comedy/feel-good titles. Try the "Feel Good" mood filter. Your ${topGenres[0] || ''} taste ensures a good pick.`;
    }

    if (/action|spannung|thriller|adrenalin/i.test(lower)) {
      return de
        ? `Action & Adrenalin! 💥 Mit ${topGenres.join(', ')} in deinem Profil findest du actionreiche Titel, die zu deinem Geschmack passen. Probier den "Action" oder "Thriller" Genre-Filter.`
        : `Action & adrenaline! 💥 With ${topGenres.join(', ')} in your profile, you'll find action-packed titles matching your taste. Try the "Action" or "Thriller" genre filters.`;
    }

    // Default response
    const defaults = de ? [
      `Basierend auf deinen ${watchlistCount} Likes und Top-Genres (${topGenres.join(', ')}), empfehle ich dir, die neuen Karten in deinem Entdecken-Deck durchzugehen. Dein Geschmack ist gut kalibriert!`,
      `Mit deinem Profil (${topGenres.slice(0,2).join(', ')}) findest du im Discover-Bereich passende Titel. Probier den Geheimtipp-Modus fuer Ueberraschungen! 🎭`,
      `Deine ${topGenres[0] || 'Genre'}-Vorliebe ist stark! Schau dir die ähnlichen Titel in deinem Deck an. Oder starte eine Challenge für neue Entdeckungen.`,
    ] : [
      `Based on your ${watchlistCount} likes and top genres (${topGenres.join(', ')}), I recommend browsing your Discover deck. Your taste profile is well-calibrated!`,
      `With your profile (${topGenres.slice(0,2).join(', ')}) you'll find great picks in Discover. Try Mystery Pick mode for surprises! 🎭`,
      `Your ${topGenres[0] || 'genre'} preference is strong! Check similar titles in your deck. Or start a challenge for new discoveries.`,
    ];
    return pick(defaults);
  }

  _findShortItem(de) {
    const cards = this.app.currentCards || [];
    const short = cards.find(c => c.playtime && c.playtime <= 5);
    if (short) {
      return de
        ? `Probier "${short.title}" — nur ${short.playtime}h Spielzeit und passt zu deinen Genres!`
        : `Try "${short.title}" — only ${short.playtime}h playtime and matches your genres!`;
    }
    return null;
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Render the concierge chat UI */
export function renderConcierge(app, concierge) {
  const de = app.lang === 'de';

  let html = `<div class="concierge-view">`;
  html += `<div class="concierge-chat">`;

  // Chat messages
  for (const msg of concierge.history.slice(-20)) {
    if (msg.role === 'assistant') {
      html += `<div class="concierge-msg assistant"><p>${escapeHTML(msg.content)}</p></div>`;
    } else {
      html += `<div class="concierge-msg user"><p>${escapeHTML(msg.content)}</p></div>`;
    }
  }

  // Initial greeting if empty
  if (!concierge.history.length) {
    html += `
      <div class="concierge-greeting">
        <span class="concierge-greeting-icon">🤖</span>
        <h3>${de ? 'Dein Media-Concierge' : 'Your Media Concierge'}</h3>
        <p>${de ? 'Beschreib wonach dir ist — ich finde das Passende.' : 'Describe what you\'re in the mood for — I\'ll find the right pick.'}</p>
        <div class="concierge-suggestions">
          <button class="concierge-suggestion" data-msg="${de?'Lust auf was Lustiges':'Something funny'}">😂 ${de?'Lust auf was Lustiges':'Something funny'}</button>
          <button class="concierge-suggestion" data-msg="${de?'Was Kurzes für zwischendurch':'Something short and quick'}">⚡ ${de?'Was Kurzes':'Something short'}</button>
          <button class="concierge-suggestion" data-msg="${de?'Action und Spannung':'Action and thrills'}">💥 ${de?'Action & Spannung':'Action & Thrills'}</button>
          <button class="concierge-suggestion" data-msg="${de?'Epische Filme oder Spiele':'Epic movies or games'}">🌌 ${de?'Episches':'Epic'}</button>
        </div>
      </div>`;
  }
  html += `</div>`;

  // Input
  html += `
    <div class="concierge-input-row">
      <input type="text" class="concierge-input" placeholder="${de ? 'Wonach ist dir heute...?' : 'What are you in the mood for...?'}" data-action="concierge-send">
      <button class="btn btn-primary" data-action="concierge-send">→</button>
    </div>`;

  html += `</div>`;
  return html;
}
