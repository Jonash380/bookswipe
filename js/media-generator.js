/**
 * BookSwipe Media Generator
 * AI-powered media idea generator that invents movies/books/games
 * based on your taste DNA. Falls back to rule-based generation.
 */

const DE_TITLES_A = ['Das', 'Die', 'Der', 'Im', 'Am', 'Von', 'Bis', 'Durch', 'Hinter', 'Unter'];
const DE_TITLES_B = ['letzte', 'erste', 'verborgene', 'geheime', 'stille', 'tiefe', 'wilde', 'goldene'];
const DE_TITLES_C = ['Schatten', 'Lied', 'Garten', 'Fluss', 'Zeit', 'Stadt', 'Wald', 'Meer', 'Himmel', 'Traum', 'König', 'Weg'];
const EN_TITLES_A = ['The', 'A', 'Beyond', 'Into', 'Under', 'After', 'Before', 'Through'];
const EN_TITLES_B = ['Last', 'Hidden', 'Silent', 'Deep', 'Golden', 'Forgotten', 'Final', 'Eternal'];
const EN_TITLES_C = ['Shadow', 'Echo', 'Garden', 'River', 'City', 'Forest', 'Dream', 'King', 'Way', 'Horizon', 'Mountain'];

const LOGLINES_DE = [
  'In einer Welt, in der {element} verboten ist, entdeckt {name} ein {adj} Geheimnis, das alles verändert.',
  '{name} ist die letzte Person, die {element} beherrscht — und die Einzige, die {danger} aufhalten kann.',
  'Als {name} {discovery} entdeckt, beginnt ein Wettlauf gegen die Zeit — mit {adj} Konsequenzen.',
  'Zwei Fremde, ein gemeinsames Ziel: {element} zurückzuholen, bevor {danger} alles zerstört.',
  'Niemand glaubt {name}, als sie {discovery} findet. Aber sie hat nur 48 Stunden, um es zu beweisen.',
  'Ein {adj} Detektiv, ein {adj} Fall, und eine Wahrheit, die lieber verborgen bleiben sollte.',
  '{name} hat {number} Tage, um {element} zu meistern — oder {danger} gewinnt für immer.',
  'Ein {adj} Podcast, ein {adj} Geheimnis, und eine Stadt, die mehr verbirgt, als sie zeigt.',
];

const LOGLINES_EN = [
  'In a world where {element} is forbidden, {name} discovers a {adj} secret that changes everything.',
  '{name} is the last person who can control {element} — and the only one who can stop {danger}.',
  'When {name} discovers {discovery}, a race against time begins — with {adj} consequences.',
  'Two strangers, one mission: retrieve {element} before {danger} destroys everything.',
  'No one believes {name} when she finds {discovery}. But she has 48 hours to prove it.',
  'A {adj} detective, a {adj} case, and a truth best left buried.',
  '{name} has {number} days to master {element} — or {danger} wins forever.',
  'A {adj} podcast, a {adj} mystery, and a city that hides more than it shows.',
];

const ELEMENTS_DE = ['Erinnerung', 'Magie', 'Zeit', 'Musik', 'Farbe', 'Schweigen', 'Wahrheit', 'Sprache', 'Licht', 'Schatten'];
const ELEMENTS_EN = ['memory', 'magic', 'time', 'music', 'color', 'silence', 'truth', 'language', 'light', 'shadow'];
const ADJ_DE = ['dunkel', 'hell', 'verborgen', 'gefährlich', 'magisch', 'unheimlich', 'schön', 'alt', 'neu', 'seltsam'];
const ADJ_EN = ['dark', 'bright', 'hidden', 'dangerous', 'magical', 'eerie', 'beautiful', 'ancient', 'strange', 'new'];
const DANGER_DE = ['die Dunkelheit', 'der Sturm', 'die Maschine', 'der Feind', 'die Zeit', 'das Vergessen'];
const DANGER_EN = ['the darkness', 'the storm', 'the machine', 'the enemy', 'time itself', 'oblivion'];
const DISCOVERY_DE = ['einen verborgenen Brief', 'ein altes Artefakt', 'eine geheime Tür', 'eine rätselhafte Nachricht', 'ein verschollenes Manuskript'];
const DISCOVERY_EN = ['a hidden letter', 'an ancient artifact', 'a secret door', 'a cryptic message', 'a lost manuscript'];
const NAMES = ['Mara','Kai','Lena','Finn','Nova','Ezra','Iris','Juno','Theo','Zara','Rune','Aria'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTitle(de, seed) {
  const a = de ? pick(DE_TITLES_A) : pick(EN_TITLES_A);
  const b = de ? pick(DE_TITLES_B) : pick(EN_TITLES_B);
  const c = de ? pick(DE_TITLES_C) : pick(EN_TITLES_C);
  const patterns = [
    () => `${a} ${b} ${c}`,
    () => `${a} ${c}`,
    () => `${c} ${pick(NAMES)}`,
    () => `${pick(NAMES)} & ${a} ${c}`,
  ];
  return pick(patterns)();
}

function generateLogline(de, profile) {
  const topGenre = Object.entries(profile.genreWeights || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  const msg = de ? pick(LOGLINES_DE) : pick(LOGLINES_EN);
  return msg
    .replace('{name}', pick(NAMES))
    .replace('{element}', de ? pick(ELEMENTS_DE) : pick(ELEMENTS_EN))
    .replace('{adj}', de ? pick(ADJ_DE) : pick(ADJ_EN))
    .replace('{danger}', de ? pick(DANGER_DE) : pick(DANGER_EN))
    .replace('{discovery}', de ? pick(DISCOVERY_DE) : pick(DISCOVERY_EN))
    .replace('{number}', String(Math.floor(Math.random() * 90 + 10)));
}

function generateCast(de) {
  const names = ['Sarah Chen','Marco Vega','Idris Okafor','Lena Bergström','Yuki Tanaka',
    'Ahmed Hassan','Clara Nowak','Thomas Roux','Nia Diallo','Javier Morales'].slice();
  // Shuffle
  for (let i = names.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [names[i],names[j]]=[names[j],names[i]]; }
  return names.slice(0, 3).join(', ');
}

function generateMoodTags(profile, de) {
  const moods = de
    ? ['Düster','Hoffnungsvoll','Rätselhaft','Intim','Episch','Verspielt','Melancholisch','Aufregend']
    : ['Dark','Hopeful','Mysterious','Intimate','Epic','Playful','Melancholic','Thrilling'];
  return pick(moods) + ' · ' + pick(moods);
}

function generateWhyText(profile, de) {
  const topGenres = Object.entries(profile.genreWeights || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n])=>n);
  if (topGenres.length) {
    return de
      ? `Erfunden auf Basis deiner Liebe für ${topGenres.slice(0,2).join(', ')} — mit einer Prise ${topGenres[2] || 'Überraschung'}.`
      : `Invented from your love of ${topGenres.slice(0,2).join(', ')} — with a dash of ${topGenres[2] || 'surprise'}.`;
  }
  return de ? 'Massgeschneidert für deinen einzigartigen Geschmack.' : 'Tailored to your unique taste.';
}

