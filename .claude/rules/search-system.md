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
| LLM Parser | `src/lib/search/llm-query-parser.ts` | Kimi K2.5 fallback for complex NL queries |
| Hybrid Search | `src/lib/search/hybrid.ts` | RRF combining fuzzy + semantic results |
| Fuzzy Search | `src/server/db/postgres/fuzzy-search.ts` | pg_trgm trigram — **typo fallback only**, no longer on the hot path |
| FTS / Prefix Search | `src/server/db/postgres/fts-search.ts` | `to_tsvector` GIN FTS + **prefix** (`ftsPrefixSearch*`, title/name-only) |
| Semantic Search | `src/server/db/postgres/semantic-search.ts` | pgvector 1024-dim Cohere Embed v4 embeddings |
| Autocomplete | `src/server/actions/autocomplete.ts` | Fast suggestions (<100ms) — prefix FTS first, trigram fallback |
| Search Action | `src/server/actions/search.ts` | Server action with trending boost |

## `/search` page defaults to LEXICAL — semantic is a user toggle (July 2026)

The `/search` page (`enhancedSearch` → `hybridSearch`) is **lexical-only by
default**: regex intent classification (Tier 1, no embedding) + the semantic
(pgvector) leg SKIPPED → **zero AWS Bedrock round-trips on the hot path** → instant.
This is controlled by the `semantic` flag on `HybridSearchOptions` (+ the
`enhancedSearch` Zod input, + `?semantic=1` in the /search URL and the "Semantic
search" toggle in `search/client.tsx`):

- `semantic === false` → `lexicalOnly` in `hybridSearch`: regex intent (`classifyQueryIntent`,
  NOT `classifyQueryIntentHybrid`) + `skipSemantic:true` on every `runCoreSearch`
  (via `coreOptions`). No embedding classification, no vector leg.
- `semantic === true` → full embedding-based path (Tier-2 classification + semantic leg).
- `semantic === undefined` (omitted) → **unchanged legacy behavior** (hybrid classify +
  semantic per weights). Deliberately: the AI agent's `search` tool and any other
  `hybridSearch` caller that omits the flag are unaffected — only /search opts out.

Before July 2026 EVERY /search hit ran BOTH a Tier-2 embedding classification (on
low-confidence queries) AND a semantic-leg embedding — two serial Bedrock calls =
the "search is slow" complaint. Users now flip Semantic on only for vibe/theme
queries. Do NOT make the /search default semantic again without a perf plan.

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
| 3 | LLM (Kimi K2) | $0.01 | 1-2s | **OPT-IN, default OFF** |

**Tier 3 LLM is OPT-IN (June 2026, default OFF — `isSearchLlmEnabled()` in
`llm-query-parser.ts`, gated on `SEARCH_LLM_ENABLED=true`).** It was a 1–2s
SYNCHRONOUS Bedrock call on the hot path, and search is crawler-hammered — an LLM
there is both a latency landmine and a cost/abuse exposure (violates "never invoke
AI on a render/crawler path"). `parseQueryWithLlm` returns `null` immediately when
disabled, so classification cleanly degrades to regex+embedding and
`needsLlmParsing` resolves to false (both call sites — `classifyQueryIntentHybrid`
step 3 and `hybridSearch` step 2 — become no-ops). When a query is genuinely too
ambiguous, the search overlay's EMPTY state surfaces an explicit **"Ask Cue"**
action (`handleAskCue` in `search-command.tsx` → dispatches the `ai-chat-trigger`
CustomEvent the assistant-floaty listens for) — moving AI to an intentional click.

**Expected average cost** (LLM off): embedding tier only (~$0.000005/query).

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

## Cost Tracking

Search operations that incur external API costs are tracked to ClickHouse:

| Operation | Table | Tracking Function | Trigger |
|-----------|-------|-------------------|---------|
| Tier 2 embedding classification | `api_calls` (service=embedding) | `trackEmbeddingCall()` | Every `generateQueryEmbedding()` call |
| Tier 3 LLM parsing | `ai_usage` (query_type=search_llm_parsing) | `trackSearchLLMUsage()` | Every `parseQueryWithLlm()` call |
| Semantic search embedding | `api_calls` (service=embedding) | `trackEmbeddingCall()` | Every semantic/smart-discover query |
| Batch embedding generation | `api_calls` (service=embedding) | `trackEmbeddingCall()` | Aggregate per batch run |

All tracking is fire-and-forget (no `await`, wrapped in try-catch) — never blocks the search hot path.

Costs flow into the unified cost dashboard at `/admin` → Costs tab via `getUnifiedCostBreakdown()`.

## Error Isolation (June 2026 zero-results incident — do not regress)

Every search leg MUST be independently guarded; one leg's failure may never
reject the whole search. Prod bug: `fuzzySearch` runs trigram under a 4s
`statement_timeout`, common multi-word queries ("the lord of the rings") blow it
under load → Prisma P2010 (`57014 canceling statement due to statement timeout`)
propagated through an unguarded `Promise.all` in `runCoreSearch` → the entire
`enhancedSearch` action rejected → /search showed "No results found" for valid
titles (the client `catch` only `console.error`s — invisible server-side; the
intermittent "1 result" was the title exact-match fast path which skips trigram).
Diagnosis signature: `⨯ PrismaClientKnownRequestError ... 57014` in
`~/.pm2/logs/next-error.log` + `hybrid_search_complete` missing for the failing
query in `next-out.log` (it logs only on completion).

Guards now in `hybrid.ts` (keep them when refactoring):

- `runLexicalSearch()` — **FTS-FIRST since June 2026** (inverted from trigram-first;
  the old `FTS_PREEMPT_MIN_WORDS` 3-word gate is GONE). Order: prefix FTS
  (`ftsPrefixSearchTitles`/`ftsPrefixSearchPeople`, title/name-only GIN indexes
  `idx_movies_title_fts`/`idx_series_name_fts`, ~5ms, "inc" → Inception) → if it
  returns rows, DONE (trigram never runs); if it throws, log `lexical_search_failed`
  + return `[]`. Trigram (`fuzzySearch`) runs ONLY when prefix FTS is EMPTY (a
  probable misspelling, distinctive enough to stay fast); on its failure log
  `fuzzy_search_failed` + return `[]`. Trigram was pathological on the hot path —
  "the matrix" matched ~184k candidate rows → multi-second heap recheck (18s cold).
- Semantic leg `.catch` → `semantic_search_fallback` warn (pre-existing).
- `findExactMatchSafe()` wraps both exact-match call sites (fast path +
  `resolveSimilarToTitle`).
- `getSpellingSuggestions` + `classifyQueryIntentHybrid` calls are try/caught
  (fallback: no suggestions / regex classification).
- `enhancedSearch` (search.ts): TMDB `searchMulti` supplement is try/caught — a
  TMDB 500 must never discard hybrid results already in hand.
- `classifyQueryIntentHybrid` clears `needsLlmParsing` after a failed LLM
  attempt so `hybridSearch` step 2 doesn't immediately re-run the 5s LLM tier.
- Tier-3 LLM Bedrock client uses instance-profile fallback (no static-keys
  requirement — prod EC2 deliberately has none; the static-only check kept
  Tier 3 permanently dead in prod).

Regression tests: `src/lib/search/hybrid.test.ts` (8 tests, all deps mocked; pins
the FTS-first ordering + the degradation chain). Run:
`yarn vitest run src/lib/search/hybrid.test.ts`.

## Filter extraction must never leave a stopword residual as the search text

Follow-up relevance bug the error-isolation fix exposed (it was pre-existing —
pre-fix those searches died on the fuzzy throw before users saw the results):
"the lord of the rings" matched `COLLECTION_MAP["lord of the rings"]`,
`extractCollection` stripped the phrase, and `cleanedQuery` became literally
`"the"` → the semantic leg searched "the" (prod log signature:
`semantic_search query:"the"`) → top-20 was generic popular "The …" titles with
zero LOTR films, and the UI showed `Searching for: "the"`.

Rules:
- The `collection` filter is **display-only** (chips); semantic/fuzzy search do
  NOT apply it (semantic-search.ts only has `excludeCollectionId`, a different
  feature). So for franchise queries, `cleanedQuery` is the only relevance
  signal.
- `classifyQueryIntent` now substitutes the collection NAME for the residual
  when the residual is empty or only generic tokens (see
  `GENERIC_RESIDUAL_WORDS` / `isGenericResidual` in `intent.ts`). Any new
  extractor that strips phrases from the query must apply the same principle:
  search the extracted entity or the full original query — never a stopword
  residual.
- Regression tests: `src/lib/search/intent.test.ts` (3/5 fail on pre-fix code).

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
