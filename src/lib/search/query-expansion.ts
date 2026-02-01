/**
 * Query Expansion and Normalization System
 *
 * Improves search recall by expanding queries with synonyms, related terms,
 * and handling common variations/typos.
 */

// ============================================================================
// Theme Expansions
// ============================================================================

export const THEME_EXPANSIONS: Record<string, string[]> = {
  // Core themes
  redemption: [
    "redemption",
    "redemption arc",
    "personal growth",
    "transformation",
    "second chance",
  ],
  revenge: [
    "revenge",
    "vengeance",
    "retribution",
    "getting even",
    "payback",
  ],
  love: [
    "love",
    "romance",
    "relationship",
    "connection",
    "falling in love",
  ],
  betrayal: [
    "betrayal",
    "deception",
    "backstabbing",
    "trust issues",
    "double cross",
  ],
  survival: [
    "survival",
    "survival story",
    "overcoming odds",
    "against all odds",
  ],
  identity: [
    "identity",
    "self-discovery",
    "who am I",
    "finding oneself",
  ],
  corruption: [
    "corruption",
    "moral decay",
    "power corrupts",
    "descent",
  ],
  friendship: [
    "friendship",
    "buddies",
    "camaraderie",
    "brotherhood",
    "sisterhood",
  ],
  family: [
    "family",
    "family drama",
    "parent child",
    "siblings",
    "generational",
  ],
  loss: ["loss", "grief", "mourning", "dealing with death", "coping"],
  heist: ["heist", "robbery", "caper", "stealing", "con"],
  "time travel": [
    "time travel",
    "time loop",
    "temporal",
    "going back in time",
  ],
  space: ["space", "outer space", "astronaut", "interstellar", "cosmic"],
  ai: [
    "artificial intelligence",
    "AI",
    "robot",
    "android",
    "machine learning",
  ],
  zombie: ["zombie", "undead", "walking dead", "infected", "outbreak"],
  vampire: ["vampire", "vampires", "bloodsucker", "immortal"],
  superhero: [
    "superhero",
    "superheroes",
    "comic book",
    "powers",
    "hero",
  ],
  // Additional themes
  war: ["war", "warfare", "battle", "military", "combat", "soldier"],
  justice: ["justice", "vigilante", "law", "legal", "court", "trial"],
  addiction: [
    "addiction",
    "substance abuse",
    "recovery",
    "rehab",
    "alcoholism",
  ],
  ambition: [
    "ambition",
    "rise to power",
    "success",
    "climbing the ladder",
  ],
  isolation: [
    "isolation",
    "loneliness",
    "solitude",
    "alone",
    "abandoned",
  ],
  paranoia: [
    "paranoia",
    "conspiracy",
    "trust no one",
    "surveillance",
    "being watched",
  ],
  obsession: [
    "obsession",
    "obsessive",
    "fixation",
    "unhealthy attachment",
  ],
  sacrifice: [
    "sacrifice",
    "selfless",
    "giving up",
    "for the greater good",
  ],
  madness: ["madness", "insanity", "mental breakdown", "losing mind"],
  forbidden: [
    "forbidden",
    "taboo",
    "secret",
    "hidden",
    "illicit",
  ],
};

// ============================================================================
// Mood Expansions
// ============================================================================

