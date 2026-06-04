export const GAME_GENRES = {
  de: [
    { id: 2, name: 'Action' },
    { id: 4, name: 'Kampf' },
    { id: 5, name: 'Rätsel' },
    { id: 8, name: 'Digital Brettspiel' },
    { id: 9, name: 'Rennspiel' },
    { id: 12, name: 'RPG' },
    { id: 13, name: 'Simulation' },
    { id: 14, name: 'Sport' },
    { id: 15, name: 'Strategie' },
    { id: 16, name: 'Rundenbasiert' },
    { id: 24, name: 'Action-Adventure' },
    { id: 25, name: 'Action-RPG' },
    { id: 31, name: 'Adventure' },
    { id: 33, name: 'Arcade' },
    { id: 35, name: 'Kartenspiel' },
    { id: 36, name: 'Casual' },
    { id: 37, name: 'Indie' },
    { id: 39, name: "Jump 'n' Run" },
    { id: 41, name: 'Taktik-RPG' },
    { id: 42, name: 'Quiz' },
    { id: 43, name: 'Gelegenheitsspiel' },
    { id: 44, name: 'Visual Novel' },
    { id: 45, name: 'Roguelike' },
    { id: 46, name: 'Souls-like' },
    { id: 47, name: 'Metroidvania' },
    { id: 48, name: 'Battle Royale' },
    { id: 49, name: 'Auto Battler' },
    { id: 50, name: 'Extraction Shooter' }
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
    { id: 25, name: 'Action RPG' },
    { id: 31, name: 'Adventure' },
    { id: 33, name: 'Arcade' },
    { id: 35, name: 'Card Game' },
    { id: 36, name: 'Casual' },
    { id: 37, name: 'Indie' },
    { id: 39, name: 'Platformer' },
    { id: 41, name: 'Tactical RPG' },
    { id: 42, name: 'Quiz/Trivia' },
    { id: 43, name: 'Board Game' },
    { id: 44, name: 'Visual Novel' },
    { id: 45, name: 'Roguelike' },
    { id: 46, name: 'Souls-like' },
    { id: 47, name: 'Metroidvania' },
    { id: 48, name: 'Battle Royale' },
    { id: 49, name: 'Auto Battler' },
    { id: 50, name: 'Extraction Shooter' }
  ]
};

export const GAME_GENRE_NAME_MAP = {
  2: 'Action', 4: 'Fighting', 5: 'Puzzle', 8: 'Board Game', 9: 'Racing',
  12: 'RPG', 13: 'Simulator', 14: 'Sport', 15: 'Strategy', 16: 'Turn-Based',
  24: 'Action-Adventure', 25: 'Action RPG', 31: 'Adventure', 33: 'Arcade',
  35: 'Card Game', 36: 'Casual', 37: 'Indie', 39: 'Platformer',
  41: 'Tactical RPG', 42: 'Quiz', 43: 'Board Game', 44: 'Visual Novel',
  45: 'Roguelike', 46: 'Souls-like', 47: 'Metroidvania', 48: 'Battle Royale',
  49: 'Auto Battler', 50: 'Extraction Shooter'
};

