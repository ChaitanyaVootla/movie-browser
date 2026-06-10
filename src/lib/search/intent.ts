/**
 * Query Intent Classification
 *
 * Analyzes search queries to determine user intent and route to appropriate
 * search strategy (fuzzy vs semantic vs filtered).
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md - Phase 3
 */

// =============================================================================
// Types
// =============================================================================

export type QueryIntent =
  | "title" // Looking for specific title
  | "semantic" // Descriptive/mood-based query
  | "person" // Looking for actor/director
  | "filter" // Structured filter query (year, genre, etc.)
  | "mixed"; // Combination of intents

export interface ExtractedFilters {
  // Existing filters
  genres?: string[];
  year?: number;
  yearRange?: [number, number];
  decade?: string;
  person?: string;
  /** Detected "similar to X" pattern with title to resolve */
  similarTo?: { title: string; resolvedId?: number };
  /** Detected streaming service filter */
  streamingService?: string;

  // NEW filters
  /** Language filter - ISO 639-1 code (e.g., "ko", "fr", "ja") */
  language?: string;
  /** Country of origin - ISO 3166-1 alpha-2 code (e.g., "KR", "FR", "JP") */
  country?: string;
  /** Cast members to filter by */
  cast?: string[];
  /** Director to filter by */
  director?: string;
  /** Runtime constraints in minutes */
  runtime?: { min?: number; max?: number };
  /** Minimum rating filter (0-10 scale) */
  minRating?: number;
  /** TV network filter */
  network?: string;
  /** Collection/franchise filter */
  collection?: string;
  /** Content warnings to avoid */
  contentWarnings?: string[];
  /** Keywords/themes to search for */
  keywords?: string[];
  /** Best for occasion */
  bestFor?: string;
  /** Structured mood preferences */
  mood?: {
    pacing?: "slow" | "fast" | "medium";
    intensity?: "light" | "medium" | "intense";
    tone?: "dark" | "light" | "comedic" | "serious" | "gritty";
  };
  /** Series status (for TV shows) */
  seriesStatus?: "returning" | "ended" | "cancelled";
  /** Season count constraints */
  seasonCount?: { min?: number; max?: number };
}

export interface IntentAnalysis {
  /** Primary detected intent */
  intent: QueryIntent;
  /** Confidence score 0-1 */
  confidence: number;
  /** Extracted filter values from query */
  extractedFilters?: ExtractedFilters;
  /** Whether query appears to be exact title lookup */
  isExactLookup: boolean;
  /** Cleaned query with filters removed */
  cleanedQuery: string;
  /** Whether query should be sent to LLM for better parsing */
  needsLlmParsing: boolean;
}

// =============================================================================
// Constants - Core
// =============================================================================

/**
 * Words that indicate semantic/descriptive search intent
 */
const SEMANTIC_INDICATORS = new Set([
  // Comparisons
  "like",
  "similar",
  "same",
  "vibe",
  "vibes",
  "mood",
  "feel",
  "feels",
  "feeling",
  // Quality descriptors
  "best",
  "top",
  "great",
  "good",
  "amazing",
  "awesome",
  "excellent",
  "underrated",
  "hidden",
  "gem",
  "gems",
  "classic",
  "classics",
  // Emotional descriptors
  "funny",
  "scary",
  "dark",
  "light",
  "emotional",
  "intense",
  "uplifting",
  "depressing",
  "heartwarming",
  "heartbreaking",
  "suspenseful",
  "thrilling",
  "mind-bending",
  "thought-provoking",
  // Content descriptors
  "about",
  "featuring",
  "involving",
  "with",
  "where",
  "when",
  // Genre-adjacent descriptors
  "action-packed",
  "romantic",
  "comedic",
  "dramatic",
  "mysterious",
  // Pacing/tone
  "slow",
  "fast",
  "gritty",
  "lighthearted",
]);

/**
 * Words that indicate person-focused search
 * Note: "with" is excluded as it's too ambiguous (can mean "movies with action")
 */
const PERSON_INDICATORS = new Set([
  "by",
  "starring",
  "directed",
  "director",
  "actor",
  "actress",
  "cast",
  "written",
  "writer",
  "produced",
  "producer",
  "cinematography",
  "played",
  "performance",
]);

// =============================================================================
// Constants - Genre Mappings
// =============================================================================

/**
 * Genre synonyms mapping - maps informal terms to official TMDB genres
 * Some terms map to multiple genres (e.g., "romcom" -> Comedy + Romance)
 */
const GENRE_SYNONYMS: Record<string, string[]> = {
  "sci-fi": ["science fiction"],
  scifi: ["science fiction"],
  "science-fiction": ["science fiction"],
  romcom: ["comedy", "romance"],
  "rom-com": ["comedy", "romance"],
  "romantic comedy": ["comedy", "romance"],
  scary: ["horror"], // Also a semantic indicator
  spooky: ["horror"],
  animated: ["animation"],
  cartoons: ["animation"],
  cartoon: ["animation"],
  historical: ["history"],
  war: ["war"],
  "true story": ["history", "documentary"],
  biopic: ["history", "drama"],
  biography: ["history", "drama"],
  superhero: ["action", "science fiction"],
  slasher: ["horror", "thriller"],
  noir: ["crime", "thriller"],
  "film noir": ["crime", "thriller"],
  heist: ["crime", "thriller"],
  zombie: ["horror"],
  apocalyptic: ["science fiction", "thriller"],
  "post-apocalyptic": ["science fiction", "thriller"],
  dystopian: ["science fiction", "thriller"],
  spy: ["action", "thriller"],
  espionage: ["action", "thriller"],
  martial: ["action"], // "martial arts"
  kung: ["action"], // "kung fu"
  karate: ["action"],
  samurai: ["action", "history"],
  space: ["science fiction"],
  anime: ["animation"],
  whodunit: ["mystery", "crime"],
  mockumentary: ["comedy", "documentary"],
  satire: ["comedy"],
  parody: ["comedy"],
  slapstick: ["comedy"],
  psychological: ["thriller", "drama"],
  supernatural: ["fantasy", "horror"],
  paranormal: ["horror", "fantasy"],
  disaster: ["action", "thriller"],
  courtroom: ["drama", "crime"],
  legal: ["drama", "crime"],
  political: ["drama", "thriller"],
  sports: ["drama"],
  musical: ["music"],
};

// =============================================================================
// Constants - Language Mappings
// =============================================================================

/**
 * Language name to ISO 639-1 code mapping
 * Supports language names, adjectives, and common variations
 *
 * Test cases:
 * "Korean movies" → "ko"
 * "French films" → "fr"
 * "in Spanish" → "es"
 * "Japanese anime" → "ja"
 * "Mandarin movies" → "zh"
 */
const LANGUAGE_MAP: Record<string, string> = {
  // East Asian
  korean: "ko",
  "south korean": "ko",
  japanese: "ja",
  chinese: "zh",
  mandarin: "zh",
  cantonese: "zh",
  taiwanese: "zh",
  thai: "th",
  vietnamese: "vi",
  indonesian: "id",
  malay: "ms",
  filipino: "tl",
  tagalog: "tl",

  // European
  french: "fr",
  german: "de",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  polish: "pl",
  dutch: "nl",
  swedish: "sv",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  greek: "el",
  turkish: "tr",
  czech: "cs",
  hungarian: "hu",
  romanian: "ro",
  ukrainian: "uk",

  // South Asian
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  malayalam: "ml",
  bengali: "bn",
  punjabi: "pa",
  marathi: "mr",
  urdu: "ur",

  // Middle Eastern
  arabic: "ar",
  persian: "fa",
  farsi: "fa",
  iranian: "fa",
  hebrew: "he",
  israeli: "he",

  // Other
  english: "en",
  american: "en",
  british: "en",
};

// =============================================================================
// Constants - Country Mappings
// =============================================================================

/**
 * Country name/demonym to ISO 3166-1 alpha-2 code mapping
 *
 * Test cases:
 * "from Korea" → "KR"
 * "British films" → "GB"
 * "Bollywood" → "IN"
 * "Hollywood" → "US"
 * "South Korean thrillers" → "KR"
 */
const COUNTRY_MAP: Record<string, string> = {
  // Asia
  korean: "KR",
  "south korean": "KR",
  korea: "KR",
  "south korea": "KR",
  japanese: "JP",
  japan: "JP",
  chinese: "CN",
  china: "CN",
  "hong kong": "HK",
  taiwanese: "TW",
  taiwan: "TW",
  thai: "TH",
  thailand: "TH",
  vietnamese: "VN",
  vietnam: "VN",
  indonesian: "ID",
  indonesia: "ID",
  filipino: "PH",
  philippine: "PH",
  philippines: "PH",

  // South Asia
  indian: "IN",
  india: "IN",
  bollywood: "IN",
  pakistani: "PK",
  pakistan: "PK",
  bangladeshi: "BD",
  bangladesh: "BD",

  // Europe
  british: "GB",
  uk: "GB",
  "united kingdom": "GB",
  english: "GB",
  scottish: "GB",
  welsh: "GB",
  irish: "IE",
  ireland: "IE",
  french: "FR",
  france: "FR",
  german: "DE",
  germany: "DE",
  spanish: "ES",
  spain: "ES",
  italian: "IT",
  italy: "IT",
  portuguese: "PT",
  portugal: "PT",
  russian: "RU",
  russia: "RU",
  polish: "PL",
  poland: "PL",
  dutch: "NL",
  netherlands: "NL",
  belgian: "BE",
  belgium: "BE",
  swedish: "SE",
  sweden: "SE",
  norwegian: "NO",
  norway: "NO",
  danish: "DK",
  denmark: "DK",
  finnish: "FI",
  finland: "FI",
  greek: "GR",
  greece: "GR",
  turkish: "TR",
  turkey: "TR",
  czech: "CZ",
  hungarian: "HU",
  hungary: "HU",
  romanian: "RO",
  romania: "RO",
  ukrainian: "UA",
  ukraine: "UA",

  // Americas
  american: "US",
  hollywood: "US",
  "united states": "US",
  usa: "US",
  canadian: "CA",
  canada: "CA",
  mexican: "MX",
  mexico: "MX",
  brazilian: "BR",
  brazil: "BR",
  argentine: "AR",
  argentinian: "AR",
  argentina: "AR",
  colombian: "CO",
  colombia: "CO",
  chilean: "CL",
  chile: "CL",

  // Middle East
  iranian: "IR",
  iran: "IR",
  persian: "IR",
  israeli: "IL",
  israel: "IL",
  lebanese: "LB",
  lebanon: "LB",
  egyptian: "EG",
  egypt: "EG",
  saudi: "SA",
  "saudi arabian": "SA",

  // Africa
  nigerian: "NG",
  nigeria: "NG",
  nollywood: "NG",
  "south african": "ZA",
  "south africa": "ZA",

  // Oceania
  australian: "AU",
  australia: "AU",
  "new zealand": "NZ",
  kiwi: "NZ",
};

