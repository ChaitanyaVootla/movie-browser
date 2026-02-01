---
paths:
  - "src/lib/search/**/*.ts"
  - "src/server/db/postgres/fuzzy-search.ts"
  - "src/server/db/postgres/semantic-search.ts"
  - "src/server/actions/search.ts"
  - "src/server/actions/autocomplete.ts"
  - "src/lib/embeddings/**/*.ts"
  - "src/app/search/**/*.tsx"
---

# Search System

## Architecture Overview

The search system uses a sophisticated multi-tier approach to handle any query type - from exact titles to complex natural language like "dark Korean thrillers from the 90s similar to Parasite".

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Intent Classification | `src/lib/search/intent.ts` | Extracts 14+ filter types from natural language |
| Embedding Classification | `src/lib/search/intent-embeddings.ts` | 3-tier classification (regex→embedding→LLM) |
| Query Expansion | `src/lib/search/query-expansion.ts` | Theme/mood synonyms, typo correction |
| LLM Parser | `src/lib/search/llm-query-parser.ts` | Kimi K2 fallback for complex NL queries |
| Hybrid Search | `src/lib/search/hybrid.ts` | RRF combining fuzzy + semantic results |
| Fuzzy Search | `src/server/db/postgres/fuzzy-search.ts` | pg_trgm trigram matching |
| Semantic Search | `src/server/db/postgres/semantic-search.ts` | pgvector 1024-dim embeddings |
| Autocomplete | `src/server/actions/autocomplete.ts` | Fast suggestions (<100ms) |
| Search Action | `src/server/actions/search.ts` | Server action with trending boost |

## 3-Tier Intent Classification

Classification uses a tiered approach to minimize cost while maximizing accuracy:

```typescript
import { classifyQueryIntentHybrid } from "@/lib/search/intent-embeddings";

const result = await classifyQueryIntentHybrid(query);
// Returns: { intent, confidence, extractedFilters, method: 'regex' | 'embedding' | 'llm' }
```

| Tier | Method | Cost | Latency | % of Queries |
|------|--------|------|---------|--------------|
| 1 | Regex | $0 | <5ms | ~70% |
| 2 | Embedding | $0.00002 | ~100ms | ~25% |
| 3 | LLM (Kimi K2) | $0.01 | 1-2s | ~5% |

**Expected average cost**: ~$0.0006/query (80% cheaper than LLM-only)

## Extracted Filter Types (14+)

The system extracts structured filters from natural language:

```typescript
interface ExtractedFilters {
  // Content filters
  genres?: string[];           // "horror movies", "comedies"
  keywords?: string[];         // "time travel", "heist"
  similarTo?: { title: string; resolvedId?: number };  // "like Inception"
  collection?: string;         // "Marvel movies", "Star Wars"

  // Time filters
  year?: number;               // "2020 movies"
  yearRange?: [number, number]; // "from 2010 to 2020"
  decade?: string;             // "90s movies"

  // Person filters
  cast?: string[];             // "with Tom Hanks and Meg Ryan"
  director?: string;           // "by Nolan", "directed by Spielberg"
  person?: string;             // Generic person reference

  // Location filters
  language?: string;           // "Korean movies", "in French" → ISO code
  country?: string;            // "from Korea", "British films" → ISO code

  // Platform filters
  streamingService?: string;   // "on Netflix", "available on Disney+"
  network?: string;            // "HBO shows", "BBC series"

  // Quality filters
  minRating?: number;          // "highly rated", "8+ rating"
  runtime?: { min?: number; max?: number };  // "short films", "under 2 hours"

  // Content preferences
  contentWarnings?: string[];  // "family friendly", "no gore"
  bestFor?: string;            // "date night", "family movie"
  mood?: { pacing?: string; intensity?: string; tone?: string };

  // Series-specific
  seriesStatus?: "returning" | "ended" | "cancelled";
  seasonCount?: { min?: number; max?: number };
}
```

### Detection Patterns

```typescript
// Language detection
"Korean movies" → { language: "ko" }
"French films" → { language: "fr" }
"Japanese anime" → { language: "ja" }

// Country detection
"from Korea" → { country: "KR" }
"Bollywood" → { country: "IN" }
"British thrillers" → { country: "GB" }

// Cast/crew detection
"with Tom Hanks" → { cast: ["Tom Hanks"] }
"starring Emma Stone and Ryan Gosling" → { cast: ["Emma Stone", "Ryan Gosling"] }
"by Nolan" → { director: "Christopher Nolan" }
"directed by Spielberg" → { director: "Steven Spielberg" }

// Similar to detection
"movies like Inception" → { similarTo: { title: "Inception" } }
"similar to Breaking Bad" → { similarTo: { title: "Breaking Bad" } }

// Franchise detection
"Marvel movies" → { collection: "marvel" }
"Star Wars films" → { collection: "star wars" }
"MCU" → { collection: "marvel" }
```

## Query Expansion

The system expands queries with synonyms and related terms:

```typescript
import { expandQuery, normalizeQuery } from "@/lib/search/query-expansion";

// Normalize typos and variations
const normalized = normalizeQuery("redempshun movies"); // "redemption movies"

// Expand themes and moods
const expanded = expandQuery("feel-good movies about redemption");
// expanded.themes: ["redemption", "redemption arc", "personal growth", "transformation"]
// expanded.moods: ["feel-good", "uplifting", "heartwarming", "positive"]
```