export const GAME_MOODS = {
  de: [
    { id: 'epic', label: 'Episch', icon: '🏔️' },
    { id: 'dark', label: 'Düster', icon: '🌑' },
    { id: 'relaxing', label: 'Entspannend', icon: '🌊' },
    { id: 'intense', label: 'Intensiv', icon: '🔥' },
    { id: 'funny', label: 'Lustig', icon: '😂' },
    { id: 'atmospheric', label: 'Atmosphärisch', icon: '🌫️' },
    { id: 'competitive', label: 'Kompetitiv', icon: '🏆' },
    { id: 'wholesome', label: 'Herzerwärmend', icon: '💚' },
    { id: 'nostalgic', label: 'Nostalgie', icon: '📼' },
    { id: 'cozy', label: 'Gemütlich', icon: '☕' },
    { id: 'melancholic', label: 'Melancholisch', icon: '🍂' },
    { id: 'chaotic', label: 'Chaotisch', icon: '🌪️' },
    { id: 'mysterious', label: 'Mysteriös', icon: '🔮' },
    { id: 'empowering', label: 'Stärkend', icon: '💪' },
    { id: 'surreal', label: 'Surreal', icon: '🌀' }
  ],
  en: [
    { id: 'epic', label: 'Epic', icon: '🏔️' },
    { id: 'dark', label: 'Dark', icon: '🌑' },
    { id: 'relaxing', label: 'Relaxing', icon: '🌊' },
    { id: 'intense', label: 'Intense', icon: '🔥' },
    { id: 'funny', label: 'Funny', icon: '😂' },
    { id: 'atmospheric', label: 'Atmospheric', icon: '🌫️' },
    { id: 'competitive', label: 'Competitive', icon: '🏆' },
    { id: 'wholesome', label: 'Wholesome', icon: '💚' },
    { id: 'nostalgic', label: 'Nostalgic', icon: '📼' },
    { id: 'cozy', label: 'Cozy', icon: '☕' },
    { id: 'melancholic', label: 'Melancholic', icon: '🍂' },
    { id: 'chaotic', label: 'Chaotic', icon: '🌪️' },
    { id: 'mysterious', label: 'Mysterious', icon: '🔮' },
    { id: 'empowering', label: 'Empowering', icon: '💪' },
    { id: 'surreal', label: 'Surreal', icon: '🌀' }
  ]
};

export const GAME_MECHANICS = {
  de: [
    { id: 'open_world', label: 'Offene Welt' },
    { id: 'roguelike', label: 'Roguelike' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'base_building', label: 'Basismodifikation' },
    { id: 'stealth', label: 'Schleichen' },
    { id: 'platformer', label: "Jump 'n' Run" },
    { id: 'puzzle', label: 'Rätsel' },
    { id: 'turn_based', label: 'Rundenbasiert' },
    { id: 'real_time', label: 'Echtzeit' },
    { id: 'exploration', label: 'Erkundung' },
    { id: 'survival', label: 'Überleben' },
    { id: 'deckbuilding', label: 'Deck Building' },
    { id: 'city_builder', label: 'Städtebau' },
    { id: 'resource_mgmt', label: 'Ressourcenmanagement' },
    { id: 'farming', label: 'Bauernhof' },
    { id: 'fishing', label: 'Angeln' },
    { id: 'cooking', label: 'Kochen' },
    { id: 'dating_sim', label: 'Dating Sim' },
    { id: 'rhythm', label: 'Rhythmus' },
    { id: 'typing', label: 'Tippspiel' },
    { id: 'horror_survival', label: 'Horror-Überleben' },
    { id: 'bullet_hell', label: 'Bullet Hell' },
    { id: 'tower_defense', label: 'Tower Defense' },
    { id: 'auto_battler', label: 'Auto Battler' },
    { id: 'speedrun', label: 'Speedrun' },
    { id: 'permadeath', label: 'Permadeath' },
    { id: 'procedural', label: 'Prozedural Generiert' },
    { id: 'hand_drawn', label: 'Handgezeichnet' },
    { id: 'pixel_art', label: 'Pixel Art' },
    { id: 'voxel', label: 'Voxel' }
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
    { id: 'deckbuilding', label: 'Deck Building' },
    { id: 'city_builder', label: 'City Builder' },
    { id: 'resource_mgmt', label: 'Resource Management' },
    { id: 'farming', label: 'Farming' },
    { id: 'fishing', label: 'Fishing' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'dating_sim', label: 'Dating Sim' },
    { id: 'rhythm', label: 'Rhythm' },
    { id: 'typing', label: 'Typing' },
    { id: 'horror_survival', label: 'Horror Survival' },
    { id: 'bullet_hell', label: 'Bullet Hell' },
    { id: 'tower_defense', label: 'Tower Defense' },
    { id: 'auto_battler', label: 'Auto Battler' },
    { id: 'speedrun', label: 'Speedrun' },
    { id: 'permadeath', label: 'Permadeath' },
    { id: 'procedural', label: 'Procedural Generation' },
    { id: 'hand_drawn', label: 'Hand-Drawn' },
    { id: 'pixel_art', label: 'Pixel Art' },
    { id: 'voxel', label: 'Voxel' }
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
    { id: 'strategic', label: 'Strategisch', icon: '🧠' },
    { id: 'chaotic', label: 'Chaotisch', icon: '🌪️' },
    { id: 'methodical', label: 'Methodisch', icon: '🎯' },
    { id: 'rhythmic', label: 'Rhythmisch', icon: '🎵' }
  ],
  en: [
    { id: 'fast_paced', label: 'Fast-Paced', icon: '⚡' },
    { id: 'slow_burn', label: 'Slow Burn', icon: '🐌' },
    { id: 'relaxed', label: 'Relaxed', icon: '🌊' },
    { id: 'intense', label: 'Intense', icon: '🔥' },
    { id: 'strategic', label: 'Strategic', icon: '🧠' },
    { id: 'chaotic', label: 'Chaotic', icon: '🌪️' },
    { id: 'methodical', label: 'Methodical', icon: '🎯' },
    { id: 'rhythmic', label: 'Rhythmic', icon: '🎵' }
  ]
};

