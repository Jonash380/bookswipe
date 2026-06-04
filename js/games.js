export const GAME_GENRES = {
  de: [
    { id: 2, name: 'Action' },
    { id: 4, name: 'Gefechte' },
    { id: 5, name: 'Rätsel' },
    { id: 8, name: 'Digital Tabletop' },
    { id: 9, name: 'Rennspiel' },
    { id: 12, name: 'RPG' },
    { id: 13, name: 'Simulator' },
    { id: 14, name: 'Sport' },
    { id: 15, name: 'Strategie' },
    { id: 16, name: 'Turn-Based' },
    { id: 24, name: 'Action-Adventure' },
    { id: 25, name: 'Action-RPG' },
    { id: 31, name: 'Adventure' },
    { id: 33, name: 'Arcade' },
    { id: 35, name: 'Card Board Game' },
    { id: 36, name: 'Casual' },
    { id: 37, name: 'Indie' },
    { id: 39, name: 'Platformer' },
    { id: 41, name: 'Tactical RPG' },
    { id: 42, name: 'Quiz' }
  ],
  en: [
    { id: 2, name: 'Action' },
    { id: 4, name: 'Fighting' },
    { id: 5, name: 'Puzzle' },
    { id: 8, name: 'Digital Boardgame' },
    { id: 9, name: 'Racing' },
    { id: 12, name: 'Role Playing (RPG)' },
    { id: 13, name: 'Simulator' },
    { id: 14, name: 'Sport' },
    { id: 15, name: 'Strategy' },
    { id: 16, name: 'Turn-Based Strategy (TBS)' },
    { id: 24, name: 'Action-Adventure' },
    { id: 25, name: 'Role Playing (RPG)' },
    { id: 31, name: 'Adventure' },
    { id: 33, name: 'Arcade' },
    { id: 35, name: 'Card & Board Game' },
    { id: 36, name: 'Casual' },
    { id: 37, name: 'Indie' },
    { id: 39, name: 'Platformer' },
    { id: 41, name: 'Tactical RPG' },
    { id: 42, name: 'Quiz/Trivia' }
  ]
};

export const GAME_GENRE_NAME_MAP = {
  2: 'Action', 4: 'Fighting', 5: 'Puzzle', 8: 'Board Game', 9: 'Racing',
  12: 'RPG', 13: 'Simulator', 14: 'Sport', 15: 'Strategy', 16: 'Turn-Based',
  24: 'Action-Adventure', 25: 'Action RPG', 31: 'Adventure', 33: 'Arcade',
  35: 'Card Game', 36: 'Casual', 37: 'Indie', 39: 'Platformer',
  41: 'Tactical RPG', 42: 'Quiz'
};

export const GAME_MOODS = {
  de: [
    { id: 'epic', label: 'Episch' },
    { id: 'dark', label: 'Düster' },
    { id: 'relaxing', label: 'Entspannend' },
    { id: 'intense', label: 'Intensiv' },
    { id: 'funny', label: 'Lustig' },
    { id: 'atmospheric', label: 'Atmosphärisch' },
    { id: 'competitive', label: 'Kompetitiv' },
    { id: 'wholesome', label: 'Herzerwärmend' }
  ],
  en: [
    { id: 'epic', label: 'Epic' },
    { id: 'dark', label: 'Dark' },
    { id: 'relaxing', label: 'Relaxing' },
    { id: 'intense', label: 'Intense' },
    { id: 'funny', label: 'Funny' },
    { id: 'atmospheric', label: 'Atmospheric' },
    { id: 'competitive', label: 'Competitive' },
    { id: 'wholesome', label: 'Wholesome' }
  ]
};

export const GAME_MECHANICS = {
  de: [
    { id: 'open_world', label: 'Offene Welt' },
    { id: 'roguelike', label: 'Roguelike' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'base_building', label: 'Basismodifikation' },
    { id: 'stealth', label: 'Schleichen' },
    { id: 'platformer', label: 'Jump 'n' Run' },
    { id: 'puzzle', label: 'Rätsel' },
    { id: 'turn_based', label: 'Rundenbasiert' },
    { id: 'real_time', label: 'Echtzeit' },
    { id: 'exploration', label: 'Erkundung' },
    { id: 'survival', label: 'Überleben' },
    { id: 'deckbuilding', label: 'Deck Building' }
  ],
  en: [
    { id: 'open_world', label: 'Open World' },
    { id: 'roguelike', label: 'Roguelike' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'base_building', label: 'Base Building' },
    { id: 'stealth', label: 'Stealth' },
    { id: 'platformer', label: 'Platformer' },
    { id: 'puzzle', label: 'Puzzle-Solving' },
    { id: 'turn_based', label: 'Turn-Based' },
    { id: 'real_time', label: 'Real-Time' },
    { id: 'exploration', label: 'Exploration' },
    { id: 'survival', label: 'Survival' },
    { id: 'deckbuilding', label: 'Deck Building' }
  ]
};

