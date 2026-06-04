import { TMDB_GENRE_MAP } from './utils.js';

const TROPE_DB = {
  chosen_one: ['chosen one','prophecy','destiny','hero','savior','one'],
  fish_out_of_water: ['fish out of water','stranger','newcomer','outsider','alien','world'],
  redemption_arc: ['redemption','forgiveness','second chance','atone','guilt','赎'],
  mentor_streak: ['mentor','teacher','guide','master','training','learn'],
  revenge: ['revenge','vengeance','retribution','payback','justice'],
  survival: ['survival','survive','last stand','endure','escape','trapped'],
  love_triangle: ['love triangle','rival','jealousy','competition','heart'],
  underdog: ['underdog','outmatched','unlikely hero','amateur','rookie'],
  sacrifice: ['sacrifice','noble death','last breath','giving up','noble'],
  betrayal: ['betrayal','traitor','double cross','backstab','deception'],
  found_family: ['found family','team','crew','band','misfits','together'],
  time_loop: ['time loop','repeat','groundhog','again','stuck','cycle'],
  mystery_box: ['mystery','secret','hidden','puzzle','clue','unknown'],
  forbidden_love: ['forbidden','taboo','secret relationship','impossible love'],
  coming_of_age: ['coming of age','growing up','teen','adolescent','puberty','youth']
};

const PACING_DB = {
  slow_burn: ['slow burn','atmospheric','meditative','quiet','contemplative','patient'],
  relentless: ['relentless','nonstop','non-stop','intense','high octane','breathless'],
  twisty: ['twist','surprise','turn','revelation','shocking','unexpected'],
  episodic: ['episodic','anthology','episodes','weekly','standalone'],
  slow_start: ['slow start','builds slowly','picks up','gradual','patience'],
  roller_coaster: ['roller coaster','ups and downs','emotional ride','turbulent'],
  meditative: ['meditative','contemplative','philosophical','introspective','thoughtful'],
  ticking_clock: ['ticking clock','countdown','deadline','race against time','urgent'],
  non_linear: ['non-linear','fragmented','flashback','parallel','interwoven']
};

const AESTHETIC_DB = {
  neon_noir: ['neon','noir','cyberpunk','dark','neon lit','rain soaked'],
  cottagecore: ['cottage','pastoral','rural','nature','cozy','homey'],
  minimalist: ['minimalist','sparse','clean','bare','simple','empty'],
  baroque: ['ornate','lavish','opulent','grand','elaborate','luxurious'],
  lo_fi: ['lo-fi','gritty','raw','authentic','handheld','documentary'],
  pastel_dream: ['pastel','soft','gentle','dreamy','ethereal','light'],
  brutalist: ['brutal','harsh','raw','industrial','concrete','steel'],
  retro_wave: ['retro','synth','80s','vintage','nostalgic','neon'],
  fairy_tale: ['fairy tale','magical','enchanted','mythic','whimsical'],
  gritty_realism: ['gritty','realistic','grounded','authentic','street'],
  high_contrast: ['high contrast','shadow','chiaroscuro','dramatic lighting']
};

const WARNING_DB = {
  gore: ['gore','bloody','graphic violence','brutal','mutilation','torture'],
  jump_scare: ['jump scare','startling','louder','sudden','shock'],
  animal_harm: ['animal death','animal cruelty','dog dies','horse'],
  child_endangerment: ['child in danger','kidnapping','child abuse','missing child'],
  sexual_violence: ['sexual assault','rape','sexual violence','abuse'],
  self_harm: ['self-harm','suicide','cutting','depression','mental illness'],
  body_horror: ['body horror','mutation','transformation','grotesque','disturbing'],
  psychological: ['psychological','disturbing','unsettling','creepy','uncomfortable'],
  intense_themes: ['intense','heavy','difficult','hard to watch','emotionally draining'],
  substance_abuse: ['drug','alcohol','substance','addiction','overdose'],
  animal_death: ['animal dies','dog dies','pet death','animal'],
  graphic_death: ['graphic death','dying','death scene','violent death']
};

export function mapTMDBTags(genres, keywords = []) {
  const tags = new Set();
  if (genres) {
    genres.forEach(g => {
      const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g.id] || g.name || '').toLowerCase();
      if (/horror|thriller/.test(name)) tags.add('dark');
      if (/comedy/.test(name)) tags.add('funny');
      if (/romance/.test(name)) tags.add('romantic');
      if (/animation/.test(name)) tags.add('cozy');
      if (/drama/.test(name)) tags.add('cerebral');
    });
  }
  keywords.forEach(kw => {
    const low = (kw.name || kw).toLowerCase();
    Object.entries(TAG_DB).forEach(([tag, words]) => {
      if (words.some(w => low.includes(w))) tags.add(tag);
    });
  });
  return [...tags];
}

const TAG_DB = {
  dark:['violence','murder','death','dark','thriller','horror','scary','suspense','crime','noir','gore','torture','kidnapping','trauma'],
  cozy:['cozy','family','friendship','warm','gentle','comfort','home','holiday','small town','slice of life','wholesome'],
  epic:['epic','war','battle','kingdom','empire','hero','journey','quest','destiny','saga','legend'],
  funny:['comedy','funny','humor','laugh','slapstick','satire','parody','absurd','hilarious','witty'],
  romantic:['romance','love','wedding','kiss','relationship','date','couple','heart','passion','flirt'],
  cerebral:['mind','philosophy','puzzle','twist','complex','intellectual','time','reality','simulation','mystery'],
  'feel-good':['inspirational','uplifting','hope','redemption','triumph','happy ending','motivational','feel good','feel-good'],
  dark_comedy:['dark comedy','dark humor','black comedy','absurd','satire','irony','sardonic']
};