export const PLAYTIME_RANGES = {
  quick: { label: 'Quick', icon: '⚡', min: 0, max: 5, color: '#2ECC71' },
  medium: { label: 'Medium', icon: '⏱️', min: 5, max: 20, color: '#F39C12' },
  long: { label: 'Long', icon: '📚', min: 20, max: 50, color: '#E67E22' },
  epic: { label: 'Epic', icon: '🏔️', min: 50, max: 999, color: '#9B59B6' },
  endless: { label: 'Endless', icon: '♾️', min: 999, max: 9999, color: '#3498DB' }
};

export const MULTIPLAYER_TYPES = {
  single: { icon: '👤', label: 'Single-Player', color: '#95A5A6' },
  coop: { icon: '🌐', label: 'Co-op', color: '#3498DB' },
  pvp: { icon: '⚔️', label: 'PvP', color: '#E74C3C' },
  mmo: { icon: '🌍', label: 'MMO', color: '#9B59B6' },
  battle_royale: { icon: '🏟️', label: 'Battle Royale', color: '#E67E22' }
};

export const GAME_STATUS = {
  de: [
    { id: 'playing', name: 'Gerade gespielt', icon: '▶️', color: '#2ECC71' },
    { id: 'completed', name: 'Geschafft', icon: '✅', color: '#27AE60' },
    { id: 'backlog', name: 'Backlog', icon: '📚', color: '#F39C12' },
    { id: 'wishlist', name: 'Wunschliste', icon: '💖', color: '#E74C3C' },
    { id: 'dropped', name: 'Abgebrochen', icon: '🚫', color: '#95A5A6' },
    { id: 'replaying', name: 'Neuspielen', icon: '🔁', color: '#3498DB' }
  ],
  en: [
    { id: 'playing', name: 'Currently Playing', icon: '▶️', color: '#2ECC71' },
    { id: 'completed', name: 'Completed', icon: '✅', color: '#27AE60' },
    { id: 'backlog', name: 'Backlog', icon: '📚', color: '#F39C12' },
    { id: 'wishlist', name: 'Wishlist', icon: '💖', color: '#E74C3C' },
    { id: 'dropped', name: 'Dropped', icon: '🚫', color: '#95A5A6' },
    { id: 'replaying', name: 'Replaying', icon: '🔁', color: '#3498DB' }
  ]
};