export const GAME_PLATFORMS = [
  { id: 6, name: 'PC (Steam)', abbr: 'PC', icon: '💻', family: 'pc' },
  { id: 48, name: 'PlayStation 5', abbr: 'PS5', icon: '🎮', family: 'playstation' },
  { id: 8, name: 'PlayStation 4', abbr: 'PS4', icon: '🎮', family: 'playstation' },
  { id: 167, name: 'PlayStation 3', abbr: 'PS3', icon: '🎮', family: 'playstation' },
  { id: 49, name: 'Xbox Series X|S', abbr: 'XBX', icon: '🎮', family: 'xbox' },
  { id: 12, name: 'Xbox One', abbr: 'XB1', icon: '🎮', family: 'xbox' },
  { id: 11, name: 'Xbox 360', abbr: 'X360', icon: '🎮', family: 'xbox' },
  { id: 130, name: 'Nintendo Switch', abbr: 'NSW', icon: '🎮', family: 'nintendo' },
  { id: 37, name: 'Nintendo 3DS', abbr: '3DS', icon: '🎮', family: 'nintendo' },
  { id: 34, name: 'Android', abbr: 'AND', icon: '📱', family: 'mobile' },
  { id: 39, name: 'iOS', abbr: 'iOS', icon: '📱', family: 'mobile' }
];

export const PLATFORM_FAMILY_MAP = {
  pc: { name: 'PC', icon: '💻' },
  playstation: { name: 'PlayStation', icon: '🎮' },
  xbox: { name: 'Xbox', icon: '🎮' },
  nintendo: { name: 'Nintendo', icon: '🎮' },
  mobile: { name: 'Mobile', icon: '📱' }
};

export const GAME_PACING = {
  de: [
    { id: 'fast_paced', label: 'Schnell', icon: '⚡' },
    { id: 'slow_burn', label: 'Langsam', icon: '🐌' },
    { id: 'relaxed', label: 'Entspannt', icon: '🌊' },
    { id: 'intense', label: 'Intensiv', icon: '🔥' },
    { id: 'strategic', label: 'Strategisch', icon: '🧠' }
  ],
  en: [
    { id: 'fast_paced', label: 'Fast-Paced', icon: '⚡' },
    { id: 'slow_burn', label: 'Slow Burn', icon: '🐌' },
    { id: 'relaxed', label: 'Relaxed', icon: '🌊' },
    { id: 'intense', label: 'Intense', icon: '🔥' },
    { id: 'strategic', label: 'Strategic', icon: '🧠' }
  ]
};

export const PLAYTIME_RANGES = {
  quick: { label: 'Quick', icon: '⚡', min: 0, max: 5, color: '#2ECC71' },
  medium: { label: 'Medium', icon: '⏱️', min: 5, max: 20, color: '#F39C12' },
  long: { label: 'Long', icon: '📚', min: 20, max: 50, color: '#E67E22' },
  epic: { label: 'Epic', icon: '🏔️', min: 50, max: 999, color: '#9B59B6' }
};

export const MULTIPLAYER_TYPES = {
  single: { icon: '👤', label: 'Single-Player', color: '#95A5A6' },
  coop: { icon: '🌐', label: 'Co-op', color: '#3498DB' },
  pvp: { icon: '⚔️', label: 'PvP', color: '#E74C3C' },
  mmo: { icon: '🌍', label: 'MMO', color: '#9B59B6' }
};

export const GAME_STATUS = {
  de: [
    { id: 'playing', name: 'Gerade gespielt', icon: '▶️', color: '#2ECC71' },
    { id: 'completed', name: 'Geschafft', icon: '✅', color: '#27AE60' },
    { id: 'backlog', name: 'Backlog', icon: '📚', color: '#F39C12' },
    { id: 'wishlist', name: 'Wunschliste', icon: '💖', color: '#E74C3C' },
    { id: 'dropped', name: 'Abgebrochen', icon: '🚫', color: '#95A5A6' }
  ],
  en: [
    { id: 'playing', name: 'Currently Playing', icon: '▶️', color: '#2ECC71' },
    { id: 'completed', name: 'Completed', icon: '✅', color: '#27AE60' },
    { id: 'backlog', name: 'Backlog', icon: '📚', color: '#F39C12' },
    { id: 'wishlist', name: 'Wishlist', icon: '💖', color: '#E74C3C' },
    { id: 'dropped', name: 'Dropped', icon: '🚫', color: '#95A5A6' }
  ]
};

