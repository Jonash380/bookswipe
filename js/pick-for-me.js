/**
 * BookSwipe Pick for Me
 * Friend curation: send your taste DNA to a friend, they curate picks for you.
 * Uses sharable DNA encoding and local curation UI.
 */

import { encodeDNA, decodeDNA } from './compatibility.js';

const STORAGE_KEY = 'bs-picks';

function getPicks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function savePicks(picks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(picks)); } catch {}
}

/**
 * Create a curation request link that encodes the requester's DNA
 */
export function createPickRequest(profile) {
  const dna = encodeDNA(profile);
  const url = `${window.location.origin}${window.location.pathname}?pick=${encodeURIComponent(dna)}`;
  return url;
}

/**
 * Parse a pick request from the URL
 */
export function parsePickRequest() {
  const p = new URLSearchParams(window.location.search);
  const pick = p.get('pick');
  if (!pick) return null;
  const profile = decodeDNA(decodeURIComponent(pick));
  return profile;
}

/**
 * Curate picks for someone - the curator selects items from their watchlist
 * or the discover deck to recommend to the requester.
 */
export function curatePicks(requesterDNA, selectedItems, message = '') {
  const pick = {
    id: Date.now(),
    date: new Date().toISOString(),
    requesterDNA: requesterDNA,
    items: selectedItems.map(i => ({
      id: i.id, title: i.title, cover: i.cover || '',
      year: i.year, genres: i.genres || [], note: i.note || '',
    })),
    message,
    curatorName: localStorage.getItem('bs-curator-name') || '',
  };

  // Generate a short shareable code
  const code = btoa(JSON.stringify(pick)).slice(0, 200);
  pick.code = code;

  const picks = getPicks();
  picks.unshift(pick);
  if (picks.length > 20) picks.length = 20;
  savePicks(picks);

  return pick;
}

/**
 * Receive curated picks via a shareable code
 */
export function receivePicks(code) {
  try {
    const pick = JSON.parse(atob(code));
    return pick;
  } catch { return null; }
}

/** Render the Pick for Me UI */
export function renderPickForMe(app, profile, receivedPick) {
  const de = app.lang === 'de';

  if (receivedPick) {
    // Showing received picks
    let html = `<div class="pick-view">`;
    html += `<div class="pick-header">`;
    html += `<span class="pick-icon">🎁</span>`;
    html += `<h2>${de ? 'Für dich kuratiert' : 'Curated for You'}</h2>`;
    if (receivedPick.curatorName) {
      html += `<p>${de ? 'Von' : 'From'} <strong>${receivedPick.curatorName}</strong></p>`;
    }
    if (receivedPick.message) {
      html += `<p class="pick-message">"${receivedPick.message}"</p>`;
    }
    html += `</div>`;

    html += `<div class="pick-list">`;
    (receivedPick.items || []).forEach(item => {
      html += `
        <div class="pick-item">
          ${item.cover ? `<img src="${item.cover}" alt="" class="pick-cover" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%22120%22><rect fill=%22%23333%22 width=%2280%22 height=%22120%22/><text x=%2240%22 y=%2265%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎬</text></svg>'">` : `<div class="pick-cover placeholder">🎬</div>`}
          <div class="pick-info">
            <strong>${item.title}</strong>
            ${item.year ? `<span>${item.year}</span>` : ''}
            ${item.note ? `<p class="pick-note">💬 "${item.note}"</p>` : ''}
          </div>
        </div>`;
    });
    html += `</div>`;
    html += `</div>`;
    return html;
  }

  // Default view: request picks or curate for someone
  const requestUrl = createPickRequest(profile);

  let html = `<div class="pick-view">`;
  html += `<div class="pick-header">`;
  html += `<span class="pick-icon">🎁</span>`;
  html += `<h2>${de ? 'Pick for Me' : 'Pick for Me'}</h2>`;
  html += `<p>${de ? 'Lass Freunde für dich kuratieren — oder kuratiere für sie' : 'Let friends curate for you — or curate for them'}</p>`;
  html += `</div>`;

  // Request section
  html += `
    <div class="pick-request">
      <h3>📤 ${de ? 'Geschmack teilen' : 'Share Your Taste'}</h3>
      <p>${de ? 'Schick diesen Link an einen Freund. Er kann dann 5 Picks für dich auswählen.' : 'Send this link to a friend. They can pick 5 recommendations for you.'}</p>
      <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${requestUrl.replace(/'/g,"\\'")}')">📋 ${de ? 'Link kopieren' : 'Copy Link'}</button>
    </div>`;

  // Received picks history
  const picks = getPicks();
  if (picks.length) {
    html += `<div class="pick-history">`;
    html += `<h3>📥 ${de ? 'Erhaltene Picks' : 'Received Picks'}</h3>`;
    picks.slice(0, 3).forEach(pick => {
      html += `
        <div class="pick-history-item" data-code="${pick.code}">
          <span>${new Date(pick.date).toLocaleDateString()}</span>
          <span>${pick.items.length} ${de ? 'Picks' : 'picks'}</span>
          ${pick.curatorName ? `<span>${de?'von':'by'} ${pick.curatorName}</span>` : ''}
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}