export const STEAM_TAGS = [
  { id: 1, name: 'Action', color: '#E74C3C' },
  { id: 2, name: 'Strategy', color: '#3498DB' },
  { id: 3, name: 'RPG', color: '#9B59B6' },
  { id: 4, name: 'Story Rich', color: '#E67E22' },
  { id: 5, name: 'Atmospheric', color: '#1ABC9C' },
  { id: 6, name: 'Difficult', color: '#C0392B' },
  { id: 7, name: 'Casual', color: '#2ECC71' },
  { id: 8, name: 'Indie', color: '#8E44AD' },
  { id: 9, name: 'Adventure', color: '#D35400' },
  { id: 10, name: 'Multiplayer', color: '#2980B9' },
  { id: 11, name: 'Simulation', color: '#7F8C8D' },
  { id: 12, name: 'Puzzle', color: '#16A085' },
  { id: 13, name: 'Pixel Graphics', color: '#27AE60' },
  { id: 14, name: 'Horror', color: '#2C3E50' },
  { id: 15, name: 'Funny', color: '#F1C40F' },
  { id: 16, name: 'Sci-fi', color: '#00BCD4' },
  { id: 17, name: 'Sandbox', color: '#FF9800' },
  { id: 18, name: 'Survival', color: '#795548' },
  { id: 19, name: 'Open World', color: '#4CAF50' },
  { id: 20, name: 'Co-op', color: '#2196F3' },
  { id: 21, name: 'Online Multiplayer', color: '#3F51B5' },
  { id: 22, name: 'Local Multiplayer', color: '#009688' },
  { id: 23, name: 'Roguelike', color: '#FF5722' },
  { id: 24, name: 'Metroidvania', color: '#673AB7' },
  { id: 25, name: 'Hand-drawn', color: '#E91E63' },
  { id: 26, name: 'Music', color: '#FF4081' },
  { id: 27, name: 'Cyberpunk', color: '#00E5FF' },
  { id: 28, name: 'Fantasy', color: '#AA00FF' },
  { id: 29, name: 'Dark', color: '#212121' },
  { id: 30, name: 'Comedy', color: '#FFEB3B' },
  { id: 31, name: 'First-Person', color: '#00BCD4' },
  { id: 32, name: 'Third-Person', color: '#009688' },
  { id: 33, name: 'Turn-Based', color: '#3F51B5' },
  { id: 34, name: 'Real-Time', color: '#F44336' },
  { id: 35, name: 'Old School', color: '#795548' },
  { id: 36, name: 'Retro', color: '#9C27B0' },
  { id: 37, name: '2D', color: '#4CAF50' },
  { id: 38, name: '3D', color: '#2196F3' },
  { id: 39, name: 'Anime', color: '#E91E63' },
  { id: 40, name: 'Memes', color: '#FFEB3B' },
  { id: 41, name: 'Controller', color: '#607D8B' },
  { id: 42, name: 'Great Soundtrack', color: '#FF5722' },
  { id: 43, name: 'Choices Matter', color: '#FF9800' },
  { id: 44, name: 'Replayability', color: '#00BCD4' },
  { id: 45, id: 45, name: 'Skill-Based', color: '#F44336' },
  { id: 46, name: 'Competitive', color: '#D32F2F' },
  { id: 47, name: 'Esports', color: '#1565C0' },
  { id: 48, name: 'Farming Sim', color: '#8BC34A' },
  { id: 49, name: 'Automation', color: '#FFC107' },
  { id: 50, name: 'Factory', color: '#FF6F00' }
];

export const STEAM_TOPSELLER_FILTERS = {
  de: [
    { id: 'topsellers', label: 'Bestseller', icon: '🏆' },
    { id: 'new_releases', label: 'Neuerscheinungen', icon: '🆕' },
    { id: 'top_rated', label: 'Bestbewertet', icon: '⭐' },
    { id: 'popular', label: 'Beliebt', icon: '🔥' },
    { id: 'upcoming', label: 'Demnächst', icon: '📅' },
    { id: 'specials', label: 'Angebote', icon: '🏷️' },
    { id: 'trending', label: 'Im Trend', icon: '📈' },
    { id: 'hidden_gems', label: 'Versteckte Perlen', icon: '💎' },
    { id: 'playtest', label: 'Playtest', icon: '🧪' }
  ],
  en: [
    { id: 'topsellers', label: 'Top Sellers', icon: '🏆' },
    { id: 'new_releases', label: 'New Releases', icon: '🆕' },
    { id: 'top_rated', label: 'Top Rated', icon: '⭐' },
    { id: 'popular', label: 'Popular', icon: '🔥' },
    { id: 'upcoming', label: 'Upcoming', icon: '📅' },
    { id: 'specials', label: 'On Sale', icon: '🏷️' },
    { id: 'trending', label: 'Trending', icon: '📈' },
    { id: 'hidden_gems', label: 'Hidden Gems', icon: '💎' },
    { id: 'playtest', label: 'Playtest', icon: '🧪' }
  ]
};

