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

## Autocomplete's trigram fallback burns a 4s timeout on no-match queries (Aug 18 2026)

**Symptom users report: "I typed `shangchi` and nothing loaded for a really long
time."** Measured on prod: `interstellar` returns in **317ms**, `shangchi` in
**4,859ms** — and the slow request is the **150ms-debounce autocomplete action**
(4,153ms), NOT `quickSearch` (138ms).

Chain: `getAutocompleteSuggestions` tries `ftsPrefixSearchTitles`/`People` first;
`shangchi` matches nothing (the real title is "Shang-Chi…", which tokenizes as
`shang` + `chi`, so no prefix hit); it then falls through to the trigram
`fuzzySearch` on movies+series AND persons; that query **runs until
`FUZZY_SEARCH_TIMEOUT_MS = 4000` in `fuzzy-search.ts` expires** and returns nothing.
So the 4s is the timeout being spent in full, not a query that eventually succeeds.

Ruled out — do not re-investigate these:
- **Not a missing index.** All 8 `gin_trgm_ops` indexes are present on prod
  (`movies.title`/`original_title`, `series.name`/`original_name`, `persons.name`,
  `person_aliases.alias`, `genres`, `keywords`). The `prisma db push` drift trap did
  not fire here.
- **Not the client.** Debounces are 250ms (`quickSearch`) / 150ms (autocomplete);
  rendering is instant once data lands.
- **Not the 0.3 threshold being unset** — `autocomplete.ts` explicitly passes
  `threshold: 0.3` on both fuzzy calls. The file's claim that 0.3 keeps fuzzy at
  "~150-200ms" simply does not hold for this query shape.

**FIXED Aug 18 2026 — the SQUASHED-PREFIX tier.** The real fix is not "fail
faster", it is making the fast tier actually MATCH how people type. We index a
normalised form — lowercased, every non-alphanumeric run removed — so
"Shang-Chi and the Legend of the Ten Rings" indexes as
`shangchiandthelegendofthetenrings` and `shangchi` prefix-matches it.

- 5 `idx_*_squash` **btree** indexes (movies title+original_title, series
  name+original_name, persons.name) with **`text_pattern_ops`** — without that
  opclass `LIKE 'x%'` cannot use the btree. They live in the hash-gated
  `postgres/init/02-search-indexes.sql` because **Prisma cannot express
  expression indexes**, so a manually-created one would be dropped by
  `prisma db push`. `CONCURRENTLY IF NOT EXISTS`, matching the file's pattern.
- `regexp_replace(lower(...))` is **IMMUTABLE** (verified by creating the index),
  hence indexable. `unaccent()` is only STABLE — do NOT reach for it here without
  an immutable wrapper.
- Builds are far cheaper than a GIN: movies 4.7s/35MB, series 0.8s/4.7MB,
  persons (4.4M rows) 11.9s/127MB.
- `squashedPrefixSearchTitles/People` (`fts-search.ts`) run in `autocomplete.ts`
  **between** FTS prefix and the trigram fallback.
- **Leading articles are the one thing a prefix cannot see through**, so the
  article-prefixed forms (`the`/`a`/`an` + query) are tried against the same
  index — 4 index scans, still 0.9-2ms — recovering `darkknight` → The Dark
  Knight, `lordoftherings`, `godfather`, `matrix`.
- **The LIKE pattern is INLINED, not parameterised, on purpose:** Postgres only
  extracts a prefix from a pattern it can see at plan time, so `col LIKE $1`
  would NOT use the index. That is safe only because `squashQuery()` has already
  reduced the value to `[a-z0-9]` — no quote, backslash or wildcard survives. The
  helper asserts this and throws otherwise.
- `FUZZY_SEARCH_TIMEOUT_MS` 4000 → **800**. Nothing reached from a 150ms-debounce
  path may block for seconds.
- **`fts-search.test.ts` pins the TS expression against the SQL index expression
  byte-for-byte.** Drift silently disables the index and reinstates a seq scan
  over ~1M movies / ~4.4M persons — the exact hang this removed. That test is the
  most important one in the file.

Measured on prod, all Index Scans: `shangchi` 0.23ms → Shang-Chi; `spiderman`,
`starwars`, `johnwick`, `everythingeverywhere` → correct titles; `wandavision`,
`breakingbad`, `strangerthings` → correct series. Known and accepted gap: a
mid-title fragment typed without spaces (`legendoftheten`) still won't prefix-
match — the FTS token tier covers the spaced form (`legend of the ten`).