export function mapMediaDNA(genres, overview = '', title = '') {
  const text = `${title} ${overview}`.toLowerCase();
  const tropes = [];
  const pacing = [];
  const aesthetic = [];
  const warnings = [];

  Object.entries(TROPE_DB).forEach(([key, words]) => {
    if (words.some(w => text.includes(w))) tropes.push(key);
  });

  Object.entries(PACING_DB).forEach(([key, words]) => {
    if (words.some(w => text.includes(w))) pacing.push(key);
  });

  Object.entries(AESTHETIC_DB).forEach(([key, words]) => {
    if (words.some(w => text.includes(w))) aesthetic.push(key);
  });

  Object.entries(WARNING_DB).forEach(([key, words]) => {
    if (words.some(w => text.includes(w))) warnings.push(key);
  });

  if (genres) {
    genres.forEach(g => {
      const id = typeof g === 'number' ? g : g.id || g;
      const name = (TMDB_GENRE_MAP[id] || '').toLowerCase();
      if (/horror|thriller/.test(name) && !warnings.includes('intense_themes')) warnings.push('intense_themes');
      if (/animation|family/.test(name)) { if (!tropes.includes('coming_of_age')) tropes.push('coming_of_age'); }
      if (/action|adventure/.test(name) && !pacing.includes('relentless')) pacing.push('relentless');
      if (/sci-fi/.test(name) && !aesthetic.includes('neon_noir')) aesthetic.push('neon_noir');
      if (/romance/.test(name) && !tropes.includes('forbidden_love')) tropes.push('forbidden_love');
    });
  }

  return {
    tropes: tropes.slice(0, 4),
    pacing: pacing.slice(0, 3),
    aesthetic: aesthetic.slice(0, 3),
    warnings: warnings.slice(0, 3)
  };
}

export function computeVibeScores(tags) {
  const vibes = {};
  tags.forEach(t => { vibes[t] = (vibes[t] || 0) + 1; });
  return vibes;
}

export function mapGameTags(game) {
  const tags = new Set();
  const genres = (game.genres || []).map(g => (typeof g === 'string' ? g : g.name || '')).join(' ').toLowerCase();
  const themes = (game.themes || []).map(t => (typeof t === 'string' ? t : t.name || '')).join(' ').toLowerCase();
  const modes = (game.modes || []).map(m => (typeof m === 'string' ? m : m.name || '')).join(' ').toLowerCase();
  const overview = (game.overview || '').toLowerCase();

  if (/rpg|role.playing|jrpg|wrpg|action.rpg/.test(genres)) tags.add('epic');
  if (/horror|survival.horror/.test(genres)) tags.add('dark');
  if (/puzzle|casual|indie/.test(genres)) tags.add('cerebral');
  if (/racing|sport/.test(genres)) tags.add('intense');
  if (/simulation|farming|building/.test(genres)) tags.add('cozy');
  if (/strategy|tactical/.test(genres)) tags.add('cerebral');
  if (/platformer|action/.test(genres)) tags.add('intense');
  if (/adventure|open.world/.test(genres)) tags.add('epic');

  if (/fantasy|magic|medieval/.test(themes)) tags.add('epic');
  if (/horror|dark|survival/.test(themes)) tags.add('dark');
  if (/sci.fi|cyber|future/.test(themes)) tags.add('cerebral');
  if (/love|romance/.test(themes)) tags.add('romantic');
  if (/humor|comedy|funny/.test(themes)) tags.add('funny');

  if (/multi|co.op|mmo/.test(modes)) tags.add('competitive');
  if (/single/.test(modes)) tags.add('cerebral');

  if (/relax|calm|peace|wholesome/.test(overview)) tags.add('cozy');
  if (/dark|grim|brutal|difficult/.test(overview)) tags.add('dark');
  if (/epic|legend|quest|journey/.test(overview)) tags.add('epic');
  if (/funny|hilarious|comedy|laugh/.test(overview)) tags.add('funny');
  if (/atmospheric|immersive|stunning|beautiful/.test(overview)) tags.add('atmospheric');
  if (/relax|chill|calm|soothing/.test(overview)) tags.add('relaxing');
  if (/intense|fast.paced|action|combat/.test(overview)) tags.add('intense');
  if (/strategic|tactical|planning/.test(overview)) tags.add('strategic');

  return [...tags];
}

export function getTagPillColor(tag) {
  if (TROPE_DB[tag]) return '#6c63ff';
  if (PACING_DB[tag]) return '#4ecdc4';
  if (AESTHETIC_DB[tag]) return '#ff6b6b';
  if (WARNING_DB[tag]) return '#ef4444';
  return '#888';
}

export function getWarningSummary(warnings) {
  if (!warnings.length) return null;
  const labels = {
    gore: 'Graphic Violence', jump_scare: 'Jump Scares', animal_harm: 'Animal Harm',
    child_endangerment: 'Child in Danger', sexual_violence: 'Sexual Violence',
    self_harm: 'Self-Harm', body_horror: 'Body Horror', psychological: 'Psychological',
    intense_themes: 'Intense Themes', substance_abuse: 'Substance Abuse',
    animal_death: 'Animal Death', graphic_death: 'Graphic Death'
  };
  return warnings.map(w => labels[w] || w);
}