export const REVIEW_SENTIMENTS = {
  overwhelming_positive: { label: 'Overwhelmingly Positive', color: '#66C0F4', min: 95, minReviews: 500 },
  very_positive: { label: 'Very Positive', color: '#66C0F4', min: 80, minReviews: 50 },
  mostly_positive: { label: 'Mostly Positive', color: '#66C0F4', min: 70, minReviews: 0 },
  mixed: { label: 'Mixed', color: '#B9B48A', min: 40, minReviews: 0 },
  mostly_negative: { label: 'Mostly Negative', color: '#C35C2C', min: 20, minReviews: 0 },
  very_negative: { label: 'Very Negative', color: '#C35C2C', min: 0, minReviews: 0 }
};

export const ICONIC_GAMES = [
  { id:'witcher3', name:'The Witcher 3: Wild Hunt', steamAppId:292030, year:2015, genres:[12,2], rating:93, platforms:[6,8,49,130], playtime:51, tags:['Story-Rich','Fantasy','Open World','Choices Matter'], reviewSentiment:'overwhelming_positive' },
  { id:'eldenring', name:'Elden Ring', steamAppId:1245620, year:2022, genres:[12,2], rating:96, platforms:[6,8,48,49], playtime:58, tags:['Difficult','Dark Fantasy','Exploration','Souls-like'], reviewSentiment:'overwhelming_positive' },
  { id:'zelda_totk', name:'The Legend of Zelda: Tears of the Kingdom', year:2023, genres:[24,31], rating:96, platforms:[130], playtime:59, tags:['Creative','Exploration','Puzzle','Open World'], reviewSentiment:'overwhelming_positive' },
  { id:'god_of_war', name:'God of War Ragnarök', steamAppId:2322150, year:2022, genres:[24], rating:94, platforms:[8,48,6], playtime:26, tags:['Story-Rich','Norse Mythology','Action','Cinematic'], reviewSentiment:'overwhelming_positive' },
  { id:'red_dead_2', name:'Red Dead Redemption 2', steamAppId:1174180, year:2018, genres:[24,2], rating:97, platforms:[6,8,49], playtime:49, tags:['Story-Rich','Open World','Atmospheric','Western'], reviewSentiment:'very_positive' },
  { id:'hades', name:'Hades', steamAppId:1145360, year:2020, genres:[12,2,37], rating:93, platforms:[6,8,48,49,130], playtime:22, tags:['Roguelike','Greek Mythology','Fast-Paced','Indie'], reviewSentiment:'overwhelming_positive' },
  { id:'hollow_knight', name:'Hollow Knight', steamAppId:367520, year:2017, genres:[39,37], rating:90, platforms:[6,8,49,130], playtime:27, tags:['Difficult','Metroidvania','Atmospheric','Indie'], reviewSentiment:'overwhelming_positive' },
  { id:'stardew_valley', name:'Stardew Valley', steamAppId:413150, year:2016, genres:[12,13,37], rating:89, platforms:[6,8,49,130,39], playtime:52, tags:['Relaxing','Farming','Wholesome','Pixel Art'], reviewSentiment:'overwhelming_positive' },
  { id:'celeste', name:'Celeste', steamAppId:504230, year:2018, genres:[39,37], rating:94, platforms:[6,8,49,130], playtime:8, tags:['Difficult','Precision','Story-Rich','Pixel Art'], reviewSentiment:'overwhelming_positive' },
  { id:'undertale', name:'Undertale', steamAppId:391540, year:2015, genres:[12,37], rating:92, platforms:[6,8,130,49], playtime:7, tags:['Unique','Humorous','Emotional','Retro'], reviewSentiment:'overwhelming_positive' },
  { id:'valorant', name:'VALORANT', year:2020, genres:[2], rating:80, platforms:[6], playtime:0, tags:['Competitive','Team-Based','FPS','Esports'], reviewSentiment:'mixed' },
  { id:'minecraft', name:'Minecraft', steamAppId:1672970, year:2011, genres:[13,36], rating:93, platforms:[6,8,49,130,39], playtime:150, tags:['Creative','Open-Ended','Multiplayer','Sandbox'], reviewSentiment:'very_positive' },
  { id:'last_of_us', name:'The Last of Us', steamAppId:1888160, year:2013, genres:[24,2], rating:95, platforms:[8,48,6], playtime:15, tags:['Story-Rich','Emotional','Survival','Cinematic'], reviewSentiment:'very_positive' },
  { id:'disco_elysium', name:'Disco Elysium', steamAppId:632470, year:2019, genres:[12,37], rating:97, platforms:[6,8,48,49,130], playtime:25, tags:['Story-Rich','Choices Matter','Detective','Writing'], reviewSentiment:'overwhelming_positive' },
  { id:'portal_2', name:'Portal 2', steamAppId:620, year:2011, genres:[5,2], rating:95, platforms:[6], playtime:8, tags:['Clever','Humorous','Co-op','Puzzle'], reviewSentiment:'overwhelming_positive' },
  { id:'baldurs_gate_3', name:"Baldur's Gate 3", steamAppId:1086940, year:2023, genres:[12,16], rating:96, platforms:[6,48], playtime:60, tags:['Story-Rich','Choices Matter','Fantasy','Turn-Based'], reviewSentiment:'overwhelming_positive' },
  { id:'monster_hunter', name:'Monster Hunter: World', steamAppId:582010, year:2018, genres:[2,12], rating:90, platforms:[6,8,49], playtime:48, tags:['Co-op','Crafting','Action','Difficult'], reviewSentiment:'very_positive' },
  { id:'animal_crossing', name:'Animal Crossing: New Horizons', year:2020, genres:[13,36], rating:90, platforms:[130], playtime:100, tags:['Relaxing','Creative','Wholesome','Casual'], reviewSentiment:'overwhelming_positive' },
  { id:'dark_souls', name:'Dark Souls', steamAppId:211420, year:2011, genres:[12,2], rating:89, platforms:[6,8,49], playtime:42, tags:['Difficult','Dark Fantasy','Exploration','Souls-like'], reviewSentiment:'overwhelming_positive' },
  { id:'gta5', name:'Grand Theft Auto V', steamAppId:271590, year:2013, genres:[24,2], rating:97, platforms:[6,8,49], playtime:32, tags:['Open World','Action','Story-Rich','Multiplayer'], reviewSentiment:'very_positive' },
  { id:'cyberpunk2077', name:'Cyberpunk 2077', steamAppId:1091500, year:2020, genres:[12,2,24], rating:86, platforms:[6,8,48,49], playtime:35, tags:['Story-Rich','Cyberpunk','Open World','FPS'], reviewSentiment:'very_positive' },
  { id:'skyrim', name:'The Elder Scrolls V: Skyrim', steamAppId:489830, year:2011, genres:[12], rating:94, platforms:[6,8,49], playtime:60, tags:['Open World','Fantasy','RPG','Exploration'], reviewSentiment:'very_positive' },
  { id:'terraria', name:'Terraria', steamAppId:105600, year:2011, genres:[13,37], rating:90, platforms:[6,8,49,130], playtime:80, tags:['Sandbox','Crafting','Exploration','Pixel Art'], reviewSentiment:'overwhelming_positive' },
  { id:'cuphead', name:'Cuphead', steamAppId:268910, year:2017, genres:[2,39], rating:88, platforms:[6,8,49,130], playtime:12, tags:['Difficult','Hand-drawn','Co-op','Retro'], reviewSentiment:'overwhelming_positive' },
  { id:'ori_willis', name:'Ori and the Will of the Wisps', steamAppId:261570, year:2020, genres:[39,24], rating:93, platforms:[6,49,130], playtime:10, tags:['Metroidvania','Atmospheric','Beautiful','Emotional'], reviewSentiment:'overwhelming_positive' },
  { id:'factorio', name:'Factorio', steamAppId:427520, year:2020, genres:[15,13], rating:98, platforms:[6], playtime:200, tags:['Automation','Factory','Strategy','Sandbox'], reviewSentiment:'overwhelming_positive' },
  { id:'rimworld', name:'RimWorld', steamAppId:294100, year:2018, genres:[15,13], rating:97, platforms:[6], playtime:150, tags:['Colony Sim','Story Rich','Sandbox','Difficult'], reviewSentiment:'overwhelming_positive' },
  { id:'subnautica', name:'Subnautica', steamAppId:264710, year:2018, genres:[13,31], rating:90, platforms:[6,8,49], playtime:18, tags:['Survival','Exploration','Atmospheric','Open World'], reviewSentiment:'overwhelming_positive' },
  { id:'doom_eternal', name:'DOOM Eternal', steamAppId:782330, year:2020, genres:[2], rating:90, platforms:[6,8,49], playtime:14, tags:['FPS','Action','Fast-Paced','Difficult'], reviewSentiment:'very_positive' },
  { id:'dead_cells', name:'Dead Cells', steamAppId:588650, year:2018, genres:[2,39,45], rating:90, platforms:[6,8,49,130], playtime:35, tags:['Roguelike','Metroidvania','Difficult','Pixel Art'], reviewSentiment:'overwhelming_positive' },
  { id:'it_takes_two', name:'It Takes Two', steamAppId:1426210, year:2021, genres:[24,39], rating:90, platforms:[6,8,48,49], playtime:10, tags:['Co-op','Story-Rich','Creative','Platformer'], reviewSentiment:'overwhelming_positive' },
  { id:'sekiro', name:'Sekiro: Shadows Die Twice', steamAppId:814380, year:2019, genres:[2,24], rating:92, platforms:[6,8,49], playtime:30, tags:['Difficult','Souls-like','Action','Story-Rich'], reviewSentiment:'overwhelming_positive' },
  { id:'strasbourg', name:'Stray', steamAppId:1332010, year:2022, genres:[24,31], rating:85, platforms:[6,8,48], playtime:5, tags:['Cat','Adventure','Atmospheric','Unique'], reviewSentiment:'very_positive' },
  { id:'vampire_survivors', name:'Vampire Survivors', steamAppId:1794680, year:2022, genres:[2,37], rating:95, platforms:[6], playtime:40, tags:['Roguelike','Bullet Hell','Casual','Addictive'], reviewSentiment:'overwhelming_positive' },
  { id:'palworld', name:'Palworld', steamAppId:1623730, year:2024, genres:[13,12], rating:82, platforms:[6,49], playtime:25, tags:['Survival','Crafting','Multiplayer','Open World'], reviewSentiment:'very_positive' },
  { id:'lethal_company', name:'Lethal Company', steamAppId:2081400, year:2023, genres:[13], rating:97, platforms:[6], playtime:30, tags:['Horror','Co-op','Funny','Indie'], reviewSentiment:'overwhelming_positive' },
];