export function generateMedia(profile, de = false, type = null) {
  const types = type ? [type] : ['movie', 'book', 'game'];
  const pickedType = pick(types);
  const typeIcons = { movie:'🎬', book:'📚', game:'🎮' };
  const typeLabels = { movie: de?'Film':'Movie', book: de?'Buch':'Book', game: de?'Spiel':'Game' };

  const seed = Math.random();
  const title = generateTitle(de, seed);
  const logline = generateLogline(de, profile);
  const cast = pickedType === 'movie' ? generateCast(de) : (pickedType === 'book' ? '—' : generateCast(de));
  const moodTags = generateMoodTags(profile, de);
  const why = generateWhyText(profile, de);

  // Generate a fake year
  const year = 2025 + Math.floor(Math.random() * 5);

  // Generate a fake rating
  const rating = (3.5 + Math.random() * 1.5).toFixed(1);

  return {
    title, logline, type: pickedType, typeLabel: typeLabels[pickedType],
    typeIcon: typeIcons[pickedType], cast, moodTags, why, year, rating,
  };
}

/** Render the media generator UI */
export function renderMediaGenerator(app, generated) {
  const de = app.lang === 'de';

  let html = `<div class="generator-view">`;
  html += `<div class="generator-header">`;
  html += `<span class="generator-icon">🤖</span>`;
  html += `<h2>${de ? 'Media-Generator' : 'Media Generator'}</h2>`;
  html += `<p>${de ? 'KI-erfundene Titel, basierend auf deinem Geschmack' : 'AI-invented titles based on your taste'}</p>`;
  html += `</div>`;

  if (generated) {
    html += `
      <div class="generator-card">
        <div class="generator-card-type">${generated.typeIcon} ${generated.typeLabel}</div>
        <div class="generator-card-poster">
          <div class="gen-poster-placeholder">${generated.typeIcon}</div>
          <div class="gen-poster-title">${generated.title}</div>
        </div>
        <div class="generator-card-info">
          <h3>${generated.title}</h3>
          <span class="gen-year">${generated.year}</span>
          <span class="gen-rating">⭐ ${generated.rating}</span>
          <p class="gen-logline">${generated.logline}</p>
          ${generated.cast !== '—' ? `<p class="gen-cast">🎭 ${generated.cast}</p>` : ''}
          <div class="gen-tags"><span class="gen-tag">${generated.moodTags}</span></div>
          <p class="gen-why">✨ ${generated.why}</p>
        </div>
      </div>
      <div class="generator-vote">
        <p>${de ? 'Sollte das echt sein?' : 'Should this be real?'}</p>
        <button class="btn btn-like" data-action="gen-like">👍</button>
        <button class="btn btn-nope" data-action="gen-nope">👎</button>
      </div>`;
  } else {
    html += `
      <div class="generator-empty">
        <p>${de ? 'Bereit für eine Überraschung? Generiere einen erfundenen Titel, der perfekt zu deinem Geschmack passt.' : 'Ready for a surprise? Generate an invented title that perfectly matches your taste.'}</p>
      </div>`;
  }

  html += `
    <div class="generator-types">
      <button class="btn gen-type-btn" data-gen-type="movie">🎬 ${de ? 'Film' : 'Movie'}</button>
      <button class="btn gen-type-btn" data-gen-type="book">📚 ${de ? 'Buch' : 'Book'}</button>
      <button class="btn gen-type-btn" data-gen-type="game">🎮 ${de ? 'Spiel' : 'Game'}</button>
      <button class="btn gen-type-btn active" data-gen-type="any">🎲 ${de ? 'Egal' : 'Any'}</button>
    </div>`;

  html += `</div>`;
  return html;
}