export const MOOD_EXPANSIONS: Record<string, string[]> = {
  // Positive moods
  "feel-good": [
    "feel-good",
    "uplifting",
    "heartwarming",
    "positive",
    "inspiring",
    "hopeful",
  ],
  cozy: [
    "cozy",
    "comfort",
    "comforting",
    "warm",
    "soothing",
    "relaxing",
  ],
  funny: [
    "funny",
    "hilarious",
    "comedic",
    "laugh out loud",
    "witty",
    "humorous",
  ],
  wholesome: ["wholesome", "pure", "innocent", "sweet", "charming"],

  // Negative/intense moods
  dark: ["dark", "gritty", "bleak", "noir", "brooding", "shadowy"],
  intense: [
    "intense",
    "gripping",
    "tense",
    "edge of seat",
    "nail-biting",
    "suspenseful",
  ],
  scary: [
    "scary",
    "terrifying",
    "frightening",
    "creepy",
    "chilling",
    "horrifying",
  ],
  disturbing: [
    "disturbing",
    "unsettling",
    "uncomfortable",
    "shocking",
    "twisted",
  ],
  sad: [
    "sad",
    "tearjerker",
    "emotional",
    "heartbreaking",
    "tragic",
    "melancholy",
  ],

  // Style moods
  "mind-bending": [
    "mind-bending",
    "mind-blowing",
    "trippy",
    "surreal",
    "complex",
    "cerebral",
  ],
  "slow-burn": [
    "slow burn",
    "slow-paced",
    "methodical",
    "atmospheric",
    "contemplative",
  ],
  "fast-paced": [
    "fast-paced",
    "action-packed",
    "high-octane",
    "non-stop",
    "thrilling",
  ],
  epic: [
    "epic",
    "grand",
    "sweeping",
    "monumental",
    "ambitious",
    "spectacular",
  ],
  quirky: [
    "quirky",
    "offbeat",
    "eccentric",
    "indie",
    "unconventional",
    "unique",
  ],

  // Additional moods
  nostalgic: [
    "nostalgic",
    "nostalgia",
    "throwback",
    "retro",
    "reminiscent",
  ],
  romantic: [
    "romantic",
    "love story",
    "swoon-worthy",
    "chemistry",
  ],
  thought_provoking: [
    "thought-provoking",
    "philosophical",
    "deep",
    "meaningful",
    "makes you think",
  ],
  visceral: ["visceral", "raw", "brutal", "unflinching", "graphic"],
  dreamy: ["dreamy", "ethereal", "magical", "fantastical", "whimsical"],
  claustrophobic: [
    "claustrophobic",
    "confined",
    "trapped",
    "suffocating",
  ],
  bleak: ["bleak", "hopeless", "depressing", "nihilistic", "grim"],
  campy: ["campy", "over the top", "cheesy", "so bad its good", "b-movie"],
};

// ============================================================================
// Genre Synonyms
// ============================================================================

export const GENRE_SYNONYMS: Record<string, string[]> = {
  horror: ["horror", "scary", "frightening", "terrifying"],
  comedy: ["comedy", "funny", "hilarious", "comedic"],
  thriller: ["thriller", "suspense", "suspenseful", "tense"],
  action: ["action", "action-packed", "explosive", "high-octane"],
  drama: ["drama", "dramatic", "serious", "emotional"],
  romance: ["romance", "romantic", "love story", "rom-com"],
  "sci-fi": ["sci-fi", "science fiction", "futuristic", "space"],
  fantasy: ["fantasy", "magical", "mythical", "fantastical"],
  documentary: ["documentary", "docuseries", "true story", "real life"],
  animation: ["animation", "animated", "cartoon", "anime"],
  mystery: ["mystery", "whodunit", "detective", "crime solving"],
  crime: ["crime", "criminal", "gangster", "mob", "mafia"],
  // Additional genres
  western: ["western", "cowboy", "wild west", "frontier"],
  musical: ["musical", "song and dance", "broadway", "singing"],
  war: ["war", "military", "battle", "combat"],
  sports: ["sports", "athletic", "underdog", "competition"],
  biography: ["biography", "biopic", "true story", "based on"],
  historical: ["historical", "period piece", "period drama", "costume drama"],
  noir: ["noir", "film noir", "neo-noir", "hard-boiled"],
  slasher: ["slasher", "slasher film", "serial killer"],
  psychological: ["psychological", "mind games", "mental"],
  supernatural: ["supernatural", "paranormal", "ghostly", "occult"],
  adventure: ["adventure", "quest", "journey", "expedition"],
  family: ["family", "family-friendly", "kids", "children"],
};

// ============================================================================
// Country Names and Demonyms
// ============================================================================

export const COUNTRY_NAMES: Record<
  string,
  { code: string; demonyms: string[] }