### Expansion Categories

- **30 theme expansions**: redemption, revenge, identity, heist, time travel, etc.
- **20 mood expansions**: feel-good, dark, intense, cozy, mind-bending, etc.
- **40+ country mappings**: Korea→KR, Bollywood→IN, British→GB, etc.
- **30+ language mappings**: Korean→ko, French→fr, Japanese→ja, etc.
- **45+ franchise mappings**: Marvel, Star Wars, Harry Potter, Ghibli, etc.
- **50+ typo corrections**: "redempshun"→"redemption", etc.

## Ranking Boosts

The hybrid search applies multiple boosts to RRF scores:

```typescript
// Popularity boost (logarithmic)
const popularityBoost = 1 + Math.log(popularity + 1) / 15;

// Trending boost (30% for trending items)
const trendingBoost = isTrending ? 1.3 : 1;

// Quality boost (rating + vote count)
const qualityBoost = 1 + (rating - 5) / 25 + Math.log(voteCount + 1) / 30;

// Recency boost (up to 15% for last 5 years, non-title queries only)
const recencyBoost = 1 + 0.15 * (1 - yearDiff / 5);

// Final score
score = rrfScore * popularityBoost * trendingBoost * qualityBoost * recencyBoost;
```

## Query Understanding UI

The search returns structured understanding for display:

```typescript
interface QueryUnderstanding {
  summary: string;  // "Showing 90s horror similar to The Shining"
  filters: QueryUnderstandingFilter[];
  originalQuery: string;
  cleanedQuery: string;  // What was actually searched semantically
}

interface QueryUnderstandingFilter {
  type: FilterChipType;  // 'genre' | 'year' | 'cast' | 'country' | etc.
  label: string;         // "Horror", "1990s", "With Tom Hanks"
  value: string | number;
  removable: boolean;
}
```

### Filter Chip Categories (Color-Coded)

| Category | Types | Color |
|----------|-------|-------|
| Content | genre, keywords | Default |
| Time | year, decade, runtime | Blue |
| Person | cast, director, person | Green |
| Location | country, language | Purple |
| Platform | streaming, network | Orange |
| Quality | rating | Yellow |
| Warning | contentWarnings | Red |

## Autocomplete

Fast autocomplete suggestions (<100ms target):

```typescript
import { getAutocompleteSuggestions } from "@/server/actions/autocomplete";

const { suggestions, durationMs } = await getAutocompleteSuggestions("incep");
// suggestions: [
//   { type: "title", label: "Inception (2010)", value: "Inception", id: 27205 },
//   { type: "person", label: "Leonardo DiCaprio", value: "Leonardo DiCaprio", id: 6193 },
//   { type: "filter", label: "1990s movies", value: "1990s movies" },
//   { type: "mood", label: "Mind-Bending", value: "mind-bending..." }
// ]
```

### Suggestion Categories

- **Titles (max 4)**: Movies and series via fuzzy search
- **People (max 2)**: Actors/directors via fuzzy search
- **Filters (max 2)**: Decade, streaming service suggestions
- **Moods (max 2)**: Feel-good, intense, dark, etc.

## Progressive Fallback

When results are sparse, filters are relaxed:

1. If <5 results: Relax year range by ±5 years
2. If still <5: Remove genre filter, keep semantic query
3. Final fallback: TMDB API for uncached content

The response includes:
- `relaxedFilters: boolean` - Whether filters were relaxed
- `relaxationMessage: string` - "Expanded year range to find more results"

## Person ID Mapping

The `persons` table uses an internal auto-increment `id` + separate `tmdb_id` field.

**Important**: Fuzzy search returns `tmdb_id` as `id` for URL compatibility:

```sql
SELECT tmdb_id AS id, name, profile_path, popularity
FROM persons
WHERE similarity(name, $1) > 0.3
```

## Adding New Filter Types

1. Add to `ExtractedFilters` interface in `intent.ts`
2. Add detection patterns (regex or lookup table)
3. Add to `generateQueryUnderstanding()` in `hybrid.ts`
4. Add filter chip type and icon in `search/client.tsx`
5. Pass to semantic/fuzzy search if applicable

## Adding New Expansions

1. Add to appropriate map in `query-expansion.ts`:
   - `THEME_EXPANSIONS` for themes
   - `MOOD_EXPANSIONS` for moods
   - `COUNTRY_NAMES` for countries
   - `KNOWN_FRANCHISES` for franchises
2. Test with `expandQuery()` function

## Testing

```bash
yarn test:fuzzy "search query"      # Test fuzzy search only
yarn test:semantic "search query"   # Test semantic search only
yarn test:hybrid "search query"     # Test full hybrid search
```

## Mood Filters

Quick-access semantic search triggers in `src/lib/search/moods.ts`:

```typescript
import { MOOD_FILTERS, getMoodQuery } from "@/lib/search/moods";

// Available: feel-good, mind-bending, intense, dark, cozy, epic, emotional, fun
const query = getMoodQuery("feel-good");
// Returns: "uplifting heartwarming feel-good happy ending comfort inspiring"
```
