/**
 * BookSwipe Taste Compatibility — "Taste Match"
 * Compare two taste DNA profiles and compute a compatibility score.
 */

export function computeCompatibility(profile1, profile2) {
  const dimensions = [];

  // Genre overlap
  const genres1 = Object.entries(profile1.genreWeights || {}).filter(([,w]) => w > 0);
  const genres2 = Object.entries(profile2.genreWeights || {}).filter(([,w]) => w > 0);
  const genreNames1 = new Set(genres1.map(([n]) => n.toLowerCase()));
  const genreNames2 = new Set(genres2.map(([n]) => n.toLowerCase()));
  const sharedGenres = [...genreNames1].filter(g => genreNames2.has(g));
  const genreScore = Math.min(100, sharedGenres.length * 20 + Math.min(sharedGenres.length, 3) * 10);
  dimensions.push({ label:'Genre-Überlappung', label_en:'Genre Overlap', score: genreScore, details: sharedGenres.slice(0, 3) });

  // Trope alignment
  const tropes1 = Object.entries(profile1.tropes || {}).filter(([,w]) => w > 0);
  const tropes2 = Object.entries(profile2.tropes || {}).filter(([,w]) => w > 0);
  const tropeNames1 = new Set(tropes1.map(([n]) => n.toLowerCase()));
  const tropeNames2 = new Set(tropes2.map(([n]) => n.toLowerCase()));
  const sharedTropes = [...tropeNames1].filter(t => tropeNames2.has(t));
  const tropeScore = Math.min(100, sharedTropes.length * 25 + 20);
  if (sharedTropes.length) dimensions.push({ label:'Erzähl-Stil', label_en:'Story Style', score: tropeScore, details: sharedTropes.slice(0, 2) });

  // Pacing compatibility
  const pacing1 = Object.entries(profile1.pacingStyles || {}).filter(([,w]) => w > 0);
  const pacing2 = Object.entries(profile2.pacingStyles || {}).filter(([,w]) => w > 0);
  const pacingNames1 = new Set(pacing1.map(([n]) => n.toLowerCase()));
  const pacingNames2 = new Set(pacing2.map(([n]) => n.toLowerCase()));
  const sharedPacing = [...pacingNames1].filter(p => pacingNames2.has(p));
  const pacingScore = Math.min(100, sharedPacing.length * 30 + 10);
  if (sharedPacing.length) dimensions.push({ label:'Tempo', label_en:'Pacing', score: pacingScore, details: sharedPacing.slice(0, 2) });

  // Divergence — what makes you different (interesting!)
  const only1 = [...genreNames1].filter(g => !genreNames2.has(g)).slice(0, 3);
  const only2 = [...genreNames2].filter(g => !genreNames1.has(g)).slice(0, 3);

  // Overall score
  const overall = dimensions.length
    ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
    : 20;

  // Find a shared pick
  const sharedGenresForPick = sharedGenres.length ? sharedGenres : [...genreNames1, ...genreNames2].slice(0, 2);

  return { overall, dimensions, only1, only2, sharedPickGenres: sharedGenresForPick };
}

/** Encode profile as a shareable base64 DNA string */
export function encodeDNA(profile) {
  const slim = {
    g: Object.entries(profile.genreWeights || {}).filter(([,w]) => w > 0).map(([n]) => n).slice(0, 10),
    t: Object.entries(profile.tropes || {}).filter(([,w]) => w > 0).map(([n]) => n).slice(0, 5),
    p: Object.entries(profile.pacingStyles || {}).filter(([,w]) => w > 0).map(([n]) => n).slice(0, 3),
    a: Object.entries(profile.aesthetics || {}).filter(([,w]) => w > 0).map(([n]) => n).slice(0, 3),
    s: profile.totalSwipes || 0,
    l: profile.likeRatio || 0,
  };
  try { return btoa(JSON.stringify(slim)); } catch { return ''; }
}