> = {
  korea: { code: "KR", demonyms: ["korean", "south korean", "k-"] },
  japan: { code: "JP", demonyms: ["japanese", "j-"] },
  france: { code: "FR", demonyms: ["french"] },
  india: { code: "IN", demonyms: ["indian", "bollywood", "hindi"] },
  uk: { code: "GB", demonyms: ["british", "english", "uk", "britain"] },
  spain: { code: "ES", demonyms: ["spanish"] },
  germany: { code: "DE", demonyms: ["german"] },
  italy: { code: "IT", demonyms: ["italian"] },
  china: { code: "CN", demonyms: ["chinese", "mandarin"] },
  mexico: { code: "MX", demonyms: ["mexican"] },
  brazil: { code: "BR", demonyms: ["brazilian", "portuguese"] },
  sweden: { code: "SE", demonyms: ["swedish", "scandinavian"] },
  denmark: { code: "DK", demonyms: ["danish", "scandinavian"] },
  norway: { code: "NO", demonyms: ["norwegian", "scandinavian"] },
  thailand: { code: "TH", demonyms: ["thai"] },
  iran: { code: "IR", demonyms: ["iranian", "persian"] },
  turkey: { code: "TR", demonyms: ["turkish"] },
  argentina: { code: "AR", demonyms: ["argentine", "argentinian"] },
  australia: { code: "AU", demonyms: ["australian", "aussie"] },
  canada: { code: "CA", demonyms: ["canadian"] },
  russia: { code: "RU", demonyms: ["russian"] },
  poland: { code: "PL", demonyms: ["polish"] },
  netherlands: { code: "NL", demonyms: ["dutch"] },
  belgium: { code: "BE", demonyms: ["belgian"] },
  "hong kong": { code: "HK", demonyms: ["hong kong", "cantonese"] },
  taiwan: { code: "TW", demonyms: ["taiwanese", "mandarin"] },
  israel: { code: "IL", demonyms: ["israeli"] },
  egypt: { code: "EG", demonyms: ["egyptian"] },
  nigeria: { code: "NG", demonyms: ["nigerian", "nollywood"] },
  // Additional countries
  finland: { code: "FI", demonyms: ["finnish"] },
  iceland: { code: "IS", demonyms: ["icelandic"] },
  ireland: { code: "IE", demonyms: ["irish"] },
  scotland: { code: "GB", demonyms: ["scottish", "scots"] },
  greece: { code: "GR", demonyms: ["greek"] },
  czech: { code: "CZ", demonyms: ["czech"] },
  romania: { code: "RO", demonyms: ["romanian"] },
  indonesia: { code: "ID", demonyms: ["indonesian"] },
  vietnam: { code: "VN", demonyms: ["vietnamese"] },
  philippines: { code: "PH", demonyms: ["filipino", "philippine"] },
  singapore: { code: "SG", demonyms: ["singaporean"] },
  malaysia: { code: "MY", demonyms: ["malaysian"] },
  "new zealand": { code: "NZ", demonyms: ["new zealand", "kiwi"] },
  "south africa": { code: "ZA", demonyms: ["south african"] },
  colombia: { code: "CO", demonyms: ["colombian"] },
  chile: { code: "CL", demonyms: ["chilean"] },
  peru: { code: "PE", demonyms: ["peruvian"] },
};

// ============================================================================
// Language Names
// ============================================================================

export const LANGUAGE_NAMES: Record<
  string,
  { code: string; names: string[] }