export const GAME_SEARCH = {
  action: ['action', 'shooter', 'combat', 'fight', 'fps', 'hack and slash'],
  rpg: ['rpg', 'role playing', 'fantasy', 'adventure', 'jrpg', 'wrpg'],
  strategy: ['strategy', 'tactical', 'turn-based', 'rts', '4x', 'grand strategy'],
  indie: ['indie', 'pixel art', 'retro', 'experimental', 'art house'],
  puzzle: ['puzzle', 'brain teaser', 'logic', 'casual', 'escape room'],
  simulation: ['simulation', 'building', 'management', 'farming', 'tycoon'],
  horror: ['horror', 'survival horror', 'scary', 'psychological', 'cosmic horror'],
  platformer: ['platformer', 'metroidvania', '2d', 'precision', 'vania'],
  racing: ['racing', 'arcade racing', 'simulation racing', 'kart', 'rally'],
  sports: ['sports', 'football', 'basketball', 'soccer', 'golf', 'tennis'],
  soulslike: ['souls-like', 'dark souls', 'elden ring', 'difficult', 'boss rush'],
  roguelike: ['roguelike', 'roguelite', 'procedural', 'permadeath', 'run-based'],
  cozy: ['cozy', 'wholesome', 'relaxing', 'farming', 'life sim'],
  visual_novel: ['visual novel', 'dating sim', 'otome', 'narrative', 'choices matter']
};