/** Decode a DNA string back to a profile */
export function decodeDNA(str) {
  try {
    const slim = JSON.parse(atob(str));
    const profile = {
      genreWeights: {}, tropes: {}, pacingStyles: {}, aesthetics: {},
      totalSwipes: slim.s || 0, likeRatio: slim.l || 0
    };
    (slim.g || []).forEach(n => { profile.genreWeights[n] = 3; });
    (slim.t || []).forEach(n => { profile.tropes[n] = 2; });
    (slim.p || []).forEach(n => { profile.pacingStyles[n] = 2; });
    (slim.a || []).forEach(n => { profile.aesthetics[n] = 2; });
    return profile;
  } catch { return null; }
}

/** Render the compatibility UI */
export function renderCompatibility(app, compatibility, profile1, profile2, sharedPick) {
  const de = app.lang === 'de';
  if (!compatibility) return `<div class="compat-view"><p>${de?'Keine Profildaten':'No profile data'}</p></div>`;

  const { overall, dimensions, only1, only2 } = compatibility;
  let emoji, label;
  if (overall >= 80) { emoji = '📚'; label = de ? 'Geschmacksverwandte' : 'Taste Twins'; }
  else if (overall >= 60) { emoji = '🤝'; label = de ? 'Gute Übereinstimmung' : 'Great Match'; }
  else if (overall >= 40) { emoji = '👋'; label = de ? 'Interessante Mischung' : 'Interesting Mix'; }
  else { emoji = '🤷'; label = de ? 'Gegensätze' : 'Opposites'; }

  let html = `<div class="compat-view">`;
  html += `<div class="compat-header">`;
  html += `<div class="compat-score-ring"><span class="compat-emoji">${emoji}</span><span class="compat-pct">${overall}%</span></div>`;
  html += `<h2>${label}</h2>`;
  html += `<p>${de ? 'Euer Geschmacks-Score' : 'Your Taste Match Score'}</p>`;
  html += `</div>`;

  // Dimensions
  if (dimensions.length) {
    html += `<div class="compat-dimensions">`;
    for (const d of dimensions) {
      html += `
        <div class="compat-dim">
          <div class="compat-dim-header">
            <span>${de ? d.label : d.label_en}</span>
            <span class="compat-dim-score">${d.score}%</span>
          </div>
          <div class="compat-dim-bar"><div class="compat-dim-fill" style="width:${d.score}%"></div></div>
          ${d.details?.length ? `<span class="compat-dim-details">${d.details.map(s => s.replace(/_/g, ' ')).join(', ')}</span>` : ''}
        </div>`;
    }
    html += `</div>`;
  }

  // Differences
  if (only1.length || only2.length) {
    html += `<div class="compat-divergence">`;
    html += `<h3>${de ? 'Eure Unterschiede' : 'Your Differences'}</h3>`;
    if (only1.length) html += `<p><strong>${de ? 'Du magst:' : 'You like:'}</strong> ${only1.map(s => s.replace(/_/g, ' ')).join(', ')}</p>`;
    if (only2.length) html += `<p><strong>${de ? 'Sie mögen:' : 'They like:'}</strong> ${only2.map(s => s.replace(/_/g, ' ')).join(', ')}</p>`;
    html += `</div>`;
  }

  // Shared pick
  if (sharedPick) {
    html += `
      <div class="compat-pick">
        <h3>🎯 ${de ? 'Euer gemeinsamer Pick' : 'Your Shared Pick'}</h3>
        <div class="compat-pick-card">
          <strong>${sharedPick.title}</strong>
          ${sharedPick.year ? `<span>${sharedPick.year}</span>` : ''}
          <p>${de ? 'Perfekt für euren nächsten Abend!' : 'Perfect for your next night in!'}</p>
        </div>
      </div>`;
  }

  // Share button
  const dna = encodeDNA(profile1);
  const url = `${window.location.origin}${window.location.pathname}?dna=${encodeURIComponent(dna)}`;
  html += `
    <div class="compat-share">
      <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${url.replace(/'/g, "\\'")}').then(()=>alert('${de?'Link kopiert!':'Link copied!'}'))">📋 ${de ? 'DNA-Link kopieren' : 'Copy DNA Link'}</button>
    </div>`;

  html += `</div>`;
  return html;
}