export const ICONIC_GAMES = [
  { id:'witcher3', name:'The Witcher 3: Wild Hunt', year:2015, genres:[12,2], rating:93, platforms:[6,8,49,130], playtime:51, tags:['Story-Rich','Fantasy','Open World'] },
  { id:'eldenring', name:'Elden Ring', year:2022, genres:[12,2], rating:96, platforms:[6,8,48,49], playtime:58, tags:['Difficult','Dark Fantasy','Exploration'] },
  { id:'zelda_totk', name:'The Legend of Zelda: Tears of the Kingdom', year:2023, genres:[24,31], rating:96, platforms:[130], playtime:59, tags:['Creative','Exploration','Puzzle'] },
  { id:'god_of_war', name:'God of War Ragnarök', year:2022, genres:[24], rating:94, platforms:[8,48,6], playtime:26, tags:['Story-Rich','Norse Mythology','Action'] },
  { id:'red_dead_2', name:'Red Dead Redemption 2', year:2018, genres:[24,2], rating:97, platforms:[6,8,49], playtime:49, tags:['Story-Rich','Open World','Atmospheric'] },
  { id:'hades', name:'Hades', year:2020, genres:[12,2,37], rating:93, platforms:[6,8,48,49,130], playtime:22, tags:['Roguelike','Greek Mythology','Fast-Paced'] },
  { id:'hollow_knight', name:'Hollow Knight', year:2017, genres:[39,37], rating:90, platforms:[6,8,49,130], playtime:27, tags:['Difficult','Metroidvania','Atmospheric'] },
  { id:'stardew_valley', name:'Stardew Valley', year:2016, genres:[12,13,37], rating:89, platforms:[6,8,49,130,39], playtime:52, tags:['Relaxing','Farming','Wholesome'] },
  { id:'celeste', name:'Celeste', year:2018, genres:[39,37], rating:94, platforms:[6,8,49,130], playtime:8, tags:['Difficult','Precision','Story-Rich'] },
  { id:'undertale', name:'Undertale', year:2015, genres:[12,37], rating:92, platforms:[6,8,130,49], playtime:7, tags:['Unique','Humorous','Emotional'] },
  { id:'valorant', name:'VALORANT', year:2020, genres:[2], rating:80, platforms:[6], playtime:0, tags:['Competitive','Team-Based','FPS'] },
  { id:'minecraft', name:'Minecraft', year:2011, genres:[13,36], rating:93, platforms:[6,8,49,130,39], playtime:150, tags:['Creative','Open-Ended','Multiplayer'] },
  { id:'last_of_us', name:'The Last of Us', year:2013, genres:[24,2], rating:95, platforms:[8,48,6], playtime:15, tags:['Story-Rich','Emotional','Survival'] },
  { id:'disco_elysium', name:'Disco Elysium', year:2019, genres:[12,37], rating:97, platforms:[6,8,48,49,130], playtime:25, tags:['Story-Rich','Choices Matter','Detective'] },
  { id:'portal_2', name:'Portal 2', year:2011, genres:[5,2], rating:95, platforms:[6], playtime:8, tags:['Clever','Humorous','Co-op'] },
  { id:'baldurs_gate_3', name:'Baldur\'s Gate 3', year:2023, genres:[12,16], rating:96, platforms:[6,48], playtime:60, tags:['Story-Rich','Choices Matter','Fantasy'] },
  { id:'monster_hunter', name:'Monster Hunter: World', year:2018, genres:[2,12], rating:90, platforms:[6,8,49], playtime:48, tags:['Co-op','Crafting','Action'] },
  { id:'animal_crossing', name:'Animal Crossing: New Horizons', year:2020, genres:[13,36], rating:90, platforms:[130], playtime:100, tags:['Relaxing','Creative','Wholesome'] },
  { id:'dark_souls', name:'Dark Souls', year:2011, genres:[12,2], rating:89, platforms:[6,8,49], playtime:42, tags:['Difficult','Dark Fantasy','Exploration'] },
  { id:'gta5', name:'Grand Theft Auto V', year:2013, genres:[24,2], rating:97, platforms:[6,8,49], playtime:32, tags:['Open World','Action','Story-Rich'] }
];

export const GAME_SEARCH = {
  action: ['action', 'shooter', 'combat', 'fight'],
  rpg: ['rpg', 'role playing', 'fantasy', 'adventure'],
  strategy: ['strategy', 'tactical', 'turn-based', 'rts'],
  indie: ['indie', 'pixel art', 'retro', 'experimental'],
  puzzle: ['puzzle', 'brain teaser', 'logic', 'casual'],
  simulation: ['simulation', 'building', 'management', 'farming'],
  horror: ['horror', 'survival horror', 'scary', 'psychological'],
  platformer: ['platformer', 'metroidvania', '2d', 'precision'],
  racing: ['racing', 'arcade racing', 'simulation racing', 'kart'],
  sports: ['sports', 'football', 'basketball', 'soccer']
};