> = {
  english: { code: "en", names: ["english"] },
  korean: { code: "ko", names: ["korean", "hangul"] },
  japanese: { code: "ja", names: ["japanese"] },
  french: { code: "fr", names: ["french"] },
  spanish: { code: "es", names: ["spanish", "castellano"] },
  german: { code: "de", names: ["german", "deutsch"] },
  italian: { code: "it", names: ["italian"] },
  portuguese: {
    code: "pt",
    names: ["portuguese", "brazilian portuguese"],
  },
  chinese: { code: "zh", names: ["chinese", "mandarin", "cantonese"] },
  hindi: { code: "hi", names: ["hindi"] },
  russian: { code: "ru", names: ["russian"] },
  arabic: { code: "ar", names: ["arabic"] },
  thai: { code: "th", names: ["thai"] },
  swedish: { code: "sv", names: ["swedish"] },
  danish: { code: "da", names: ["danish"] },
  norwegian: { code: "no", names: ["norwegian"] },
  dutch: { code: "nl", names: ["dutch"] },
  polish: { code: "pl", names: ["polish"] },
  turkish: { code: "tr", names: ["turkish"] },
  persian: { code: "fa", names: ["persian", "farsi"] },
  // Additional languages
  finnish: { code: "fi", names: ["finnish"] },
  greek: { code: "el", names: ["greek"] },
  czech: { code: "cs", names: ["czech"] },
  hungarian: { code: "hu", names: ["hungarian"] },
  romanian: { code: "ro", names: ["romanian"] },
  vietnamese: { code: "vi", names: ["vietnamese"] },
  indonesian: { code: "id", names: ["indonesian"] },
  tagalog: { code: "tl", names: ["tagalog", "filipino"] },
  hebrew: { code: "he", names: ["hebrew"] },
  bengali: { code: "bn", names: ["bengali", "bangla"] },
  tamil: { code: "ta", names: ["tamil"] },
  telugu: { code: "te", names: ["telugu"] },
  malayalam: { code: "ml", names: ["malayalam"] },
};

// ============================================================================
// Known Franchises
// ============================================================================

export const KNOWN_FRANCHISES: Record<string, string[]> = {
  marvel: [
    "marvel",
    "mcu",
    "avengers",
    "iron man",
    "captain america",
    "thor",
    "spider-man",
  ],
  dc: [
    "dc",
    "dceu",
    "batman",
    "superman",
    "wonder woman",
    "justice league",
  ],
  "star wars": [
    "star wars",
    "skywalker",
    "jedi",
    "mandalorian",
  ],
  "harry potter": [
    "harry potter",
    "wizarding world",
    "fantastic beasts",
    "hogwarts",
  ],
  "lord of the rings": [
    "lord of the rings",
    "lotr",
    "hobbit",
    "middle earth",
    "tolkien",
  ],
  "james bond": ["james bond", "007", "bond"],
  "fast furious": [
    "fast and furious",
    "fast & furious",
    "f&f",
    "fast saga",
  ],
  "mission impossible": ["mission impossible", "mi", "ethan hunt"],
  "john wick": ["john wick", "wick"],
  pixar: ["pixar"],
  disney: ["disney", "disney animation"],
  ghibli: ["studio ghibli", "ghibli", "miyazaki"],
  jurassic: ["jurassic park", "jurassic world", "jurassic"],
  matrix: ["matrix", "neo"],
  alien: ["alien", "aliens", "xenomorph"],
  terminator: ["terminator", "skynet"],
  "planet of the apes": ["planet of the apes", "apes"],
  "indiana jones": ["indiana jones", "indy"],
  rocky: ["rocky", "creed"],
  "toy story": ["toy story"],
  transformers: ["transformers", "autobots"],
  "x-men": ["x-men", "xmen", "mutants"],
  // Additional franchises
  "back to the future": ["back to the future", "bttf", "delorean"],
  godfather: ["godfather", "corleone"],
  "jason bourne": ["jason bourne", "bourne"],
  "mad max": ["mad max", "fury road"],
  "die hard": ["die hard"],
  lethal_weapon: ["lethal weapon"],
  "ocean's": ["ocean's eleven", "ocean's", "oceans"],
  "hunger games": ["hunger games", "katniss"],
  twilight: ["twilight", "bella swan", "edward cullen"],
  "maze runner": ["maze runner"],
  divergent: ["divergent"],
  shrek: ["shrek", "donkey"],
  "ice age": ["ice age"],
  minions: ["minions", "despicable me"],
  "how to train your dragon": ["how to train your dragon", "httyd"],
  "kung fu panda": ["kung fu panda"],
  "the conjuring": ["conjuring", "annabelle", "warren universe"],
  saw: ["saw", "jigsaw"],
  "paranormal activity": ["paranormal activity"],
  scream: ["scream", "ghostface"],
  "friday the 13th": ["friday the 13th", "jason voorhees"],
  halloween: ["halloween", "michael myers"],
  "nightmare on elm street": ["nightmare on elm street", "freddy krueger"],
  monsterverse: ["godzilla", "kong", "monsterverse"],
  "a24": ["a24"],
  nolan: ["christopher nolan", "nolan"],
  tarantino: ["quentin tarantino", "tarantino"],
  wes_anderson: ["wes anderson"],
  denis_villeneuve: ["denis villeneuve", "villeneuve"],
};