// =============================================================================
// Constants - Streaming Services
// =============================================================================

/**
 * Streaming services mapping - normalizes variations to canonical names
 */
const STREAMING_SERVICES: Record<string, string> = {
  netflix: "Netflix",
  hulu: "Hulu",
  "disney+": "Disney+",
  "disney plus": "Disney+",
  disneyplus: "Disney+",
  disney: "Disney+",
  "amazon prime": "Amazon Prime Video",
  "prime video": "Amazon Prime Video",
  prime: "Amazon Prime Video",
  amazon: "Amazon Prime Video",
  "hbo max": "Max",
  hbo: "Max",
  max: "Max",
  "apple tv": "Apple TV+",
  "apple tv+": "Apple TV+",
  appletv: "Apple TV+",
  apple: "Apple TV+",
  peacock: "Peacock",
  paramount: "Paramount+",
  "paramount+": "Paramount+",
  "paramount plus": "Paramount+",
  showtime: "Showtime",
  starz: "Starz",
  crunchyroll: "Crunchyroll",
  funimation: "Funimation",
  "youtube premium": "YouTube Premium",
  tubi: "Tubi",
  pluto: "Pluto TV",
  "pluto tv": "Pluto TV",
  roku: "Roku Channel",
  "roku channel": "Roku Channel",
  britbox: "BritBox",
  acorn: "Acorn TV",
  "acorn tv": "Acorn TV",
  mubi: "MUBI",
  criterion: "Criterion Channel",
  "criterion channel": "Criterion Channel",
  shudder: "Shudder",
};

// =============================================================================
// Constants - TV Networks
// =============================================================================

/**
 * TV network mapping - normalizes variations to canonical names
 *
 * Test cases:
 * "HBO shows" → "HBO"
 * "Netflix originals" → "Netflix"
 * "BBC series" → "BBC"
 * "Apple TV+ series" → "Apple TV+"
 */
const NETWORK_MAP: Record<string, string> = {
  // Premium Cable
  hbo: "HBO",
  "hbo max": "HBO",
  showtime: "Showtime",
  starz: "Starz",
  cinemax: "Cinemax",

  // Basic Cable
  amc: "AMC",
  "amc+": "AMC",
  fx: "FX",
  fxx: "FX",
  usa: "USA Network",
  "usa network": "USA Network",
  syfy: "Syfy",
  tnt: "TNT",
  tbs: "TBS",
  bravo: "Bravo",
  "comedy central": "Comedy Central",
  mtv: "MTV",
  vh1: "VH1",
  bet: "BET",
  hallmark: "Hallmark",
  lifetime: "Lifetime",
  history: "History",
  "history channel": "History",
  discovery: "Discovery",
  tlc: "TLC",
  hgtv: "HGTV",
  "food network": "Food Network",
  espn: "ESPN",
  cartoon: "Cartoon Network",
  "cartoon network": "Cartoon Network",
  adult: "Adult Swim",
  "adult swim": "Adult Swim",
  nickelodeon: "Nickelodeon",
  nick: "Nickelodeon",

  // Broadcast
  nbc: "NBC",
  abc: "ABC",
  cbs: "CBS",
  fox: "FOX",
  cw: "The CW",
  "the cw": "The CW",
  pbs: "PBS",

  // Streaming Services (as networks)
  netflix: "Netflix",
  hulu: "Hulu",
  "amazon prime": "Amazon",
  "prime video": "Amazon",
  amazon: "Amazon",
  "apple tv": "Apple TV+",
  "apple tv+": "Apple TV+",
  appletv: "Apple TV+",
  apple: "Apple TV+",
  disney: "Disney+",
  "disney+": "Disney+",
  peacock: "Peacock",
  paramount: "Paramount+",
  "paramount+": "Paramount+",
  max: "Max",

  // International
  bbc: "BBC",
  "bbc one": "BBC",
  "bbc two": "BBC",
  itv: "ITV",
  channel: "Channel 4",
  "channel 4": "Channel 4",
  sky: "Sky",
  arte: "Arte",
  canal: "Canal+",
  "canal+": "Canal+",
  ard: "ARD",
  zdf: "ZDF",
  rai: "RAI",
  nhk: "NHK",
  tvn: "tvN",
  jtbc: "JTBC",
  kbs: "KBS",
  mbc: "MBC",
  sbs: "SBS",
};

// =============================================================================
// Constants - Collections/Franchises
// =============================================================================

/**
 * Collection/franchise mapping - maps variations to canonical names
 *
 * Test cases:
 * "Marvel movies" → "Marvel Cinematic Universe"
 * "MCU" → "Marvel Cinematic Universe"
 * "Star Wars" → "Star Wars"
 * "Harry Potter" → "Harry Potter"
 * "James Bond films" → "James Bond"
 */
const COLLECTION_MAP: Record<string, string> = {
  // Superhero
  marvel: "Marvel Cinematic Universe",
  mcu: "Marvel Cinematic Universe",
  avengers: "Marvel Cinematic Universe",
  dc: "DC Extended Universe",
  dceu: "DC Extended Universe",
  "dc universe": "DC Extended Universe",
  batman: "Batman",
  superman: "Superman",
  "spider-man": "Spider-Man",
  spiderman: "Spider-Man",
  "x-men": "X-Men",
  xmen: "X-Men",

  // Sci-Fi Franchises
  "star wars": "Star Wars",
  starwars: "Star Wars",
  "star trek": "Star Trek",
  startrek: "Star Trek",
  alien: "Alien",
  aliens: "Alien",
  terminator: "Terminator",
  transformers: "Transformers",
  "jurassic park": "Jurassic Park",
  "jurassic world": "Jurassic Park",
  jurassic: "Jurassic Park",
  "planet of the apes": "Planet of the Apes",
  "back to the future": "Back to the Future",
  "the matrix": "The Matrix",
  matrix: "The Matrix",
  "mad max": "Mad Max",
  dune: "Dune",
  "blade runner": "Blade Runner",

  // Fantasy
  "harry potter": "Harry Potter",
  "wizarding world": "Harry Potter",
  "lord of the rings": "The Lord of the Rings",
  lotr: "The Lord of the Rings",
  hobbit: "The Hobbit",
  "the hobbit": "The Hobbit",
  narnia: "The Chronicles of Narnia",

  // Action
  "james bond": "James Bond",
  bond: "James Bond",
  "007": "James Bond",
  "mission impossible": "Mission: Impossible",
  "fast and furious": "Fast & Furious",
  "fast & furious": "Fast & Furious",
  "fast furious": "Fast & Furious",
  "john wick": "John Wick",
  bourne: "Jason Bourne",
  "jason bourne": "Jason Bourne",
  "indiana jones": "Indiana Jones",
  rocky: "Rocky",
  rambo: "Rambo",
  "die hard": "Die Hard",
  lethal: "Lethal Weapon",
  "lethal weapon": "Lethal Weapon",
  "pirates of the caribbean": "Pirates of the Caribbean",
  pirates: "Pirates of the Caribbean",

  // Horror
  conjuring: "The Conjuring",
  "the conjuring": "The Conjuring",
  insidious: "Insidious",
  paranormal: "Paranormal Activity",
  "paranormal activity": "Paranormal Activity",
  saw: "Saw",
  halloween: "Halloween",
  "friday the 13th": "Friday the 13th",
  nightmare: "A Nightmare on Elm Street",
  "a nightmare on elm street": "A Nightmare on Elm Street",
  scream: "Scream",
  "final destination": "Final Destination",
  purge: "The Purge",
  "the purge": "The Purge",

  // Animation
  pixar: "Pixar",
  disney: "Disney Animation",
  "disney animation": "Disney Animation",
  dreamworks: "DreamWorks Animation",
  shrek: "Shrek",
  "toy story": "Toy Story",
  "finding nemo": "Finding Nemo",
  "finding dory": "Finding Nemo",
  "ice age": "Ice Age",
  "kung fu panda": "Kung Fu Panda",
  "how to train your dragon": "How to Train Your Dragon",
  minions: "Despicable Me",
  "despicable me": "Despicable Me",
  "studio ghibli": "Studio Ghibli",
  ghibli: "Studio Ghibli",
  miyazaki: "Studio Ghibli",

  // Comedy
  "monty python": "Monty Python",
  "hangover": "The Hangover",
  "the hangover": "The Hangover",
  "american pie": "American Pie",
  "ocean's": "Ocean's",
  oceans: "Ocean's",
  "ocean's eleven": "Ocean's",

  // Other Notable
  godfather: "The Godfather",
  "the godfather": "The Godfather",
  "the dark knight": "The Dark Knight Trilogy",
  nolan: "Christopher Nolan",
  tarantino: "Quentin Tarantino",
  "planet earth": "Planet Earth",
  twilight: "Twilight",
  "hunger games": "The Hunger Games",
  "the hunger games": "The Hunger Games",
  maze: "The Maze Runner",
  "maze runner": "The Maze Runner",
  divergent: "Divergent",
  "fifty shades": "Fifty Shades",
  "after": "After",
};

// =============================================================================
// Constants - Content Warnings
// =============================================================================

/**
 * Content warning keywords mapping
 *
 * Test cases:
 * "family friendly" → ["violence", "gore", "sexual"]
 * "no gore" → ["gore"]
 * "kid safe" → ["violence", "gore", "sexual", "language"]
 */
const CONTENT_WARNING_MAP: Record<string, string[]> = {
  "family friendly": ["violence", "gore", "sexual", "language"],
  "kid safe": ["violence", "gore", "sexual", "language"],
  "kid friendly": ["violence", "gore", "sexual", "language"],
  "child safe": ["violence", "gore", "sexual", "language"],
  "children friendly": ["violence", "gore", "sexual", "language"],
  "no violence": ["violence"],
  "avoid violence": ["violence"],
  "no gore": ["gore"],
  "avoid gore": ["gore"],
  "no blood": ["gore"],
  "no jumpscares": ["jumpscares"],
  "avoid jumpscares": ["jumpscares"],
  "no jump scares": ["jumpscares"],
  "no scary": ["horror"],
  "not scary": ["horror"],
  "no nudity": ["nudity"],
  "avoid nudity": ["nudity"],
  "no sex": ["sexual"],
  "avoid sex": ["sexual"],
  "no language": ["language"],
  "clean language": ["language"],
  "no swearing": ["language"],
  "no drugs": ["drugs"],
  "avoid drugs": ["drugs"],
  pg: ["violence", "gore", "sexual", "language"],
  "pg-13": ["gore", "sexual"],
};

