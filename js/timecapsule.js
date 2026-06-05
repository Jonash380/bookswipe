/**
 * BookSwipe Taste Time Capsule
 * Save and revisit taste profile snapshots over time.
 * Shows a diff visualization of before/after tastes.
 */

const STORAGE_KEY = 'bs-timecapsules';

function getCapsules() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveCapsules(capsules) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(capsules)); } catch {}
}

export function createSnapshot(profile, label = '') {
  const snap = {
    id: Date.now(),
    date: new Date().toISOString(),
    label: label || new Date().toLocaleDateString(),
    totalSwipes: profile.totalSwipes || 0,
    likeRatio: profile.likeRatio || 0,
    genreWeights: { ...(profile.genreWeights || {}) },
    tropeWeights: { ...(profile.tropes || {}) },
    pacingStyles: { ...(profile.pacingStyles || {}) },
    topGenres: Object.entries(profile.genreWeights || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n]) => n),
  };
  const capsules = getCapsules();
  // Keep max 10 capsules
  if (capsules.length >= 10) capsules.shift();
  capsules.push(snap);
  saveCapsules(capsules);
  return snap;
}

export function getSnapshots() {
  return getCapsules();
}

/** Compute diff between two snapshots */
export function diffSnapshots(oldSnap, newSnap) {
  const diffs = [];

  // Genre additions
  const addedGenres = [];
  const removedGenres = [];
  const boostedGenres = [];

  Object.entries(newSnap.genreWeights || {}).forEach(([genre, weight]) => {
    const oldWeight = (oldSnap.genreWeights || {})[genre] || 0;
    if (oldWeight === 0 && weight > 0) addedGenres.push(genre);
    else if (weight > oldWeight + 0.5) boostedGenres.push({ genre, from: oldWeight, to: weight });
  });

  Object.entries(oldSnap.genreWeights || {}).forEach(([genre, weight]) => {
    const newWeight = (newSnap.genreWeights || {})[genre] || 0;
    if (weight > 0 && newWeight === 0) removedGenres.push(genre);
  });

  if (addedGenres.length) diffs.push({ type:'added', label:'Neue Entdeckungen', label_en:'New Discoveries', items: addedGenres.slice(0, 5) });
  if (removedGenres.length) diffs.push({ type:'removed', label:'Vergessene Genres', label_en:'Forgotten Genres', items: removedGenres.slice(0, 5) });
  if (boostedGenres.length) diffs.push({ type:'boosted', label:'Verstärkte Vorlieben', label_en:'Strengthened Tastes', items: boostedGenres.slice(0, 5).map(b => b.genre) });

  // Persona change
  const oldPersona = oldSnap.topGenres[0] || '';
  const newPersona = newSnap.topGenres[0] || '';
  if (oldPersona !== newPersona) {
    diffs.push({ type:'persona', label:'Persona-Wechsel', label_en:'Persona Shift', items: [oldPersona, newPersona] });
  }

  return diffs;
}

/** Render the time capsule gallery */
export function renderTimeCapsule(app, profile) {
  const de = app.lang === 'de';
  const capsules = getCapsules();

  let html = `<div class="timecapsule-view">`;
  html += `<div class="tc-header">`;
  html += `<span class="tc-icon">⏳</span>`;
  html += `<h2>${de ? 'Geschmacks-Zeitkapsel' : 'Taste Time Capsule'}</h2>`;
  html += `<p>${de ? 'Sieh, wie sich dein Geschmack verändert hat' : 'See how your taste has evolved'}</p>`;
  html += `</div>`;

  if (capsules.length < 2) {
    html += `<div class="tc-empty">`;
    html += `<p>${de ? 'Noch nicht genug Snapshots. Erstelle jetzt deinen ersten!' : 'Not enough snapshots yet. Create your first one now!'}</p>`;
    html += `<button class="btn btn-primary" data-action="create-snapshot">📸 ${de ? 'Snapshot erstellen' : 'Create Snapshot'}</button>`;
    html += `</div>`;
  }

  // Show timeline
  html += `<div class="tc-timeline">`;
  [...capsules].reverse().forEach((cap, i) => {
    html += `
      <div class="tc-snapshot">
        <div class="tc-snap-date">${new Date(cap.date).toLocaleDateString(de ? 'de-DE' : 'en-US', { month:'short', day:'numeric' })}</div>
        <div class="tc-snap-info">
          <strong>${cap.label}</strong>
          <span>${cap.totalSwipes} ${de?'Stoeberaktionen':'browses'} · ${Math.round((cap.likeRatio||0)*100)}% ${de?'Speicherquote':'save rate'}</span>
          <div class="tc-snap-genres">${cap.topGenres.slice(0,3).map(g => `<span class="tc-genre-tag">${g}</span>`).join('')}</div>
        </div>
      </div>`;
  });
  html += `</div>`;

  // Create snapshot button
  html += `<button class="btn btn-primary" data-action="create-snapshot">📸 ${de ? 'Neuen Snapshot erstellen' : 'Create New Snapshot'}</button>`;
  html += `</div>`;
  return html;
}

/** Render a diff between two capsules */
export function renderDiff(app, oldSnap, newSnap, diffs) {
  const de = app.lang === 'de';

  let html = `<div class="tc-diff-view">`;
  html += `<div class="tc-diff-header">`;
  html += `<h2>${de ? 'Geschmacks-Evolution' : 'Taste Evolution'}</h2>`;
  html += `<div class="tc-diff-dates">`;
  html += `<span>${new Date(oldSnap.date).toLocaleDateString(de?'de-DE':'en-US')}</span>`;
  html += `<span>→</span>`;
  html += `<span>${new Date(newSnap.date).toLocaleDateString(de?'de-DE':'en-US')}</span>`;
  html += `</div></div>`;

  for (const diff of diffs) {
    const icon = diff.type === 'added' ? '🆕' : diff.type === 'removed' ? '👋' : diff.type === 'boosted' ? '📈' : '🔄';
    html += `
      <div class="tc-diff-section">
        <h3>${icon} ${de ? diff.label : diff.label_en}</h3>
        <div class="tc-diff-items">`;
    if (diff.type === 'persona') {
      html += `<span class="tc-old">${diff.items[0]}</span> → <span class="tc-new">${diff.items[1]}</span>`;
    } else {
      diff.items.forEach(item => {
        html += `<span class="tc-diff-tag">${typeof item === 'string' ? item : item.genre}</span>`;
      });
    }
    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}
