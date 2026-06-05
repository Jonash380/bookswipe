/**
 * BookSwipe "Roast My Taste"
 * Rule-based humor generator that roasts the user's media preferences.
 * Uses the recommender profile to generate personalized, shareable roasts.
 */

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const ROAST_TEMPLATES_DE = {
  overGenre: [
    'Du hast {count} {genre}-Titel gemocht. Ist das noch ein Geschmack oder schon ein Hilferuf?',
    '{count} Mal {genre}. Wir müssen reden.',
    'Deine {genre}-Obsession hat jetzt offiziell {count} Opfer. Stolz?',
    '"{genre}" — sag einfach, du hast Angst vor Neuem.',
    '{count}x {genre}. Dein Netflix-Algorithmus weint leise.',
  ],
  era: [
    'Alles vor {year}? Lebst du in einer Zeitkapsel?',
    'Deine Timeline endet {year}. Es gibt auch Filme nach der Jahrtausendwende.',
    'Wenn {year} das Neueste ist, was du magst... soll ich dir von "Farbfilm" erzählen?',
  ],
  ratio: [
    'Like-Rate: {pct}%. Du bist der Türsteher von Berghain — nur in langweilig.',
    '{pct}% Like-Rate? Selbst deine Mutter liked mehr.',
    'Nur {pct}% gefällt dir? Du bist der schwierigste Mensch seit... immer.',
  ],
  antiTaste: [
    'Du hast {count} Mal "{genre}" abgelehnt. Was hat {genre} dir je getan?',
    'Dein Hass auf {genre} ist beeindruckend. Fast schon Kunst.',
    '{genre} hat bei dir Hausverbot. Hart, aber irgendwie auch süß.',
  ],
  wildcard: [
    'Du hast {count} Mal Wildcards gemocht. Du magst Überraschungen — außer beim Essen vermutlich.',
    '{count} Wildcards! Wenigstens EINE Sache, bei der du nicht langweilig bist.',
  ],
  closing: [
    'Fazit: Dein Geschmack ist wie ein IKEA-Regal — zusammenwürfelt, aber irgendwie funktioniert es.',
    'Dein Media-Profil: Ein Moodboard einer existentiellen Krise.',
    'Wir haben deinen Geschmack analysiert. Die Wissenschaft ist ratlos.',
    'Dein Geschmackspilz: selten, eigenartig, und irgendwie bewundernswert.',
  ]
};

const ROAST_TEMPLATES_EN = {
  overGenre: [
    'You liked {count} {genre} titles. Is this a preference or a cry for help?',
    '{count} times {genre}. We need to talk.',
    'Your {genre} obsession has claimed {count} victims. Proud?',
    '"{genre}" — just say you\'re afraid of trying new things.',
    '{count}x {genre}. Your Netflix algorithm is quietly weeping.',
  ],
  era: [
    'Nothing after {year}? Do you live in a time capsule?',
    'Your timeline stops at {year}. Movies existed after the millennium, you know.',
    'If {year} is your newest pick... should I explain what "streaming" is?',
  ],
  ratio: [
    'Like rate: {pct}%. You are the bouncer of Berghain — but for boring reasons.',
    '{pct}% like rate? Even your mom likes more things than you.',
    'Only {pct}% gets your approval? You are the pickiest person since... ever.',
  ],
  antiTaste: [
    'You noped {genre} {count} times. What did {genre} ever do to you?',
    'Your hatred for {genre} is impressive. Almost an art form.',
    '{genre} is permanently banned from your feed. Harsh, but also adorable.',
  ],
  wildcard: [
    'You liked {count} wildcards. You enjoy surprises — except probably at restaurants.',
    '{count} wildcards! At least ONE thing where you\'re not boring.',
  ],
  closing: [
    'Verdict: Your taste is like IKEA furniture — cobbled together, but somehow it works.',
    'Your media profile: A mood board of an existential crisis.',
    'We analyzed your taste. Science is baffled.',
    'Your taste mushroom: rare, peculiar, and somehow admirable.',
  ]
};

export function generateRoast(profile, _strengths, de = false) {
  const T = de ? ROAST_TEMPLATES_DE : ROAST_TEMPLATES_EN;
  const roasts = [];

  // 1. Over-represented genre
  const topGenres = Object.entries(profile.genreWeights || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topGenres.length && topGenres[0][1] > 1) {
    const [genre, count] = topGenres[0];
    roasts.push(pick(T.overGenre).replace('{genre}', genre).replace('{count}', Math.round(count)));
  }

  // 2. Like ratio roast
  const ratio = profile.likeRatio || 0;
  if (ratio < 0.2) {
    roasts.push(pick(T.ratio).replace('{pct}', Math.round(ratio * 100)));
  }

  // 3. Anti-taste roast
  const worstGenres = Object.entries(profile.genreWeights || {})
    .filter(([,w]) => w < -1)
    .sort((a, b) => a[1] - b[1]);
  if (worstGenres.length) {
    const [genre, count] = worstGenres[0];
    roasts.push(pick(T.antiTaste).replace('{genre}', genre).replace('{count}', Math.abs(Math.round(count))));
  }

  // 4. Wildcard roast
  const wildcardCount = profile.wildcard_likes || 0;
  if (wildcardCount > 5) {
    roasts.push(pick(T.wildcard).replace('{count}', wildcardCount));
  }

  // 5. Closing line
  roasts.push(pick(T.closing));

  return roasts;
}

/** Render the roast UI */
export function renderRoast(app, roastLines, profile) {
  const de = app.lang === 'de';
  const totalSwipes = profile.totalSwipes || 0;
  const topGenres = Object.entries(profile.genreWeights || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n);

  let html = `<div class="roast-view">`;
  html += `<div class="roast-header">`;
  html += `<span class="roast-icon">📖</span>`;
  html += `<h2>${de ? 'Roast My Taste' : 'Roast My Taste'}</h2>`;
  html += `<p>${de ? 'Basierend auf deinen' : 'Based on your'} ${totalSwipes} ${de ? 'Stoeberaktionen' : 'browses'}</p>`;
  html += `</div>`;

  html += `<div class="roast-cards">`;
  for (let i = 0; i < roastLines.length; i++) {
    html += `<div class="roast-card" style="animation-delay:${i * 0.3}s">`;
    html += `<p>${roastLines[i]}</p>`;
    html += `</div>`;
  }
  html += `</div>`;

  // Stats footer
  html += `
    <div class="roast-footer">
      <div class="roast-stat"><span>${topGenres.slice(0,2).join(', ') || '—'}</span><small>${de?'Top-Genres':'Top Genres'}</small></div>
      <div class="roast-stat"><span>${Math.round((profile.likeRatio||0)*100)}%</span><small>${de?'Speicherquote':'Save Rate'}</small></div>
      <div class="roast-stat"><span>${totalSwipes}</span><small>${de?'Stoeberaktionen':'Browses'}</small></div>
    </div>
  `;

  html += `
    <button class="btn btn-primary roast-share" onclick="navigator.clipboard.writeText('${Array.from(document.querySelectorAll('.roast-card p')).map(p=>p.textContent).join('\\n').replace(/'/g,"\\'")}')">📋 ${de?'Roast kopieren':'Copy Roast'}</button>`;

  html += `</div>`;
  return html;
}