**Still open:** `quickSearch` (the palette's RESULTS list, 250ms debounce) hits the
**TMDB API** — `search()` → `searchMulti` — not our PG FTS. So one screen has two
very different backends: autocomplete suggestions from Postgres, results from a
network call to TMDB. That call was fast when measured (138ms, and it is cached in
the `search` L1/L2 namespace for 1h), so it is not currently the bottleneck — but it
is the obvious next consolidation, and it means results latency depends on an
external API and on cache warmth.

## THREE search backends on one screen — know which one you are fixing (Aug 18 2026)

A fix to "search" almost certainly only fixes one third of it. Measured/traced:

| Path | Entry | Backend | Surfaces as |
|---|---|---|---|
| `getAutocompleteSuggestions` | 150ms debounce | **Postgres** (FTS prefix → squashed → trigram) | palette groups **Movies / Series / People** |
| `quickSearch` → `search()` → `searchMulti` | 250ms debounce | **TMDB HTTP API** | palette group **Results** |
| `enhancedSearch` → `hybridSearch` → `runLexicalSearch` | `/search?q=` page (`app/search/client.tsx`) | **Postgres** hybrid (lexical + optional semantic) | full search page |

The squashed-prefix tier had to be added **twice** — once in `autocomplete.ts` and
once in `runLexicalSearch` — because the first deploy fixed the palette while
`/search?q=shangchi` still answered **"Shane"**. If you change search behaviour,
check all three or say explicitly which one you changed.

## The palette's group PRECEDENCE is wrong, and it hides good results

Render order + guards in `search-command.tsx` (verified in source, not inferred):

```jsx
{movies.length > 0 && !hasApiResults && ( <CommandGroup heading="Movies"> )}
{series.length > 0 && !hasApiResults && ( <CommandGroup heading="Series"> )}
{people.length > 0 &&                    ( <CommandGroup heading="People"> )}  // no guard, renders FIRST
{hasApiResults ? (                         <CommandGroup heading="Results"> )}
```

Two consequences, both measured in a 30-query prod audit:

1. **`!hasApiResults` suppresses our own Postgres title matches as soon as TMDB
   returns ANYTHING — even garbage.** `starwars` → our PG tier finds *Star Wars*
   (1.2ms) but the user sees TMDB's **"Starwars: Goretech"**; `9-1-1` → **"1
   Oktober jam 9 malam di TV3."** The design assumed "Results are better than
   suggestions", which is false for punctuation-free queries.
2. **People has no guard and renders before everything**, so a weak substring
   person match becomes the top hit: `inc` → *Jennifer Inch*, `wall-e` → *Eli
   Wallach*, `walle` → *Annabelle Wallis*, `amelie` → *Amelia Warner*, `the
   matrix` → *Carlos Matrix*, `spiderman` → *B Spiderman*. Also Movies renders
   before Series, so `breakingbad` → *Breaking Bad Wolf* (movie) outranks
   *Breaking Bad* (series).

**Do NOT "fix" this by simply moving People last** — that breaks the genuine person
queries (`tom holland`, `cillian murphy`) which currently work correctly. It needs
relevance-based ordering (score the match against the query), which is a design
decision, not a reorder.

## Auditing search honestly — the traps that produce false PASSES

- **`[cmdk-group-heading]` is NOT a results signal.** "Search all for X" is a group
  with **no heading**, but **Filters** and **Moods** are LOCAL/synchronous — typing
  `netflix` renders a heading with zero server latency. Assert only on
  **Movies / Series / People / Results**.
- **The first `[cmdk-item]` is almost always "Search all for X"** — reading it as
  the top result makes every query look like it worked.
- **Results from the PREVIOUS query persist while the next loads.** A poll loop that
  breaks on "a server group exists" will happily measure the previous answer — this
  invalidated a mobile run where `breakingbad` and `tom holland` both reported
  "Shang-Chi". Clear the input and wait for results to actually go away, or open a
  fresh palette per query.
- **Use real typing (`type()` with a delay), not `fill()`** — `fill()` fires one
  input event and hides the debounce/queueing behaviour a user actually gets.
- **Through the CDN you are testing the PREVIOUS build.** Post-deploy, edge HTML
  carries dead server-action IDs and every query silently returns nothing. Use
  `?_cb=<ts>` or `--resolve` to the origin. See `cdn.md`.
- Mobile has no top navbar; the palette trigger is in the bottom nav and matches
  `button:has-text("Search")`, not an `aria-label`.