// =============================================================================
// Constants - Keywords/Themes
// =============================================================================

/**
 * Common keyword/theme patterns for extraction
 *
 * Test cases:
 * "about time travel" → "time travel"
 * "involving heists" → "heist"
 * "zombie movies" → "zombie"
 */
const KEYWORD_PATTERNS: string[] = [
  "time travel",
  "time loop",
  "parallel universe",
  "multiverse",
  "alien invasion",
  "aliens",
  "artificial intelligence",
  "ai",
  "robots",
  "cyborg",
  "virtual reality",
  "simulation",
  "space exploration",
  "space travel",
  "heist",
  "bank robbery",
  "prison escape",
  "survival",
  "stranded",
  "island",
  "desert",
  "zombie",
  "zombies",
  "outbreak",
  "pandemic",
  "virus",
  "vampire",
  "vampires",
  "werewolf",
  "werewolves",
  "witch",
  "witches",
  "ghost",
  "ghosts",
  "haunted",
  "possession",
  "demon",
  "demons",
  "serial killer",
  "murder mystery",
  "detective",
  "investigation",
  "conspiracy",
  "corruption",
  "revenge",
  "redemption",
  "addiction",
  "mental illness",
  "amnesia",
  "coming of age",
  "road trip",
  "friendship",
  "family",
  "wedding",
  "divorce",
  "grief",
  "loss",
  "love triangle",
  "forbidden love",
  "second chance",
  "unlikely duo",
  "underdog",
  "rags to riches",
  "rise and fall",
  "based on true story",
  "inspired by true events",
  "biographical",
  "world war",
  "cold war",
  "vietnam",
  "medieval",
  "ancient rome",
  "ancient greece",
  "ancient egypt",
  "viking",
  "samurai",
  "pirate",
  "cowboys",
  "wild west",
];

// =============================================================================
// Constants - Best For Occasions
// =============================================================================

/**
 * Best for occasion patterns
 *
 * Test cases:
 * "for date night" → "date night"
 * "movie night with friends" → "friends"
 * "family movie" → "family"
 */
const BEST_FOR_MAP: Record<string, string> = {
  "date night": "date night",
  "date movie": "date night",
  romantic: "date night",
  "girls night": "girls night",
  "girl's night": "girls night",
  "ladies night": "girls night",
  "guys night": "guys night",
  "guy's night": "guys night",
  "boys night": "guys night",
  "friends": "friends",
  "with friends": "friends",
  "movie night": "movie night",
  "family movie": "family",
  "family night": "family",
  "with family": "family",
  "for kids": "kids",
  "with kids": "kids",
  "kids movie": "kids",
  "children": "kids",
  solo: "solo",
  "alone": "solo",
  "solo watch": "solo",
  "by myself": "solo",
  background: "background",
  "background movie": "background",
  "while working": "background",
  party: "party",
  "party movie": "party",
  halloween: "halloween",
  "halloween night": "halloween",
  christmas: "christmas",
  "christmas movie": "christmas",
  holiday: "holiday",
  "holiday movie": "holiday",
  "rainy day": "rainy day",
  weekend: "weekend",
  "lazy sunday": "weekend",
  "airplane": "travel",
  "flight": "travel",
  "travel": "travel",
};

// =============================================================================
// Regex Patterns
// =============================================================================