// ============================================================================
// Query Normalization Patterns
// ============================================================================

const NORMALIZATION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> =
  [
    // Genre normalizations
    { pattern: /\bsci fi\b/gi, replacement: "sci-fi" },
    { pattern: /\bscifi\b/gi, replacement: "sci-fi" },
    { pattern: /\bscience fiction\b/gi, replacement: "sci-fi" },
    { pattern: /\bromcom\b/gi, replacement: "romantic comedy" },
    { pattern: /\brom com\b/gi, replacement: "romantic comedy" },
    { pattern: /\brom-com\b/gi, replacement: "romantic comedy" },
    { pattern: /\bdocudrama\b/gi, replacement: "documentary drama" },

    // Style normalizations
    { pattern: /\bb&w\b/gi, replacement: "black and white" },
    { pattern: /\bb\/w\b/gi, replacement: "black and white" },
    { pattern: /\bblack & white\b/gi, replacement: "black and white" },
    { pattern: /\b3d\b/gi, replacement: "3D" },
    { pattern: /\bimax\b/gi, replacement: "IMAX" },

    // Common abbreviations
    { pattern: /\bww2\b/gi, replacement: "world war 2" },
    { pattern: /\bww1\b/gi, replacement: "world war 1" },
    { pattern: /\bwwii\b/gi, replacement: "world war 2" },
    { pattern: /\bwwi\b/gi, replacement: "world war 1" },

    // Decade normalizations
    { pattern: /\b80s\b/gi, replacement: "1980s" },
    { pattern: /\b90s\b/gi, replacement: "1990s" },
    { pattern: /\b70s\b/gi, replacement: "1970s" },
    { pattern: /\b60s\b/gi, replacement: "1960s" },
    { pattern: /\b50s\b/gi, replacement: "1950s" },
    { pattern: /\b00s\b/gi, replacement: "2000s" },
    { pattern: /\b2000s\b/gi, replacement: "2000s" },
    { pattern: /\b2010s\b/gi, replacement: "2010s" },
    { pattern: /\b2020s\b/gi, replacement: "2020s" },

    // Rating normalizations
    { pattern: /\bpg13\b/gi, replacement: "PG-13" },
    { pattern: /\bpg 13\b/gi, replacement: "PG-13" },

    // Country/region normalizations
    { pattern: /\bk-drama\b/gi, replacement: "korean drama" },
    { pattern: /\bkdrama\b/gi, replacement: "korean drama" },
    { pattern: /\bj-horror\b/gi, replacement: "japanese horror" },
    { pattern: /\bjhorror\b/gi, replacement: "japanese horror" },

    // Common typos
    { pattern: /\bhorror\b/gi, replacement: "horror" },
    { pattern: /\bcomedy\b/gi, replacement: "comedy" },
    { pattern: /\bthriller\b/gi, replacement: "thriller" },
  ];