const FILTER_PATTERNS = {
  // Year patterns
  year: /\b(19[5-9]\d|20[0-2]\d)\b/,
  decade: /\b(19[5-9]0s|20[0-2]0s)\b/i,
  fromYear: /\bfrom\s+(19[5-9]\d|20[0-2]\d)\b/i,
  beforeYear: /\bbefore\s+(19[5-9]\d|20[0-2]\d)\b/i,
  afterYear: /\bafter\s+(19[5-9]\d|20[0-2]\d)\b/i,
  yearRange: /\b(19[5-9]\d|20[0-2]\d)\s*[-–]\s*(19[5-9]\d|20[0-2]\d)\b/,

  // Genre patterns
  genre:
    /\b(action|comedy|drama|horror|thriller|romance|sci-fi|scifi|science fiction|fantasy|documentary|animation|animated|adventure|mystery|crime|war|western|musical|family|history|historical|romcom|rom-com|music)\b/gi,

  // Similar to patterns
  similarTo:
    /(?:similar\s+to|movies?\s+like|shows?\s+like|series\s+like|more\s+like|something\s+like)\s+["']?([^"']+?)["']?(?:\s*$|\s+(?:but|and|with|from|in)\b)/i,

  // Streaming service patterns
  streaming:
    /(?:on|available\s+on|streaming\s+on|watch\s+on)\s+(netflix|hulu|disney\s*\+?|disney\s*plus|amazon\s*prime|prime\s*video|prime|hbo\s*max|hbo|max|apple\s*tv\+?|peacock|paramount\s*\+?|paramount\s*plus|showtime|starz|crunchyroll|funimation|tubi|pluto\s*tv?|roku|britbox|acorn\s*tv?|mubi|criterion|shudder)/i,

  // Language patterns
  // "in French", "Korean movies", "Japanese anime", "films in Spanish"
  language:
    /(?:in\s+)?(korean|south\s+korean|japanese|chinese|mandarin|cantonese|french|german|spanish|italian|portuguese|russian|polish|dutch|swedish|norwegian|danish|finnish|hindi|tamil|telugu|arabic|persian|farsi|thai|vietnamese|indonesian|filipino|tagalog|hebrew|turkish|greek|czech|hungarian|romanian|ukrainian|english|american|british|bengali|punjabi|marathi|urdu|malayalam|malay|taiwanese)(?:\s+(?:language|speaking|dubbed))?/gi,

  // Country patterns
  // "from Korea", "British films", "Bollywood movies"
  country:
    /(?:from\s+|made\s+in\s+)?(korean|south\s+korean|korea|south\s+korea|japanese|japan|chinese|china|hong\s+kong|taiwanese|taiwan|british|uk|united\s+kingdom|french|france|german|germany|italian|italy|spanish|spain|indian|india|bollywood|hollywood|american|usa|united\s+states|canadian|canada|australian|australia|brazilian|brazil|mexican|mexico|russian|russia|swedish|sweden|norwegian|norway|danish|denmark|polish|poland|dutch|netherlands|belgian|belgium|irish|ireland|scottish|welsh|nigerian|nigeria|nollywood|south\s+african|south\s+africa|iranian|iran|persian|israeli|israel|thai|thailand|vietnamese|vietnam|indonesian|indonesia|filipino|philippines|philippine|new\s+zealand|kiwi|turkish|turkey|greek|greece|egyptian|egypt|lebanese|lebanon|argentinian?|argentina|chilean|chile|colombian|colombia|pakistani|pakistan|bangladeshi|bangladesh|hungarian|hungary|czech|romanian|romania|ukrainian|ukraine|saudi|saudi\s+arabian)/gi,

  // Cast patterns
  // "with Tom Hanks", "starring Emma Stone", "featuring Keanu Reeves"
  // "Tom Hanks movies", "Emma Stone films"
  cast: /(?:with|starring|featuring|played\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)*)/i,
  castPossessive: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:'s?\s+(?:movies?|films?|shows?))/i,

  // Director patterns
  // "by Nolan", "directed by Spielberg", "Tarantino films"
  director:
    /(?:directed\s+by|by|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)|([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:films?|movies?|directed)/i,

  // Runtime patterns
  // "short films", "under 2 hours", "less than 90 minutes", "long movies"
  runtimeShort: /\b(short\s+(?:films?|movies?)|under\s+(\d+)\s*(?:hours?|hr|minutes?|min)|less\s+than\s+(\d+)\s*(?:hours?|hr|minutes?|min)|quick\s+watch)\b/i,
  runtimeLong: /\b(long\s+(?:films?|movies?)|over\s+(\d+)\s*(?:hours?|hr|minutes?|min)|more\s+than\s+(\d+)\s*(?:hours?|hr|minutes?|min)|epic(?:\s+length)?)\b/i,

  // Rating patterns
  // "highly rated", "top rated", "8+ rating", "9 star"
  ratingHigh: /\b(highly\s+rated|top\s+rated|critically\s+acclaimed|well\s+received|must\s+see|must-see|masterpiece|masterpieces)\b/i,
  ratingSpecific: /\b(\d+(?:\.\d)?)\+?\s*(?:star|rating|rated|\/10|out\s+of\s+10)\b/i,

  // Network patterns
  // "HBO shows", "Netflix originals", "BBC series"
  network:
    /\b(hbo|showtime|starz|cinemax|amc|fx|usa\s+network|syfy|tnt|tbs|bravo|comedy\s+central|mtv|vh1|bet|hallmark|lifetime|history(?:\s+channel)?|discovery|tlc|hgtv|food\s+network|espn|cartoon(?:\s+network)?|adult\s+swim|nickelodeon|nick|nbc|abc|cbs|fox|cw|the\s+cw|pbs|netflix|hulu|amazon(?:\s+prime)?|prime\s+video|apple\s+tv\+?|disney\+?|peacock|paramount\+?|max|bbc|itv|channel\s+4|sky|arte|canal\+?|ard|zdf|rai|nhk|tvn|jtbc|kbs|mbc|sbs)\s+(?:shows?|series|originals?|programs?|content)/i,

  // Collection/franchise patterns
  // "Marvel movies", "MCU films", "Star Wars"
  collection:
    /\b(marvel|mcu|avengers|dc|dceu|batman|superman|spider-?man|x-?men|star\s+wars|star\s+trek|alien|terminator|transformers|jurassic(?:\s+(?:park|world))?|matrix|mad\s+max|dune|blade\s+runner|harry\s+potter|lord\s+of\s+the\s+rings|lotr|hobbit|narnia|james\s+bond|bond|007|mission\s+impossible|fast\s+(?:and|&)?\s*furious|john\s+wick|bourne|indiana\s+jones|rocky|rambo|die\s+hard|lethal\s+weapon|pirates(?:\s+of\s+the\s+caribbean)?|conjuring|insidious|paranormal(?:\s+activity)?|saw|halloween|scream|final\s+destination|purge|pixar|disney(?:\s+animation)?|dreamworks|shrek|toy\s+story|ice\s+age|kung\s+fu\s+panda|studio\s+ghibli|ghibli|miyazaki|monty\s+python|hangover|ocean'?s|godfather|planet\s+earth|twilight|hunger\s+games|maze\s+runner|divergent|fifty\s+shades|nolan|tarantino|back\s+to\s+the\s+future|planet\s+of\s+the\s+apes|despicable\s+me|minions|how\s+to\s+train\s+your\s+dragon|finding\s+(?:nemo|dory)|american\s+pie|dark\s+knight)\b/i,

  // Content warning patterns
  contentWarning:
    /\b(family\s+friendly|kid\s+safe|kid\s+friendly|child\s+safe|children\s+friendly|no\s+violence|avoid\s+violence|no\s+gore|avoid\s+gore|no\s+blood|no\s+jump\s*scares?|avoid\s+jump\s*scares?|no\s+scary|not\s+scary|no\s+nudity|avoid\s+nudity|no\s+sex|avoid\s+sex|no\s+language|clean\s+language|no\s+swearing|no\s+drugs|avoid\s+drugs|pg(?:-13)?)\b/i,

  // Best for patterns
  bestFor:
    /(?:for\s+|good\s+for\s+|perfect\s+for\s+|great\s+for\s+)?(date\s+night|date\s+movie|romantic|girls?\s+night|ladies\s+night|guys?\s+night|boys\s+night|with\s+friends|friends|movie\s+night|family\s+(?:movie|night)|with\s+(?:family|kids)|for\s+kids|kids\s+movie|children|solo(?:\s+watch)?|alone|by\s+myself|background(?:\s+movie)?|while\s+working|party(?:\s+movie)?|halloween(?:\s+night)?|christmas(?:\s+movie)?|holiday(?:\s+movie)?|rainy\s+day|weekend|lazy\s+sunday|airplane|flight|travel)\b/i,

  // Mood/pacing patterns
  moodPacing: /\b(slow\s*burn|fast\s*paced|action[\s-]*packed|leisurely|meditative|contemplative|breakneck|rapid[\s-]*fire|methodical|deliberate)\b/i,
  moodIntensity: /\b(intense|light|heavy|mild|extreme|subtle|powerful|overwhelming|relaxed|casual|gripping|edge[\s-]*of[\s-]*your[\s-]*seat)\b/i,
  moodTone: /\b(dark\s+(?:and\s+)?gritty|dark|light(?:hearted)?|comedic|serious|bleak|hopeful|cynical|optimistic|pessimistic|whimsical|quirky|absurd|surreal|realistic|grim)\b/i,

  // Series status patterns
  seriesStatus: /\b(completed?\s+series|finished\s+shows?|ended\s+series|concluded|ongoing\s+series|currently\s+airing|still\s+running|active\s+series|cancelled\s+shows?|axed)\b/i,

  // Season count patterns
  seasonCount:
    /\b(short\s+series|miniseries|mini[\s-]*series|limited\s+series|one\s+season|single\s+season|long[\s-]*running(?:\s+(?:shows?|series))?|many\s+seasons|(\d+)\+?\s+seasons?)\b/i,
};

// =============================================================================
// Helper Functions - Existing
// =============================================================================

/**
 * Extract and normalize genres from query, including synonym expansion
 */
function extractGenres(query: string): { genres: string[]; cleanedQuery: string } {
  const normalized = query.toLowerCase();
  let cleanedQuery = normalized;
  const genres = new Set<string>();

  // First, check for synonym matches (longer phrases first)
  const sortedSynonyms = Object.keys(GENRE_SYNONYMS).sort((a, b) => b.length - a.length);

  for (const synonym of sortedSynonyms) {
    const regex = new RegExp(`\\b${synonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(cleanedQuery)) {
      const mappedGenres = GENRE_SYNONYMS[synonym];
      mappedGenres.forEach((g) => genres.add(g));
      cleanedQuery = cleanedQuery.replace(regex, " ").trim();
    }
  }

  // Then check for direct genre matches
  const genreMatches = cleanedQuery.match(FILTER_PATTERNS.genre);
  if (genreMatches) {
    for (const match of genreMatches) {
      const lowerMatch = match.toLowerCase();
      // Check if it's a synonym first
      if (GENRE_SYNONYMS[lowerMatch]) {
        GENRE_SYNONYMS[lowerMatch].forEach((g) => genres.add(g));
      } else {
        // Map "animated" to "animation", "historical" to "history"
        const genreMap: Record<string, string> = {
          animated: "animation",
          historical: "history",
          "sci-fi": "science fiction",
          scifi: "science fiction",
        };
        genres.add(genreMap[lowerMatch] || lowerMatch);
      }
      // Remove the genre from the query
      const removeRegex = new RegExp(`\\b${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      cleanedQuery = cleanedQuery.replace(removeRegex, " ");
    }
  }

  // Clean up extra spaces
  cleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim();

  return {
    genres: [...genres],
    cleanedQuery,
  };
}

/**
 * Extract "similar to X" pattern from query
 */
function extractSimilarTo(query: string): {
  similarTo?: { title: string; resolvedId?: number };
  cleanedQuery: string;
} {
  // Multiple patterns to catch different phrasings
  const patterns = [
    // "similar to X", "movies like X", "shows like X", "more like X", "something like X"
    /(?:similar\s+to|movies?\s+like|shows?\s+like|series\s+like|more\s+like|something\s+like)\s+["']?(.+?)["']?(?:\s*$)/i,
    // Same patterns but with trailing qualifiers
    /(?:similar\s+to|movies?\s+like|shows?\s+like|series\s+like|more\s+like|something\s+like)\s+["']?(.+?)["']?\s+(?:but|and|with|from|in|that)\b/i,
  ];

  let cleanedQuery = query;

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const title = match[1].trim();
      // Remove the matched portion from the query
      cleanedQuery = query.replace(match[0], "").trim();
      // Also remove leading "movies", "shows", etc. if that's all that's left
      cleanedQuery = cleanedQuery.replace(/^(movies?|shows?|series|films?)\s*/i, "").trim();

      return {
        similarTo: { title },
        cleanedQuery: cleanedQuery || "similar movies",
      };
    }
  }

  return { cleanedQuery };
}

/**
 * Extract streaming service from query
 */
function extractStreamingService(query: string): {
  streamingService?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.streaming);

  if (match) {
    const rawService = match[1].toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedService =
      STREAMING_SERVICES[rawService] || STREAMING_SERVICES[rawService.replace(/\s+/g, "")];

    if (normalizedService) {
      const cleanedQuery = query.replace(match[0], "").trim();
      return {
        streamingService: normalizedService,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

// =============================================================================
// Helper Functions - New
// =============================================================================

/**
 * Extract language from query
 *
 * Test cases:
 * "Korean movies" → { language: "ko", cleanedQuery: "movies" }
 * "French films" → { language: "fr", cleanedQuery: "films" }
 * "in Spanish" → { language: "es", cleanedQuery: "" }
 * "Japanese anime" → { language: "ja", cleanedQuery: "anime" }
 */
function extractLanguage(query: string): {
  language?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.language);

  if (match) {
    const langName = match[0].toLowerCase().replace(/^in\s+/, "").replace(/\s+(?:language|speaking|dubbed)$/, "").trim();
    const langCode = LANGUAGE_MAP[langName];

    if (langCode) {
      const cleanedQuery = query.replace(new RegExp(match[0], "i"), " ").replace(/\s+/g, " ").trim();
      return {
        language: langCode,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract country from query
 *
 * Test cases:
 * "from Korea" → { country: "KR", cleanedQuery: "" }
 * "British films" → { country: "GB", cleanedQuery: "films" }
 * "Bollywood movies" → { country: "IN", cleanedQuery: "movies" }
 */
function extractCountry(query: string): {
  country?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.country);

  if (match) {
    const countryName = match[0].toLowerCase().replace(/^(?:from|made\s+in)\s+/, "").trim();
    const countryCode = COUNTRY_MAP[countryName];

    if (countryCode) {
      const cleanedQuery = query.replace(new RegExp(match[0], "i"), " ").replace(/\s+/g, " ").trim();
      return {
        country: countryCode,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract cast members from query
 *
 * Test cases:
 * "with Tom Hanks" → { cast: ["Tom Hanks"], cleanedQuery: "" }
 * "starring Emma Stone and Ryan Gosling" → { cast: ["Emma Stone", "Ryan Gosling"], cleanedQuery: "" }
 * "Tom Hanks movies" → { cast: ["Tom Hanks"], cleanedQuery: "movies" }
 */
function extractCast(query: string): {
  cast?: string[];
  cleanedQuery: string;
} {
  let cleanedQuery = query;
  const cast: string[] = [];

  // Try "with X", "starring X", "featuring X" pattern
  const castMatch = query.match(FILTER_PATTERNS.cast);
  if (castMatch) {
    const namesStr = castMatch[1];
    // Split on " and " to get multiple names
    const names = namesStr.split(/\s+and\s+/i).map((n) => n.trim()).filter(Boolean);
    cast.push(...names);
    cleanedQuery = cleanedQuery.replace(castMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Try "X's movies" pattern
  const possessiveMatch = cleanedQuery.match(FILTER_PATTERNS.castPossessive);
  if (possessiveMatch && cast.length === 0) {
    cast.push(possessiveMatch[1].trim());
    cleanedQuery = cleanedQuery.replace(possessiveMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  if (cast.length > 0) {
    return { cast, cleanedQuery };
  }

  return { cleanedQuery: query };
}

/**
 * Extract director from query
 *
 * Test cases:
 * "by Nolan" → { director: "Nolan", cleanedQuery: "" }
 * "directed by Spielberg" → { director: "Spielberg", cleanedQuery: "" }
 * "Tarantino films" → { director: "Tarantino", cleanedQuery: "films" }
 */
function extractDirector(query: string): {
  director?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.director);

  if (match) {
    // match[1] is "directed by X" capture, match[2] is "X films" capture
    const director = (match[1] || match[2])?.trim();

    if (director) {
      const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
      return {
        director,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract runtime constraints from query
 *
 * Test cases:
 * "short films" → { runtime: { max: 40 }, cleanedQuery: "films" }
 * "under 2 hours" → { runtime: { max: 120 }, cleanedQuery: "" }
 * "long movies" → { runtime: { min: 150 }, cleanedQuery: "movies" }
 * "quick watch" → { runtime: { max: 100 }, cleanedQuery: "" }
 */
function extractRuntime(query: string): {
  runtime?: { min?: number; max?: number };
  cleanedQuery: string;
} {
  let cleanedQuery = query;

  // Check for short film patterns
  const shortMatch = query.match(FILTER_PATTERNS.runtimeShort);
  if (shortMatch) {
    let maxRuntime: number;

    if (shortMatch[2]) {
      // "under X hours/minutes"
      const value = parseInt(shortMatch[2]);
      maxRuntime = shortMatch[0].toLowerCase().includes("hour") ? value * 60 : value;
    } else if (shortMatch[3]) {
      // "less than X hours/minutes"
      const value = parseInt(shortMatch[3]);
      maxRuntime = shortMatch[0].toLowerCase().includes("hour") ? value * 60 : value;
    } else if (shortMatch[0].toLowerCase().includes("quick")) {
      maxRuntime = 100;
    } else {
      // "short films"
      maxRuntime = 40;
    }

    cleanedQuery = cleanedQuery.replace(shortMatch[0], " ").replace(/\s+/g, " ").trim();
    return {
      runtime: { max: maxRuntime },
      cleanedQuery,
    };
  }

  // Check for long film patterns
  const longMatch = query.match(FILTER_PATTERNS.runtimeLong);
  if (longMatch) {
    let minRuntime: number;

    if (longMatch[2]) {
      // "over X hours/minutes"
      const value = parseInt(longMatch[2]);
      minRuntime = longMatch[0].toLowerCase().includes("hour") ? value * 60 : value;
    } else if (longMatch[3]) {
      // "more than X hours/minutes"
      const value = parseInt(longMatch[3]);
      minRuntime = longMatch[0].toLowerCase().includes("hour") ? value * 60 : value;
    } else {
      // "long movies", "epic"
      minRuntime = 150;
    }

    cleanedQuery = cleanedQuery.replace(longMatch[0], " ").replace(/\s+/g, " ").trim();
    return {
      runtime: { min: minRuntime },
      cleanedQuery,
    };
  }

  return { cleanedQuery: query };
}

/**
 * Extract minimum rating from query
 *
 * Test cases:
 * "highly rated" → { minRating: 7.5, cleanedQuery: "" }
 * "top rated" → { minRating: 7.5, cleanedQuery: "" }
 * "8+ rating" → { minRating: 8.0, cleanedQuery: "" }
 * "9 star movies" → { minRating: 9.0, cleanedQuery: "movies" }
 */
function extractRating(query: string): {
  minRating?: number;
  cleanedQuery: string;
} {
  let cleanedQuery = query;

  // Check for high rating keywords
  const highMatch = query.match(FILTER_PATTERNS.ratingHigh);
  if (highMatch) {
    cleanedQuery = cleanedQuery.replace(highMatch[0], " ").replace(/\s+/g, " ").trim();
    return {
      minRating: 7.5,
      cleanedQuery,
    };
  }

  // Check for specific rating values
  const specificMatch = query.match(FILTER_PATTERNS.ratingSpecific);
  if (specificMatch) {
    const rating = parseFloat(specificMatch[1]);
    if (rating >= 1 && rating <= 10) {
      cleanedQuery = cleanedQuery.replace(specificMatch[0], " ").replace(/\s+/g, " ").trim();
      return {
        minRating: rating,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract TV network from query
 *
 * Test cases:
 * "HBO shows" → { network: "HBO", cleanedQuery: "" }
 * "Netflix originals" → { network: "Netflix", cleanedQuery: "" }
 * "BBC series" → { network: "BBC", cleanedQuery: "" }
 */
function extractNetwork(query: string): {
  network?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.network);

  if (match) {
    const networkName = match[1].toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedNetwork = NETWORK_MAP[networkName] || NETWORK_MAP[networkName.replace(/\s+/g, "")];

    if (normalizedNetwork) {
      const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
      return {
        network: normalizedNetwork,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract collection/franchise from query
 *
 * Test cases:
 * "Marvel movies" → { collection: "Marvel Cinematic Universe", cleanedQuery: "movies" }
 * "MCU films" → { collection: "Marvel Cinematic Universe", cleanedQuery: "films" }
 * "Star Wars" → { collection: "Star Wars", cleanedQuery: "" }
 */
function extractCollection(query: string): {
  collection?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.collection);

  if (match) {
    const collectionName = match[0].toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedCollection =
      COLLECTION_MAP[collectionName] || COLLECTION_MAP[collectionName.replace(/\s+/g, "")];

    if (normalizedCollection) {
      const cleanedQuery = query.replace(new RegExp(match[0], "i"), " ").replace(/\s+/g, " ").trim();
      return {
        collection: normalizedCollection,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract content warnings from query
 *
 * Test cases:
 * "family friendly movies" → { contentWarnings: ["violence", "gore", "sexual", "language"], cleanedQuery: "movies" }
 * "no gore horror" → { contentWarnings: ["gore"], cleanedQuery: "horror" }
 */
function extractContentWarnings(query: string): {
  contentWarnings?: string[];
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.contentWarning);

  if (match) {
    const warningKey = match[0].toLowerCase().replace(/\s+/g, " ").trim();
    const warnings = CONTENT_WARNING_MAP[warningKey];

    if (warnings) {
      const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
      return {
        contentWarnings: warnings,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract keywords/themes from query
 *
 * Test cases:
 * "about time travel" → { keywords: ["time travel"], cleanedQuery: "about" }
 * "zombie movies" → { keywords: ["zombie"], cleanedQuery: "movies" }
 * "heist films with car chases" → { keywords: ["heist"], cleanedQuery: "films with car chases" }
 */
function extractKeywords(query: string): {
  keywords?: string[];
  cleanedQuery: string;
} {
  const keywords: string[] = [];
  let cleanedQuery = query.toLowerCase();

  // Sort by length (longest first) to avoid partial matches
  const sortedPatterns = [...KEYWORD_PATTERNS].sort((a, b) => b.length - a.length);

  for (const keyword of sortedPatterns) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "gi");
    if (regex.test(cleanedQuery)) {
      keywords.push(keyword);
      cleanedQuery = cleanedQuery.replace(regex, " ").replace(/\s+/g, " ").trim();
    }
  }

  if (keywords.length > 0) {
    return { keywords, cleanedQuery };
  }

  return { cleanedQuery: query };
}

/**
 * Extract "best for" occasion from query
 *
 * Test cases:
 * "for date night" → { bestFor: "date night", cleanedQuery: "" }
 * "family movie night" → { bestFor: "family", cleanedQuery: "movie night" }
 * "good for solo watch" → { bestFor: "solo", cleanedQuery: "good" }
 */
function extractBestFor(query: string): {
  bestFor?: string;
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.bestFor);

  if (match) {
    const occasionKey = match[0].toLowerCase().replace(/^(?:for|good\s+for|perfect\s+for|great\s+for)\s+/, "").replace(/\s+/g, " ").trim();
    const bestFor = BEST_FOR_MAP[occasionKey];

    if (bestFor) {
      const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
      return {
        bestFor,
        cleanedQuery,
      };
    }
  }

  return { cleanedQuery: query };
}

/**
 * Extract mood (pacing, intensity, tone) from query
 *
 * Test cases:
 * "slow burn thriller" → { mood: { pacing: "slow" }, cleanedQuery: "thriller" }
 * "fast paced action" → { mood: { pacing: "fast" }, cleanedQuery: "action" }
 * "intense drama" → { mood: { intensity: "intense" }, cleanedQuery: "drama" }
 * "dark and gritty crime" → { mood: { tone: "dark" }, cleanedQuery: "crime" }
 */
function extractMood(query: string): {
  mood?: ExtractedFilters["mood"];
  cleanedQuery: string;
} {
  let cleanedQuery = query;
  const mood: ExtractedFilters["mood"] = {};

  // Extract pacing
  const pacingMatch = query.match(FILTER_PATTERNS.moodPacing);
  if (pacingMatch) {
    const pacingStr = pacingMatch[0].toLowerCase();
    if (pacingStr.includes("slow") || pacingStr.includes("leisurely") || pacingStr.includes("meditative") || pacingStr.includes("contemplative") || pacingStr.includes("methodical") || pacingStr.includes("deliberate")) {
      mood.pacing = "slow";
    } else if (pacingStr.includes("fast") || pacingStr.includes("action") || pacingStr.includes("breakneck") || pacingStr.includes("rapid")) {
      mood.pacing = "fast";
    }
    cleanedQuery = cleanedQuery.replace(pacingMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Extract intensity
  const intensityMatch = cleanedQuery.match(FILTER_PATTERNS.moodIntensity);
  if (intensityMatch) {
    const intensityStr = intensityMatch[0].toLowerCase();
    if (intensityStr.includes("intense") || intensityStr.includes("heavy") || intensityStr.includes("extreme") || intensityStr.includes("powerful") || intensityStr.includes("overwhelming") || intensityStr.includes("gripping") || intensityStr.includes("edge")) {
      mood.intensity = "intense";
    } else if (intensityStr.includes("light") || intensityStr.includes("mild") || intensityStr.includes("subtle") || intensityStr.includes("relaxed") || intensityStr.includes("casual")) {
      mood.intensity = "light";
    }
    cleanedQuery = cleanedQuery.replace(intensityMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Extract tone
  const toneMatch = cleanedQuery.match(FILTER_PATTERNS.moodTone);
  if (toneMatch) {
    const toneStr = toneMatch[0].toLowerCase();
    if (toneStr.includes("dark") || toneStr.includes("gritty") || toneStr.includes("bleak") || toneStr.includes("grim")) {
      mood.tone = "dark";
    } else if (toneStr.includes("light") || toneStr.includes("hopeful") || toneStr.includes("optimistic") || toneStr.includes("whimsical")) {
      mood.tone = "light";
    } else if (toneStr.includes("comedic") || toneStr.includes("quirky") || toneStr.includes("absurd")) {
      mood.tone = "comedic";
    } else if (toneStr.includes("serious") || toneStr.includes("realistic") || toneStr.includes("cynical") || toneStr.includes("pessimistic")) {
      mood.tone = "serious";
    } else if (toneStr.includes("gritty")) {
      mood.tone = "gritty";
    }
    cleanedQuery = cleanedQuery.replace(toneMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  if (Object.keys(mood).length > 0) {
    return { mood, cleanedQuery };
  }

  return { cleanedQuery: query };
}

/**
 * Extract series status from query
 *
 * Test cases:
 * "completed series" → { seriesStatus: "ended", cleanedQuery: "" }
 * "ongoing series" → { seriesStatus: "returning", cleanedQuery: "" }
 * "cancelled shows" → { seriesStatus: "cancelled", cleanedQuery: "" }
 */
function extractSeriesStatus(query: string): {
  seriesStatus?: "returning" | "ended" | "cancelled";
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.seriesStatus);

  if (match) {
    const statusStr = match[0].toLowerCase();
    let status: "returning" | "ended" | "cancelled";

    if (statusStr.includes("complet") || statusStr.includes("finish") || statusStr.includes("ended") || statusStr.includes("conclud")) {
      status = "ended";
    } else if (statusStr.includes("ongoing") || statusStr.includes("airing") || statusStr.includes("running") || statusStr.includes("active")) {
      status = "returning";
    } else if (statusStr.includes("cancel") || statusStr.includes("axed")) {
      status = "cancelled";
    } else {
      return { cleanedQuery: query };
    }

    const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
    return {
      seriesStatus: status,
      cleanedQuery,
    };
  }

  return { cleanedQuery: query };
}

/**
 * Extract season count constraints from query
 *
 * Test cases:
 * "short series" → { seasonCount: { max: 2 }, cleanedQuery: "" }
 * "miniseries" → { seasonCount: { max: 1 }, cleanedQuery: "" }
 * "long running shows" → { seasonCount: { min: 5 }, cleanedQuery: "" }
 * "3+ seasons" → { seasonCount: { min: 3 }, cleanedQuery: "" }
 */
function extractSeasonCount(query: string): {
  seasonCount?: { min?: number; max?: number };
  cleanedQuery: string;
} {
  const match = query.match(FILTER_PATTERNS.seasonCount);

  if (match) {
    const statusStr = match[0].toLowerCase();
    let seasonCount: { min?: number; max?: number };

    if (statusStr.includes("short") || statusStr.includes("limited")) {
      seasonCount = { max: 2 };
    } else if (statusStr.includes("mini") || statusStr.includes("one season") || statusStr.includes("single season")) {
      seasonCount = { max: 1 };
    } else if (statusStr.includes("long") || statusStr.includes("many")) {
      seasonCount = { min: 5 };
    } else if (match[2]) {
      // Specific number like "3+ seasons"
      seasonCount = { min: parseInt(match[2]) };
    } else {
      return { cleanedQuery: query };
    }

    const cleanedQuery = query.replace(match[0], " ").replace(/\s+/g, " ").trim();
    return {
      seasonCount,
      cleanedQuery,
    };
  }

  return { cleanedQuery: query };
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Analyze a search query to determine user intent.
 *
 * @example
 * // Title lookup
 * classifyQueryIntent("The Dark Knight")
 * // → { intent: "title", confidence: 0.8, isExactLookup: true, needsLlmParsing: false }
 *
 * @example
 * // Semantic search
 * classifyQueryIntent("mind-bending sci-fi about dreams")
 * // → { intent: "semantic", confidence: 0.85, extractedFilters: { genres: ["science fiction"] },
 * //     cleanedQuery: "mind-bending about dreams", needsLlmParsing: false }
 *
 * @example
 * // Language filter
 * classifyQueryIntent("Korean thrillers")
 * // → { extractedFilters: { language: "ko", genres: ["thriller"] }, cleanedQuery: "" }
 *
 * @example
 * // Country filter
 * classifyQueryIntent("British comedies")
 * // → { extractedFilters: { country: "GB", genres: ["comedy"] }, cleanedQuery: "" }
 *
 * @example
 * // Cast filter
 * classifyQueryIntent("movies with Tom Hanks and Meg Ryan")
 * // → { extractedFilters: { cast: ["Tom Hanks", "Meg Ryan"] }, cleanedQuery: "movies" }
 *
 * @example
 * // Director filter
 * classifyQueryIntent("directed by Christopher Nolan")
 * // → { extractedFilters: { director: "Christopher Nolan" }, cleanedQuery: "" }
 *
 * @example
 * // Runtime filter
 * classifyQueryIntent("short films under 2 hours")
 * // → { extractedFilters: { runtime: { max: 40 } }, cleanedQuery: "films" }
 *
 * @example
 * // Rating filter
 * classifyQueryIntent("highly rated comedies")
 * // → { extractedFilters: { minRating: 7.5, genres: ["comedy"] }, cleanedQuery: "" }
 *
 * @example
 * // Network filter
 * classifyQueryIntent("HBO shows")
 * // → { extractedFilters: { network: "HBO" }, cleanedQuery: "" }
 *
 * @example
 * // Collection filter
 * classifyQueryIntent("Marvel movies")
 * // → { extractedFilters: { collection: "Marvel Cinematic Universe" }, cleanedQuery: "movies" }
 *
 * @example
 * // Content warning filter
 * classifyQueryIntent("family friendly horror")
 * // → { extractedFilters: { contentWarnings: ["violence", "gore", "sexual", "language"], genres: ["horror"] } }
 *
 * @example
 * // Mood filter
 * classifyQueryIntent("slow burn thriller")
 * // → { extractedFilters: { mood: { pacing: "slow" }, genres: ["thriller"] }, cleanedQuery: "" }
 *
 * @example
 * // Series status filter
 * classifyQueryIntent("completed series")
 * // → { extractedFilters: { seriesStatus: "ended" }, cleanedQuery: "" }
 *
 * @example
 * // Season count filter
 * classifyQueryIntent("short series miniseries")
 * // → { extractedFilters: { seasonCount: { max: 1 } }, cleanedQuery: "" }
 *
 * @example
 * // Best for filter
 * classifyQueryIntent("movies for date night")
 * // → { extractedFilters: { bestFor: "date night" }, cleanedQuery: "movies" }
 *
 * @example
 * // Keywords filter
 * classifyQueryIntent("movies about time travel")
 * // → { extractedFilters: { keywords: ["time travel"] }, cleanedQuery: "movies about" }
 */
/**
 * Words that carry no search signal on their own. A post-extraction residual
 * made up entirely of these (e.g. "the" after stripping "lord of the rings",
 * or "movies" after stripping "marvel") must not be used as the search text.
 */
const GENERIC_RESIDUAL_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "in",
  "on",
  "movie",
  "movies",
  "film",
  "films",
  "show",
  "shows",
  "series",
  "tv",
]);

/** True if the residual is empty or contains only generic/stopword tokens. */
function isGenericResidual(residual: string): boolean {
  if (!residual) return true;
  const words = residual.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => GENERIC_RESIDUAL_WORDS.has(w));
}

export function classifyQueryIntent(query: string): IntentAnalysis {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);

  // Default result
  const result: IntentAnalysis = {
    intent: "mixed",
    confidence: 0.5,
    isExactLookup: false,
    cleanedQuery: query.trim(),
    extractedFilters: {},
    needsLlmParsing: false,
  };

  if (!normalized || words.length === 0) {
    return result;
  }

  // ==========================================================================
  // Check for quoted exact title search
  // ==========================================================================
  if (/^["'].*["']$/.test(query.trim())) {
    return {
      intent: "title",
      confidence: 0.95,
      isExactLookup: true,
      cleanedQuery: query.trim().replace(/^["']|["']$/g, ""),
      needsLlmParsing: false,
    };
  }

  // ==========================================================================
  // Extract filters from query (order matters - more specific patterns first)
  // ==========================================================================
  const extractedFilters: ExtractedFilters = {};
  let cleanedQuery = normalized;

  // Extract "similar to X" pattern FIRST (before other filters strip context)
  const similarResult = extractSimilarTo(cleanedQuery);
  if (similarResult.similarTo) {
    extractedFilters.similarTo = similarResult.similarTo;
    cleanedQuery = similarResult.cleanedQuery;
  }

  // Extract streaming service
  const streamingResult = extractStreamingService(cleanedQuery);
  if (streamingResult.streamingService) {
    extractedFilters.streamingService = streamingResult.streamingService;
    cleanedQuery = streamingResult.cleanedQuery;
  }

  // Extract network (before language/country to catch "HBO shows" correctly)
  const networkResult = extractNetwork(cleanedQuery);
  if (networkResult.network) {
    extractedFilters.network = networkResult.network;
    cleanedQuery = networkResult.cleanedQuery;
  }

  // Extract collection/franchise
  const collectionResult = extractCollection(cleanedQuery);
  if (collectionResult.collection) {
    extractedFilters.collection = collectionResult.collection;
    cleanedQuery = collectionResult.cleanedQuery;
  }

  // Extract content warnings
  const contentWarningResult = extractContentWarnings(cleanedQuery);
  if (contentWarningResult.contentWarnings) {
    extractedFilters.contentWarnings = contentWarningResult.contentWarnings;
    cleanedQuery = contentWarningResult.cleanedQuery;
  }

  // Extract best for occasion
  const bestForResult = extractBestFor(cleanedQuery);
  if (bestForResult.bestFor) {
    extractedFilters.bestFor = bestForResult.bestFor;
    cleanedQuery = bestForResult.cleanedQuery;
  }

  // Extract mood (pacing, intensity, tone)
  const moodResult = extractMood(cleanedQuery);
  if (moodResult.mood) {
    extractedFilters.mood = moodResult.mood;
    cleanedQuery = moodResult.cleanedQuery;
  }

  // Extract series status
  const seriesStatusResult = extractSeriesStatus(cleanedQuery);
  if (seriesStatusResult.seriesStatus) {
    extractedFilters.seriesStatus = seriesStatusResult.seriesStatus;
    cleanedQuery = seriesStatusResult.cleanedQuery;
  }

  // Extract season count
  const seasonCountResult = extractSeasonCount(cleanedQuery);
  if (seasonCountResult.seasonCount) {
    extractedFilters.seasonCount = seasonCountResult.seasonCount;
    cleanedQuery = seasonCountResult.cleanedQuery;
  }

  // Extract rating
  const ratingResult = extractRating(cleanedQuery);
  if (ratingResult.minRating) {
    extractedFilters.minRating = ratingResult.minRating;
    cleanedQuery = ratingResult.cleanedQuery;
  }

  // Extract runtime
  const runtimeResult = extractRuntime(cleanedQuery);
  if (runtimeResult.runtime) {
    extractedFilters.runtime = runtimeResult.runtime;
    cleanedQuery = runtimeResult.cleanedQuery;
  }

  // Extract cast (before director to avoid conflicts)
  const castResult = extractCast(cleanedQuery);
  if (castResult.cast) {
    extractedFilters.cast = castResult.cast;
    cleanedQuery = castResult.cleanedQuery;
  }

  // Extract director
  const directorResult = extractDirector(cleanedQuery);
  if (directorResult.director) {
    extractedFilters.director = directorResult.director;
    cleanedQuery = directorResult.cleanedQuery;
  }

  // Extract language
  const languageResult = extractLanguage(cleanedQuery);
  if (languageResult.language) {
    extractedFilters.language = languageResult.language;
    cleanedQuery = languageResult.cleanedQuery;
  }

  // Extract country (after language since some words like "Korean" can be both)
  // Only extract if no language was extracted for that word
  if (!extractedFilters.language) {
    const countryResult = extractCountry(cleanedQuery);
    if (countryResult.country) {
      extractedFilters.country = countryResult.country;
      cleanedQuery = countryResult.cleanedQuery;
    }
  }

  // Extract keywords/themes
  const keywordsResult = extractKeywords(cleanedQuery);
  if (keywordsResult.keywords) {
    extractedFilters.keywords = keywordsResult.keywords;
    cleanedQuery = keywordsResult.cleanedQuery;
  }

  // Extract year range (e.g., "2010-2020")
  const yearRangeMatch = cleanedQuery.match(FILTER_PATTERNS.yearRange);
  if (yearRangeMatch) {
    extractedFilters.yearRange = [parseInt(yearRangeMatch[1]), parseInt(yearRangeMatch[2])];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.yearRange, "").trim();
  }

  // Extract from/after year
  const fromYearMatch = cleanedQuery.match(FILTER_PATTERNS.fromYear);
  if (fromYearMatch && !extractedFilters.yearRange) {
    const startYear = parseInt(fromYearMatch[1]);
    extractedFilters.yearRange = [startYear, new Date().getFullYear()];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.fromYear, "").trim();
  }

  const afterYearMatch = cleanedQuery.match(FILTER_PATTERNS.afterYear);
  if (afterYearMatch && !extractedFilters.yearRange) {
    const startYear = parseInt(afterYearMatch[1]) + 1;
    extractedFilters.yearRange = [startYear, new Date().getFullYear()];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.afterYear, "").trim();
  }

  // Extract before year
  const beforeYearMatch = cleanedQuery.match(FILTER_PATTERNS.beforeYear);
  if (beforeYearMatch && !extractedFilters.yearRange) {
    const endYear = parseInt(beforeYearMatch[1]) - 1;
    extractedFilters.yearRange = [1900, endYear];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.beforeYear, "").trim();
  }

  // Extract decade
  const decadeMatch = cleanedQuery.match(FILTER_PATTERNS.decade);
  if (decadeMatch && !extractedFilters.yearRange) {
    extractedFilters.decade = decadeMatch[0].toLowerCase();
    const decadeStart = parseInt(decadeMatch[0].replace(/s$/i, ""));
    extractedFilters.yearRange = [decadeStart, decadeStart + 9];
    cleanedQuery = cleanedQuery.replace(FILTER_PATTERNS.decade, "").trim();
  }

  // Extract standalone year (only if not already extracted as part of range)
  const yearMatch = cleanedQuery.match(FILTER_PATTERNS.year);
  if (yearMatch && !extractedFilters.yearRange && !extractedFilters.decade) {
    extractedFilters.year = parseInt(yearMatch[0]);
    // Don't remove year from query - it might be part of title like "2001: A Space Odyssey"
  }

  // Extract genres (with synonym expansion) and REMOVE from cleanedQuery
  const genreResult = extractGenres(cleanedQuery);
  if (genreResult.genres.length > 0) {
    extractedFilters.genres = genreResult.genres;
    cleanedQuery = genreResult.cleanedQuery;
  }

  // Handle "scary" as both semantic indicator AND horror genre
  if (/\bscary\b/i.test(normalized) && !extractedFilters.genres?.includes("horror")) {
    extractedFilters.genres = [...(extractedFilters.genres || []), "horror"];
    cleanedQuery = cleanedQuery.replace(/\bscary\b/gi, "").trim();
  }

  result.extractedFilters = extractedFilters;
  let finalCleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim();

  // If a collection/franchise was extracted and stripping it left only
  // stopwords/generic media words, search the collection NAME, never the
  // residual. June 2026: "the lord of the rings" → collection extracted,
  // cleanedQuery became literally "the" → the semantic leg searched "the" and
  // returned generic popular "The …" titles. The collection filter is display-
  // only downstream (not applied by semantic/fuzzy search), so cleanedQuery is
  // the only relevance signal for these queries.
  if (extractedFilters.collection && isGenericResidual(finalCleanedQuery)) {
    finalCleanedQuery = extractedFilters.collection;
  }

  result.cleanedQuery = finalCleanedQuery || query.trim();

  // Re-tokenize cleaned query for intent analysis
  const cleanedWords = result.cleanedQuery.toLowerCase().split(/\s+/).filter(Boolean);

  // ==========================================================================
  // Check for "similar to" intent (high priority)
  // ==========================================================================
  if (extractedFilters.similarTo) {
    return {
      intent: "semantic",
      confidence: 0.9,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // ==========================================================================
  // Check for person-focused query (director or cast extracted)
  // ==========================================================================
  if (extractedFilters.director || (extractedFilters.cast && extractedFilters.cast.length > 0)) {
    return {
      intent: "person",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // ==========================================================================
  // Check for person-focused query (by keyword indicators)
  // ==========================================================================
  const hasPersonIndicator = words.some((w) => PERSON_INDICATORS.has(w));

  if (hasPersonIndicator) {
    // Try to extract person name from original query
    const personPatterns = [
      /(?:by|directed by|starring|with|featuring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:'s?\s+(?:movies?|films?|shows?))/i,
    ];

    for (const pattern of personPatterns) {
      const match = query.match(pattern);
      if (match) {
        extractedFilters.person = match[1].trim();
        break;
      }
    }

    return {
      intent: "person",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // ==========================================================================
  // Count semantic indicators
  // ==========================================================================
  const semanticCount = words.filter((w) =>
    SEMANTIC_INDICATORS.has(w.replace(/[^a-z-]/g, ""))
  ).length;

  const hasGenres = Boolean(extractedFilters.genres?.length);
  const hasStreamingService = Boolean(extractedFilters.streamingService);
  const hasNetwork = Boolean(extractedFilters.network);
  const hasCollection = Boolean(extractedFilters.collection);
  const hasMood = Boolean(extractedFilters.mood);
  const hasKeywords = Boolean(extractedFilters.keywords?.length);
  const hasContentWarnings = Boolean(extractedFilters.contentWarnings?.length);
  const hasLanguage = Boolean(extractedFilters.language);
  const hasCountry = Boolean(extractedFilters.country);
  const hasRuntime = Boolean(extractedFilters.runtime);
  const hasRating = Boolean(extractedFilters.minRating);
  const hasSeriesFilters = Boolean(extractedFilters.seriesStatus || extractedFilters.seasonCount);
  const hasBestFor = Boolean(extractedFilters.bestFor);

  // Count total filters extracted
  const filterCount =
    (hasGenres ? 1 : 0) +
    (hasStreamingService ? 1 : 0) +
    (hasNetwork ? 1 : 0) +
    (hasCollection ? 1 : 0) +
    (hasMood ? 1 : 0) +
    (hasKeywords ? 1 : 0) +
    (hasContentWarnings ? 1 : 0) +
    (hasLanguage ? 1 : 0) +
    (hasCountry ? 1 : 0) +
    (hasRuntime ? 1 : 0) +
    (hasRating ? 1 : 0) +
    (hasSeriesFilters ? 1 : 0) +
    (hasBestFor ? 1 : 0);

  // ==========================================================================
  // Determine intent based on signals
  // ==========================================================================

  // Long, descriptive queries are likely semantic
  if (words.length > 5 || semanticCount >= 2 || (words.length >= 4 && semanticCount >= 1)) {
    const confidence = Math.min(0.5 + semanticCount * 0.15 + (words.length > 5 ? 0.15 : 0), 0.95);
    return {
      intent: "semantic",
      confidence,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: confidence < 0.6 && query.length > 10,
    };
  }

  // Queries with "similar to" or "like X" are semantic (secondary check)
  if (/\b(similar\s+to|like\s+\w+|movies?\s+like|shows?\s+like)\b/i.test(normalized)) {
    return {
      intent: "semantic",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Queries with filter patterns (year range, etc.) but no semantic indicators
  const hasYearFilters = Boolean(
    extractedFilters.year || extractedFilters.yearRange || extractedFilters.decade
  );

  // Multiple strong filters → filter intent
  if (filterCount >= 2 && semanticCount === 0) {
    return {
      intent: "filter",
      confidence: 0.8,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Year filters or streaming service with no semantic indicators → filter
  if ((hasYearFilters || hasStreamingService || hasNetwork) && semanticCount === 0 && !hasGenres) {
    return {
      intent: "filter",
      confidence: 0.75,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Single semantic indicator with filters → mixed
  if ((hasYearFilters || hasStreamingService || filterCount >= 1) && semanticCount === 1) {
    return {
      intent: "mixed",
      confidence: 0.65,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Genre + semantic indicator but no year → semantic (e.g., "dark thrillers")
  if (hasGenres && semanticCount >= 1) {
    const confidence = 0.7 + semanticCount * 0.1;
    return {
      intent: "semantic",
      confidence,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: confidence < 0.6 && query.length > 10,
    };
  }

  // Mood, keywords, best for, or content warnings → semantic (descriptive intent)
  if (hasMood || hasKeywords || hasBestFor || hasContentWarnings) {
    return {
      intent: "semantic",
      confidence: 0.75,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Language or country filter alone → filter (looking for specific origin content)
  if ((hasLanguage || hasCountry) && filterCount === 1) {
    return {
      intent: "filter",
      confidence: 0.7,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Collection filter → filter intent (looking for franchise)
  if (hasCollection) {
    return {
      intent: "filter",
      confidence: 0.85,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Genre only (after removal from query) with generic terms left → semantic
  // e.g., "horror movies" becomes cleanedQuery="movies", genres=["horror"]
  if (hasGenres && cleanedWords.length <= 2 && /^(movies?|films?|shows?|series)$/i.test(result.cleanedQuery)) {
    return {
      intent: "semantic",
      confidence: 0.75,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Streaming service with genre → filter
  if (hasStreamingService && hasGenres) {
    return {
      intent: "filter",
      confidence: 0.8,
      extractedFilters,
      isExactLookup: false,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: false,
    };
  }

  // Short queries without semantic indicators are likely title searches
  if (words.length <= 4 && semanticCount === 0 && filterCount === 0) {
    // Check if it looks like a title (Title Case or has "the", "a")
    const looksLikeTitle =
      /^(the|a|an)\s/i.test(query) ||
      words.every((w) => /^[A-Z]/.test(query.split(/\s+/)[words.indexOf(w)] || ""));

    const confidence = looksLikeTitle ? 0.8 : 0.65;
    return {
      intent: "title",
      confidence,
      extractedFilters,
      isExactLookup: words.length <= 2,
      cleanedQuery: result.cleanedQuery,
      needsLlmParsing: confidence < 0.6 && query.length > 10,
    };
  }

  // Default: mixed intent
  // Check if LLM parsing might help
  const needsLlmParsing = result.confidence < 0.6 && query.length > 10;

  return {
    intent: "mixed",
    confidence: 0.5,
    extractedFilters,
    isExactLookup: false,
    cleanedQuery: result.cleanedQuery,
    needsLlmParsing,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get search weights based on intent for hybrid search.
 * Returns weights for fuzzy vs semantic search.
 */
export function getSearchWeights(intent: QueryIntent): {
  fuzzy: number;
  semantic: number;
} {
  switch (intent) {
    case "title":
      // Title search: heavily favor fuzzy for exact/typo matching
      return { fuzzy: 0.85, semantic: 0.15 };
    case "semantic":
      // Semantic search: heavily favor semantic for meaning matching
      return { fuzzy: 0.2, semantic: 0.8 };
    case "person":
      // Person search: fuzzy for name matching
      return { fuzzy: 0.9, semantic: 0.1 };
    case "filter":
      // Filter search: balanced with slight semantic preference
      return { fuzzy: 0.35, semantic: 0.65 };
    case "mixed":
    default:
      // Mixed: balanced approach
      return { fuzzy: 0.45, semantic: 0.55 };
  }
}

/**
 * Convert decade string to year range.
 */
export function decadeToYearRange(decade: string): [number, number] {
  const match = decade.match(/(\d{4})s?/i);
  if (!match) return [1900, 2030];

  const startYear = parseInt(match[1]);
  // Handle "90s" → 1990s, "00s" → 2000s
  const normalizedStart =
    startYear < 100 ? (startYear < 30 ? 2000 + startYear : 1900 + startYear) : startYear;

  return [normalizedStart, normalizedStart + 9];
}

/**
 * Normalize a genre name to its canonical form
 */
export function normalizeGenre(genre: string): string[] {
  const lower = genre.toLowerCase();

  // Check synonym mapping first
  if (GENRE_SYNONYMS[lower]) {
    return GENRE_SYNONYMS[lower];
  }

  // Direct mappings
  const directMap: Record<string, string> = {
    animated: "animation",
    historical: "history",
  };

  if (directMap[lower]) {
    return [directMap[lower]];
  }

  return [lower];
}

/**
 * Get all recognized streaming services
 */
export function getStreamingServices(): string[] {
  return [...new Set(Object.values(STREAMING_SERVICES))];
}

/**
 * Get all recognized TV networks
 */
export function getNetworks(): string[] {
  return [...new Set(Object.values(NETWORK_MAP))];
}

/**
 * Get all recognized collections/franchises
 */
export function getCollections(): string[] {
  return [...new Set(Object.values(COLLECTION_MAP))];
}

/**
 * Get all recognized languages (returns ISO codes)
 */
export function getLanguages(): string[] {
  return [...new Set(Object.values(LANGUAGE_MAP))];
}

/**
 * Get all recognized countries (returns ISO codes)
 */
export function getCountries(): string[] {
  return [...new Set(Object.values(COUNTRY_MAP))];
}

// =============================================================================
// Tests (inline documentation)
// =============================================================================

/*
Test cases for classifyQueryIntent:

// Basic title lookup
classifyQueryIntent("The Dark Knight")
// → { intent: "title", confidence: 0.8, isExactLookup: true, needsLlmParsing: false }

// Quoted exact search
classifyQueryIntent('"Inception"')
// → { intent: "title", confidence: 0.95, isExactLookup: true, cleanedQuery: "Inception" }

// Genre extraction with removal
classifyQueryIntent("horror movies")
// → { intent: "semantic", extractedFilters: { genres: ["horror"] }, cleanedQuery: "movies" }

classifyQueryIntent("sci-fi action films")
// → { extractedFilters: { genres: ["science fiction", "action"] }, cleanedQuery: "films" }

// Genre synonym expansion
classifyQueryIntent("romcom movies")
// → { extractedFilters: { genres: ["comedy", "romance"] }, cleanedQuery: "movies" }

classifyQueryIntent("scary movies for halloween")
// → { extractedFilters: { genres: ["horror"] }, cleanedQuery: "movies for halloween" }

// Similar to detection
classifyQueryIntent("movies similar to Inception")
// → { intent: "semantic", confidence: 0.9, extractedFilters: { similarTo: { title: "Inception" } } }

classifyQueryIntent("shows like Breaking Bad")
// → { intent: "semantic", extractedFilters: { similarTo: { title: "Breaking Bad" } } }

classifyQueryIntent("more like The Matrix but newer")
// → { extractedFilters: { similarTo: { title: "The Matrix" } }, cleanedQuery: "but newer" }

// Streaming service extraction
classifyQueryIntent("comedies on Netflix")
// → { extractedFilters: { genres: ["comedy"], streamingService: "Netflix" }, cleanedQuery: "" }

classifyQueryIntent("horror movies available on disney plus")
// → { extractedFilters: { genres: ["horror"], streamingService: "Disney+" } }

classifyQueryIntent("streaming on hbo max")
// → { extractedFilters: { streamingService: "Max" } }

// Person search
classifyQueryIntent("movies directed by Christopher Nolan")
// → { intent: "person", extractedFilters: { director: "Christopher Nolan" } }

classifyQueryIntent("with Tom Hanks and Meg Ryan")
// → { intent: "person", extractedFilters: { cast: ["Tom Hanks", "Meg Ryan"] } }

// Year filters
classifyQueryIntent("thrillers from 2020")
// → { extractedFilters: { genres: ["thriller"], yearRange: [2020, 2026] } }

classifyQueryIntent("90s action movies")
// → { extractedFilters: { genres: ["action"], decade: "90s", yearRange: [1990, 1999] } }

// Language filter
classifyQueryIntent("Korean movies")
// → { extractedFilters: { language: "ko" }, cleanedQuery: "movies" }

classifyQueryIntent("French thrillers")
// → { extractedFilters: { language: "fr", genres: ["thriller"] } }

classifyQueryIntent("in Japanese")
// → { extractedFilters: { language: "ja" } }

// Country filter
classifyQueryIntent("from Korea")
// → { extractedFilters: { country: "KR" } }

classifyQueryIntent("British comedies")
// → { extractedFilters: { country: "GB", genres: ["comedy"] } }

classifyQueryIntent("Bollywood movies")
// → { extractedFilters: { country: "IN" }, cleanedQuery: "movies" }

// Runtime filter
classifyQueryIntent("short films")
// → { extractedFilters: { runtime: { max: 40 } }, cleanedQuery: "films" }

classifyQueryIntent("under 2 hours")
// → { extractedFilters: { runtime: { max: 120 } } }

classifyQueryIntent("long movies")
// → { extractedFilters: { runtime: { min: 150 } }, cleanedQuery: "movies" }

classifyQueryIntent("quick watch comedy")
// → { extractedFilters: { runtime: { max: 100 }, genres: ["comedy"] } }

// Rating filter
classifyQueryIntent("highly rated thrillers")
// → { extractedFilters: { minRating: 7.5, genres: ["thriller"] } }

classifyQueryIntent("top rated sci-fi")
// → { extractedFilters: { minRating: 7.5, genres: ["science fiction"] } }

classifyQueryIntent("8+ rating horror")
// → { extractedFilters: { minRating: 8, genres: ["horror"] } }

// Network filter
classifyQueryIntent("HBO shows")
// → { extractedFilters: { network: "HBO" } }

classifyQueryIntent("Netflix originals")
// → { extractedFilters: { network: "Netflix" } }

classifyQueryIntent("BBC series")
// → { extractedFilters: { network: "BBC" } }

// Collection/franchise filter
classifyQueryIntent("Marvel movies")
// → { extractedFilters: { collection: "Marvel Cinematic Universe" } }

classifyQueryIntent("Star Wars films")
// → { extractedFilters: { collection: "Star Wars" }, cleanedQuery: "films" }

classifyQueryIntent("MCU")
// → { extractedFilters: { collection: "Marvel Cinematic Universe" } }

// Content warning filter
classifyQueryIntent("family friendly horror")
// → { extractedFilters: { contentWarnings: ["violence", "gore", "sexual", "language"], genres: ["horror"] } }

classifyQueryIntent("no gore thrillers")
// → { extractedFilters: { contentWarnings: ["gore"], genres: ["thriller"] } }

// Keywords/themes filter
classifyQueryIntent("movies about time travel")
// → { extractedFilters: { keywords: ["time travel"] }, cleanedQuery: "movies about" }

classifyQueryIntent("zombie apocalypse films")
// → { extractedFilters: { keywords: ["zombie"], genres: ["horror"] } }

// Best for occasion filter
classifyQueryIntent("movies for date night")
// → { extractedFilters: { bestFor: "date night" }, cleanedQuery: "movies" }

classifyQueryIntent("family movie night")
// → { extractedFilters: { bestFor: "family" }, cleanedQuery: "movie night" }

// Mood filter
classifyQueryIntent("slow burn thriller")
// → { extractedFilters: { mood: { pacing: "slow" }, genres: ["thriller"] } }

classifyQueryIntent("fast paced action")
// → { extractedFilters: { mood: { pacing: "fast" }, genres: ["action"] } }

classifyQueryIntent("dark and gritty crime")
// → { extractedFilters: { mood: { tone: "dark" }, genres: ["crime"] } }

// Series status filter
classifyQueryIntent("completed series")
// → { extractedFilters: { seriesStatus: "ended" } }

classifyQueryIntent("ongoing series")
// → { extractedFilters: { seriesStatus: "returning" } }

classifyQueryIntent("cancelled shows")
// → { extractedFilters: { seriesStatus: "cancelled" } }

// Season count filter
classifyQueryIntent("short series")
// → { extractedFilters: { seasonCount: { max: 2 } } }

classifyQueryIntent("miniseries")
// → { extractedFilters: { seasonCount: { max: 1 } } }

classifyQueryIntent("long running shows")
// → { extractedFilters: { seasonCount: { min: 5 } } }

// Complex combined queries
classifyQueryIntent("sci-fi movies similar to Blade Runner on Netflix from the 80s")
// → { extractedFilters: {
//       genres: ["science fiction"],
//       similarTo: { title: "Blade Runner" },
//       streamingService: "Netflix",
//       decade: "80s",
//       yearRange: [1980, 1989]
//     } }

classifyQueryIntent("Korean slow burn thriller from 2020")
// → { extractedFilters: {
//       language: "ko",
//       mood: { pacing: "slow" },
//       genres: ["thriller"],
//       yearRange: [2020, 2026]
//     } }

classifyQueryIntent("highly rated HBO drama series completed")
// → { extractedFilters: {
//       minRating: 7.5,
//       network: "HBO",
//       genres: ["drama"],
//       seriesStatus: "ended"
//     } }

// LLM parsing flag
classifyQueryIntent("that one movie with the guy")
// → { intent: "mixed", confidence: 0.5, needsLlmParsing: true }

classifyQueryIntent("something about dreams and architects")
// → { intent: "semantic", needsLlmParsing: false } // descriptive = high confidence

// Edge cases
classifyQueryIntent("") // → { intent: "mixed", confidence: 0.5 }
classifyQueryIntent("2001: A Space Odyssey") // Doesn't strip year from title
// → { extractedFilters: { year: 2001 }, cleanedQuery: "2001: a space odyssey" }
*/