// Common typos and their corrections
const TYPO_CORRECTIONS: Record<string, string> = {
  // Theme typos
  redempshun: "redemption",
  redemtion: "redemption",
  reveng: "revenge",
  vengance: "vengeance",
  betrayl: "betrayal",
  betryal: "betrayal",
  survivle: "survival",
  identiy: "identity",
  idendity: "identity",
  corrupion: "corruption",
  freindship: "friendship",
  friendhip: "friendship",

  // Mood typos
  scray: "scary",
  scarey: "scary",
  terifing: "terrifying",
  terrifing: "terrifying",
  distrubing: "disturbing",
  distirbing: "disturbing",
  hillarious: "hilarious",
  hilarous: "hilarious",
  upliting: "uplifting",
  heartwarming: "heartwarming",
  heartwaming: "heartwarming",
  suspensful: "suspenseful",
  suspenceful: "suspenseful",

  // Genre typos
  thriler: "thriller",
  comdy: "comedy",
  commedy: "comedy",
  horrer: "horror",
  horrow: "horror",
  mistery: "mystery",
  mystrey: "mystery",
  documentry: "documentary",
  documantary: "documentary",
  animaton: "animation",
  animasion: "animation",

  // Country typos
  koreaan: "korean",
  japaense: "japanese",
  japanees: "japanese",
  frence: "french",
  frensh: "french",
  spanish: "spanish",
  italain: "italian",
  itallian: "italian",

  // Franchise typos
  avanger: "avengers",
  avangers: "avengers",
  spiderman: "spider-man",
  ironman: "iron man",
  batmen: "batman",
  suprman: "superman",
  starwars: "star wars",
  harrry: "harry",
  pottre: "potter",
  hobit: "hobbit",
  hobbbit: "hobbit",
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Expanded query result interface
 */
export interface ExpandedQuery {
  original: string;
  normalized: string;
  expanded: string[];
  themes: string[];
  moods: string[];
  genres: string[];
  countries: Array<{ name: string; code: string }>;
  languages: Array<{ name: string; code: string }>;
  franchises: string[];
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Correct common typos in a query
 */
function correctTypos(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const correctedWords = words.map((word) => {
    // Check direct typo corrections first
    if (TYPO_CORRECTIONS[word]) {
      return TYPO_CORRECTIONS[word];
    }
    return word;
  });
  return correctedWords.join(" ");
}

/**
 * Normalize a search query
 */
export function normalizeQuery(query: string): string {
  let normalized = query.trim().toLowerCase();

  // Apply typo corrections
  normalized = correctTypos(normalized);

  // Apply normalization patterns
  for (const { pattern, replacement } of NORMALIZATION_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Find matching themes using fuzzy matching
 */
export function findMatchingThemes(
  query: string,
  maxDistance: number = 2
): string[] {
  const normalizedQuery = query.toLowerCase();
  const words = normalizedQuery.split(/\s+/);
  const matchedThemes: Set<string> = new Set();

  // Check each word against theme keys
  for (const word of words) {
    for (const themeKey of Object.keys(THEME_EXPANSIONS)) {
      // Exact match
      if (themeKey === word || themeKey.includes(word)) {
        matchedThemes.add(themeKey);
        continue;
      }

      // Fuzzy match using Levenshtein distance
      const distance = levenshteinDistance(word, themeKey);
      if (distance <= maxDistance && word.length > 3) {
        matchedThemes.add(themeKey);
      }
    }
  }

  // Also check for multi-word theme matches
  for (const themeKey of Object.keys(THEME_EXPANSIONS)) {
    if (
      themeKey.includes(" ") &&
      normalizedQuery.includes(themeKey.replace(/-/g, " "))
    ) {
      matchedThemes.add(themeKey);
    }
  }

  return Array.from(matchedThemes);
}

/**
 * Find matching moods using fuzzy matching
 */
export function findMatchingMoods(
  query: string,
  maxDistance: number = 2
): string[] {
  const normalizedQuery = query.toLowerCase();
  const words = normalizedQuery.split(/\s+/);
  const matchedMoods: Set<string> = new Set();

  // Check each word against mood keys and their expansions
  for (const word of words) {
    for (const [moodKey, expansions] of Object.entries(MOOD_EXPANSIONS)) {
      // Check the key
      if (moodKey.replace(/-/g, " ") === word || moodKey === word) {
        matchedMoods.add(moodKey);
        continue;
      }

      // Check expansions
      for (const expansion of expansions) {
        if (expansion === word || normalizedQuery.includes(expansion)) {
          matchedMoods.add(moodKey);
          break;
        }

        // Fuzzy match
        const distance = levenshteinDistance(word, expansion);
        if (distance <= maxDistance && word.length > 3) {
          matchedMoods.add(moodKey);
          break;
        }
      }
    }
  }

  return Array.from(matchedMoods);
}

/**
 * Find matching genres
 */
export function findMatchingGenres(query: string): string[] {
  const normalizedQuery = query.toLowerCase();
  const matchedGenres: Set<string> = new Set();

  for (const [genreKey, synonyms] of Object.entries(GENRE_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalizedQuery.includes(synonym)) {
        matchedGenres.add(genreKey);
        break;
      }
    }
  }

  return Array.from(matchedGenres);
}

/**
 * Find matching countries from query
 */
export function findMatchingCountries(
  query: string
): Array<{ name: string; code: string }> {
  const normalizedQuery = query.toLowerCase();
  const matchedCountries: Array<{ name: string; code: string }> = [];

  for (const [countryName, { code, demonyms }] of Object.entries(
    COUNTRY_NAMES
  )) {
    // Check country name
    if (normalizedQuery.includes(countryName)) {
      matchedCountries.push({ name: countryName, code });
      continue;
    }

    // Check demonyms
    for (const demonym of demonyms) {
      if (normalizedQuery.includes(demonym)) {
        matchedCountries.push({ name: countryName, code });
        break;
      }
    }
  }

  return matchedCountries;
}

/**
 * Find matching languages from query
 */
export function findMatchingLanguages(
  query: string
): Array<{ name: string; code: string }> {
  const normalizedQuery = query.toLowerCase();
  const matchedLanguages: Array<{ name: string; code: string }> = [];

  for (const [langName, { code, names }] of Object.entries(LANGUAGE_NAMES)) {
    for (const name of names) {
      if (normalizedQuery.includes(name)) {
        matchedLanguages.push({ name: langName, code });
        break;
      }
    }
  }

  return matchedLanguages;
}

/**
 * Find matching franchises from query
 */
export function findMatchingFranchises(query: string): string[] {
  const normalizedQuery = query.toLowerCase();
  const matchedFranchises: Set<string> = new Set();

  for (const [franchiseName, keywords] of Object.entries(KNOWN_FRANCHISES)) {
    for (const keyword of keywords) {
      if (normalizedQuery.includes(keyword.toLowerCase())) {
        matchedFranchises.add(franchiseName);
        break;
      }
    }
  }

  return Array.from(matchedFranchises);
}

/**
 * Get all expansion terms for matched themes
 */
function getThemeExpansions(themes: string[]): string[] {
  const expansions: Set<string> = new Set();

  for (const theme of themes) {
    const themeExpansions = THEME_EXPANSIONS[theme];
    if (themeExpansions) {
      for (const expansion of themeExpansions) {
        expansions.add(expansion);
      }
    }
  }

  return Array.from(expansions);
}

/**
 * Get all expansion terms for matched moods
 */
function getMoodExpansions(moods: string[]): string[] {
  const expansions: Set<string> = new Set();

  for (const mood of moods) {
    const moodExpansions = MOOD_EXPANSIONS[mood];
    if (moodExpansions) {
      for (const expansion of moodExpansions) {
        expansions.add(expansion);
      }
    }
  }

  return Array.from(expansions);
}

/**
 * Get all synonym terms for matched genres
 */
function getGenreSynonyms(genres: string[]): string[] {
  const synonyms: Set<string> = new Set();

  for (const genre of genres) {
    const genreSynonyms = GENRE_SYNONYMS[genre];
    if (genreSynonyms) {
      for (const synonym of genreSynonyms) {
        synonyms.add(synonym);
      }
    }
  }

  return Array.from(synonyms);
}

/**
 * Main query expansion function
 */
export function expandQuery(query: string): ExpandedQuery {
  const normalized = normalizeQuery(query);
  const themes = findMatchingThemes(normalized);
  const moods = findMatchingMoods(normalized);
  const genres = findMatchingGenres(normalized);
  const countries = findMatchingCountries(normalized);
  const languages = findMatchingLanguages(normalized);
  const franchises = findMatchingFranchises(normalized);

  // Collect all expansions
  const expandedTerms: Set<string> = new Set();

  // Add original and normalized
  expandedTerms.add(query.toLowerCase());
  if (normalized !== query.toLowerCase()) {
    expandedTerms.add(normalized);
  }

  // Add theme expansions
  for (const term of getThemeExpansions(themes)) {
    expandedTerms.add(term);
  }

  // Add mood expansions
  for (const term of getMoodExpansions(moods)) {
    expandedTerms.add(term);
  }

  // Add genre synonyms
  for (const term of getGenreSynonyms(genres)) {
    expandedTerms.add(term);
  }

  // Add franchise keywords
  for (const franchise of franchises) {
    const keywords = KNOWN_FRANCHISES[franchise];
    if (keywords) {
      for (const keyword of keywords) {
        expandedTerms.add(keyword);
      }
    }
  }

  return {
    original: query,
    normalized,
    expanded: Array.from(expandedTerms),
    themes,
    moods,
    genres,
    countries,
    languages,
    franchises,
  };
}

/**
 * Generate search variants for semantic search
 * Returns a smaller set of key variants for embedding generation
 */
export function generateSearchVariants(query: string, maxVariants: number = 5): string[] {
  const expanded = expandQuery(query);
  const variants: Set<string> = new Set();

  // Always include the normalized query
  variants.add(expanded.normalized);

  // Add key theme/mood terms (not full expansions to avoid too many variants)
  for (const theme of expanded.themes.slice(0, 2)) {
    variants.add(theme);
  }

  for (const mood of expanded.moods.slice(0, 2)) {
    variants.add(mood);
  }

  // Add detected genre
  if (expanded.genres.length > 0) {
    variants.add(expanded.genres[0]);
  }

  // If we have a franchise, add the main name
  if (expanded.franchises.length > 0) {
    variants.add(expanded.franchises[0]);
  }

  // Limit to max variants
  const result = Array.from(variants).slice(0, maxVariants);

  return result;
}

/**
 * Check if a query is likely a title search (vs thematic search)
 */
export function isLikelyTitleSearch(query: string): boolean {
  const normalized = query.toLowerCase().trim();

  // Check for quoted strings (explicit title search)
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return true;
  }

  // Check for year patterns (e.g., "inception 2010")
  if (/\b(19|20)\d{2}\b/.test(normalized)) {
    return true;
  }

  // Check if query matches known franchise
  const franchises = findMatchingFranchises(normalized);
  if (franchises.length > 0) {
    // Could be looking for specific franchise movie
    return true;
  }

  // Check if query has no theme/mood matches (likely a title)
  const themes = findMatchingThemes(normalized);
  const moods = findMatchingMoods(normalized);
  const genres = findMatchingGenres(normalized);

  if (themes.length === 0 && moods.length === 0 && genres.length === 0) {
    return true;
  }

  return false;
}

/**
 * Extract decade filter from query
 */
export function extractDecadeFilter(
  query: string
): { decade: number; cleanQuery: string } | null {
  const decadePattern = /\b(19[5-9]0|20[0-2]0)s?\b/i;
  const match = query.match(decadePattern);

  if (match) {
    const decade = parseInt(match[1], 10);
    const cleanQuery = query.replace(decadePattern, "").trim();
    return { decade, cleanQuery };
  }

  return null;
}

/**
 * Build enhanced search query for full-text search
 */
export function buildEnhancedSearchQuery(query: string): string {
  const expanded = expandQuery(query);

  // For full-text search, combine key terms with OR
  const searchTerms: string[] = [expanded.normalized];

  // Add top theme/mood expansions
  if (expanded.themes.length > 0) {
    const topTheme = expanded.themes[0];
    const expansions = THEME_EXPANSIONS[topTheme];
    if (expansions) {
      searchTerms.push(...expansions.slice(0, 3));
    }
  }

  if (expanded.moods.length > 0) {
    const topMood = expanded.moods[0];
    const expansions = MOOD_EXPANSIONS[topMood];
    if (expansions) {
      searchTerms.push(...expansions.slice(0, 3));
    }
  }

  // Deduplicate and join
  const uniqueTerms = [...new Set(searchTerms)];
  return uniqueTerms.join(" | ");
}
