# Advanced Search Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding powerful search capabilities to Movie Browser using PostgreSQL's advanced extensions (`pgvector` for semantic search, `pg_trgm` for fuzzy search) and integrating these with the AI agent for intelligent content discovery.

**Target Outcome:** Transform search from basic TMDB API lookups to an intelligent, multi-modal search system that understands user intent, handles typos, finds semantically similar content, and powers personalized recommendations.

---

## 🚀 Current Implementation Status (Jan 2026)

### What's Done ✅

| Component                         | Status                  | Files                                       |
| --------------------------------- | ----------------------- | ------------------------------------------- |
| **pg_trgm extension**             | ✅ Installed            | `postgres/init/01-extensions.sql`           |
| **Trigram indexes (SQL)**         | ✅ Created & Applied    | `postgres/init/02-search-indexes.sql`       |
| **Fuzzy search function**         | ✅ Implemented & Tested | `src/server/db/postgres/fuzzy-search.ts`    |
| **Test script**                   | ✅ Created              | `scripts/verify/test-fuzzy-search.ts`       |
| **Schema: vector(1024)**          | ✅ Updated              | `prisma/schema.prisma`                      |
| **Embedding generator (Bedrock)** | ✅ Implemented          | `src/lib/embeddings/generator.ts`           |
| **Embedding text builder**        | ✅ Implemented          | `src/lib/embeddings/text-builder.ts`        |
| **CLI script**                    | ✅ Updated              | `scripts/generate-embeddings.ts`            |
| **Semantic search function**      | ✅ Implemented          | `src/server/db/postgres/semantic-search.ts` |
| **Test script**                   | ✅ Created              | `scripts/verify/test-semantic-search.ts`    |
| **HNSW vector index**             | ✅ Applied              | `postgres/init/02-search-indexes.sql`       |
| **Intent classification**         | ✅ Implemented          | `src/lib/search/intent.ts`                  |
| **Hybrid search (RRF)**           | ✅ Implemented          | `src/lib/search/hybrid.ts`                  |
| **Search API endpoint**           | ✅ Implemented          | `src/app/api/search/route.ts`               |
| **Enhanced search action**        | ✅ Implemented          | `src/server/actions/search.ts`              |
| **Hybrid test script**            | ✅ Created              | `scripts/verify/test-hybrid-search.ts`      |
| **AI semantic_search tool**       | ✅ Implemented          | `src/server/ai/tools/semantic-search.ts`    |
| **AI find_similar tool**          | ✅ Implemented          | `src/server/ai/tools/similar.ts`            |
| **System prompt updated**         | ✅ Updated              | `src/server/ai/prompts/system.ts`           |

### Phase 1 COMPLETE ✅ (Jan 2026)

Fuzzy search is fully functional with:

- 5,000 movies, 2,000 series, 120K+ persons in database
- All 8 trigram indexes created and working
- Query times ~250-400ms
- Typo tolerance: "Incepton" → Inception, "Godfahter" → Godfather, "Shawshenk" → Shawshank
- Exact match detection
- Spelling suggestions
- Multi-strategy search (exact → fuzzy → suggestions)

**Run tests:** `yarn test:fuzzy`

**Apply indexes (if needed):**

```bash
docker exec -i movie-browser-postgres psql -U moviebrowser -d moviebrowser < postgres/init/02-search-indexes.sql
```

### Phase 2 COMPLETE ✅ (Jan 2026)

Semantic search is fully functional with:

- 150 movies with embeddings (initial test batch)
- Amazon Titan Text Embeddings V2 (1024 dimensions)
- HNSW vector index for fast similarity search
- Query latency ~3-4s (including embedding generation)
- Similarity search latency ~5-20ms

**Test Results:**

```
Query: "mind-bending sci-fi about dreams"
→ Inception (33.4% similarity) ✅

Query: "horror scary supernatural"
→ 7 horror movies found (30-41% similarity)

Similar to Inception:
→ Bugonia (35.4%), Mission: Impossible (30.2%)
```

**Run tests:** `yarn test:semantic`

**Generate more embeddings:**

```bash
# Generate for 1000 popular movies
npx tsx scripts/generate-embeddings.ts --limit=1000 --min-popularity=5
```

### Phase 3 COMPLETE ✅ (Jan 2026)

Hybrid search combining fuzzy and semantic with RRF scoring:

- Query intent classification (title/semantic/person/filter/mixed)
- Reciprocal Rank Fusion (RRF) with k=60
- Dynamic weight adjustment based on intent
- Popularity boost option
- Spelling suggestions for failed queries
- API endpoint at `/api/search`

**Run tests:** `yarn test:hybrid`

**API Usage:**

```bash
# Basic search
curl "http://localhost:3000/api/search?q=Inception"

# Semantic search
curl "http://localhost:3000/api/search?q=mind-bending%20sci-fi%20about%20dreams"

# Quick search (autocomplete)
curl "http://localhost:3000/api/search?q=incep&quick=true"

# Filter by type
curl "http://localhost:3000/api/search?q=nolan&type=person"
```

### Phase 4 COMPLETE ✅ (Jan 2026)

AI Agent integration with semantic search capabilities.

**Phase 4.1: Initial Tools** (completed earlier)

- `semantic_search` - Natural language search using hybrid (fuzzy + embeddings)
- `find_similar` - Embedding-based similarity with TMDB fallback

**Phase 4.2: Tool Consolidation** ✨ (Jan 10, 2026)

Consolidated three tools (`discover`, `semantic_search`, `find_similar`) into ONE powerful tool:

- **`smart_discover`** - Unified PostgreSQL-backed discovery with optional semantic ranking

**Why consolidate?**

1. Simpler tool selection for the AI agent (less cognitive load)
2. **Filter + semantic combined** - impossible with separate tools
3. Single PostgreSQL query for efficiency
4. Better fallback behavior

**Key Features:**

- **Filter-only queries:** Genre, year, cast, keywords, streaming, language, country
- **Semantic queries:** Natural language mood/vibe ranking via embeddings
- **Find similar:** Via `similarTo` parameter using source item's embedding
- **THE MAGIC COMBO:** Filters + semantic in ONE query!

**Example: "Dark Korean horror from 2020s"**

```typescript
smart_discover({
  semanticQuery: "dark atmospheric horror",
  genres: ["Horror"],
  originCountry: "KR",
  releasedAfter: "2020",
});
// PostgreSQL does: filter by genre/country/year → rank by embedding similarity
```

**New/Updated Files:**

- `src/server/db/postgres/smart-discover.ts` - Core PostgreSQL query builder (NEW)
- `src/server/ai/tools/smart-discover.ts` - AI tool definition (NEW)
- `src/server/ai/tools/index.ts` - Updated (9 active tools + 3 legacy)
- `src/server/ai/prompts/system.ts` - Simplified tool selection guidance
- `.cursor/rules/ai-agent.mdc` - Updated documentation

**Legacy Tools (deprecated, kept for backward compatibility):**

- `semantic-search.ts` → Use `smart_discover({ semanticQuery: "..." })`
- `similar.ts` → Use `smart_discover({ similarTo: id })`
- `discover.ts` → Use `smart_discover({ ...filters })`

**Test Results:**

```
Query: "dark Korean horror movies"
→ smart_discover({ semanticQuery: "dark atmospheric horror", genres: ["Horror"], originCountry: "KR" })
→ Falls back to search when local DB lacks Korean films

Query: "mind-bending sci-fi"
→ smart_discover({ semanticQuery: "mind-bending sci-fi" })
→ 8 results with semantic ranking (31-46% relevance)

Query: "more like inception"
→ search to get ID (27205)
→ smart_discover({ similarTo: 27205 })
→ 8 results with embedding similarity (46% top match)
```

**Run tests:**

```bash
yarn test:ai "dark Korean horror movies" --debug
yarn test:ai "mind-bending sci-fi" --debug
yarn test:ai "more like inception" --debug
```

### Phase Summary

| Phase         | Description                           | Status               |
| ------------- | ------------------------------------- | -------------------- |
| **Phase 1**   | Fuzzy Search (pg_trgm)                | ✅ Complete          |
| **Phase 2**   | Semantic Search (pgvector)            | ✅ Complete          |
| **Phase 3**   | Hybrid Search (RRF)                   | ✅ Complete          |
| **Phase 4**   | AI Agent Integration                  | ✅ Complete          |
| **Phase 4.2** | Tool Consolidation (`smart_discover`) | ✅ Complete (Jan 10) |
| **Phase 5**   | Personalization                       | 📝 Planned           |

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1: Fuzzy Search](#phase-1-fuzzy-search-with-pg_trgm)
4. [Phase 2: Semantic Search](#phase-2-semantic-search-with-pgvector)
5. [Phase 3: Hybrid Search](#phase-3-hybrid-search-with-rrf)
6. [Phase 4: AI Agent Integration](#phase-4-ai-agent-integration)
7. [Phase 5: Advanced Features](#phase-5-advanced-features)
8. [Phase 6: Future Enhancements](#phase-6-future-enhancements)
9. [Cost Analysis](#cost-analysis)
10. [Success Metrics](#success-metrics)
11. [Risk Assessment](#risk-assessment)
12. [Implementation Timeline](#implementation-timeline)

---

## Current State Analysis

### What We Have ✅

| Component              | Status       | Details                                                   |
| ---------------------- | ------------ | --------------------------------------------------------- |
| PostgreSQL Extensions  | Installed    | `pgvector`, `pg_trgm`, `uuid-ossp`                        |
| Embedding Columns      | Schema Ready | `vector(1024)` on `movies` and `series` tables            |
| Enriched Data          | ~95 movies   | AI summaries, themes, moods, keywords in `data/enriched/` |
| AI Agent               | Operational  | 9 tools (smart_discover consolidates 3 legacy tools)      |
| Previous VectorDB Work | Prototype    | ChromaDB + `text-embedding-3-small` in `VectorDB/`        |
| Trigram Settings       | Configured   | `pg_trgm.similarity_threshold = 0.2`                      |

### Current Limitations ❌

| Issue                     | Impact                              | Solution                      |
| ------------------------- | ----------------------------------- | ----------------------------- |
| Search uses TMDB API only | No local intelligence, rate limited | PostgreSQL-first search       |
| Basic `ILIKE` matching    | No typo tolerance                   | Trigram indexes + similarity  |
| Empty embedding columns   | No semantic search                  | Embedding generation pipeline |
| No hybrid search          | Miss relevant results               | RRF combination strategy      |
| No personalization        | Generic recommendations             | User taste embeddings         |

### Data Available for Embedding

```
For each movie/series we can embed:
├── Core TMDB Data (all items)
│   ├── title / name
│   ├── overview (synopsis)
│   ├── genres (Action, Comedy, etc.)
│   ├── keywords (time travel, heist, etc.)
│   ├── tagline
│   └── cast/crew names
│
└── Enriched AI Data (~95 movies, growing)
    ├── themes (["Hope as defiance", "Found family"])
    ├── mood ({ pacing, intensity, tone, emotional })
    ├── quickTake (["Slow-burn masterpiece", "Emotionally wrecking"])
    ├── hook ("The slow burn that'll wreck you")
    └── ai_summary.json (full AI analysis)
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           ADVANCED SEARCH ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│    User Query: "mind-bending movies like inception about dreams"                    │
│                                   │                                                  │
│                                   ▼                                                  │
│    ┌─────────────────────────────────────────────────────────────────────────────┐  │
│    │                        QUERY PROCESSOR                                       │  │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│    │  │ Intent      │  │ Entity      │  │ Typo        │  │ Query       │        │  │
│    │  │ Detection   │  │ Extraction  │  │ Correction  │  │ Embedding   │        │  │
│    │  │             │  │             │  │             │  │             │        │  │
│    │  │ semantic vs │  │ "inception" │  │ pg_trgm     │  │ OpenAI      │        │  │
│    │  │ title vs    │  │ → movie     │  │ suggestion  │  │ text-embed  │        │  │
│    │  │ filter      │  │ "dreams"    │  │             │  │ 3-small     │        │  │
│    │  │             │  │ → keyword   │  │             │  │             │        │  │
│    │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │  │
│    └─────────────────────────────────────────────────────────────────────────────┘  │
│                                   │                                                  │
│           ┌───────────────────────┼───────────────────────┐                         │
│           │                       │                       │                         │
│           ▼                       ▼                       ▼                         │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐               │
│    │  FUZZY SEARCH   │    │ SEMANTIC SEARCH │    │ STRUCTURED      │               │
│    │                 │    │                 │    │ FILTERS         │               │
│    │  pg_trgm        │    │  pgvector       │    │                 │               │
│    │  GIN index      │    │  HNSW index     │    │  genres, year,  │               │
│    │  title % query  │    │  <=> cosine     │    │  rating, cast   │               │
│    │                 │    │                 │    │                 │               │
│    │  Handles:       │    │  Handles:       │    │  Handles:       │               │
│    │  - Typos        │    │  - "like X"     │    │  - "from 2020"  │               │
│    │  - Misspellings │    │  - Mood/vibe    │    │  - "with actor" │               │
│    │  - Partial      │    │  - Themes       │    │  - "horror"     │               │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘               │
│           │                       │                       │                         │
│           └───────────────────────┼───────────────────────┘                         │
│                                   ▼                                                  │
│    ┌─────────────────────────────────────────────────────────────────────────────┐  │
│    │                    RECIPROCAL RANK FUSION (RRF)                              │  │
│    │                                                                              │  │
│    │   score = Σ (weight_i / (k + rank_i))    where k=60                        │  │
│    │                                                                              │  │
│    │   Weights:                                                                   │  │
│    │   - Semantic: 0.5 (highest for natural language queries)                    │  │
│    │   - Fuzzy:    0.3 (title matching, typo correction)                         │  │
│    │   - Filter:   0.2 (structured constraints)                                  │  │
│    └─────────────────────────────────────────────────────────────────────────────┘  │
│                                   │                                                  │
│                                   ▼                                                  │
│    ┌─────────────────────────────────────────────────────────────────────────────┐  │
│    │                         RESULT RANKING                                       │  │
│    │                                                                              │  │
│    │   Final Score = RRF_score × popularity_boost × freshness_boost             │  │
│    │                                                                              │  │
│    │   Optional: LLM reranking for top-k results                                │  │
│    └─────────────────────────────────────────────────────────────────────────────┘  │
│                                   │                                                  │
│                                   ▼                                                  │
│                          Ranked Results + Explanations                              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Fuzzy Search with `pg_trgm`

### Objective

Enable typo-tolerant, forgiving search that handles misspellings and partial matches.

### Duration: 1-2 days

### Tasks

#### 1.1 Create Trigram Indexes

Add to `postgres/init/` or run migration:

```sql
-- postgres/init/03-search-indexes.sql

-- =============================================================================
-- Trigram Indexes for Fuzzy Search
-- =============================================================================

-- Movies
CREATE INDEX IF NOT EXISTS idx_movies_title_trgm
ON movies USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_movies_original_title_trgm
ON movies USING GIN (original_title gin_trgm_ops);

-- Composite index for both title fields
CREATE INDEX IF NOT EXISTS idx_movies_titles_trgm
ON movies USING GIN ((title || ' ' || COALESCE(original_title, '')) gin_trgm_ops);

-- Series
CREATE INDEX IF NOT EXISTS idx_series_name_trgm
ON series USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_series_original_name_trgm
ON series USING GIN (original_name gin_trgm_ops);

-- Persons (actors, directors)
CREATE INDEX IF NOT EXISTS idx_persons_name_trgm
ON persons USING GIN (name gin_trgm_ops);

-- Person aliases (nicknames, alternate spellings)
CREATE INDEX IF NOT EXISTS idx_person_aliases_trgm
ON person_aliases USING GIN (alias gin_trgm_ops);

-- Keywords (for semantic tag matching)
CREATE INDEX IF NOT EXISTS idx_keywords_name_trgm
ON keywords USING GIN (name gin_trgm_ops);

-- Genres
CREATE INDEX IF NOT EXISTS idx_genres_name_trgm
ON genres USING GIN (name gin_trgm_ops);

-- =============================================================================
-- Full-Text Search Indexes (complementary)
-- =============================================================================

-- Movies with weighted vectors
CREATE INDEX IF NOT EXISTS idx_movies_fts ON movies
USING GIN (to_tsvector('english',
  COALESCE(title, '') || ' ' ||
  COALESCE(overview, '') || ' ' ||
  COALESCE(tagline, '')
));

-- Series
CREATE INDEX IF NOT EXISTS idx_series_fts ON series
USING GIN (to_tsvector('english',
  COALESCE(name, '') || ' ' ||
  COALESCE(overview, '')
));

-- Persons
CREATE INDEX IF NOT EXISTS idx_persons_fts ON persons
USING GIN (to_tsvector('english',
  COALESCE(name, '') || ' ' ||
  COALESCE(biography, '')
));
```

#### 1.2 Implement Fuzzy Search Functions

```typescript
// src/server/db/postgres/fuzzy-search.ts

import { prisma } from "@/lib/prisma";

export interface FuzzySearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  similarity: number;
  posterPath: string | null;
  year: string | null;
  popularity: number | null;
}

export interface FuzzySearchOptions {
  limit?: number;
  threshold?: number;
  mediaTypes?: ("movie" | "series" | "person")[];
  boostPopular?: boolean;
}

/**
 * Fuzzy search across movies, series, and persons using trigram similarity.
 * Handles typos, misspellings, and partial matches.
 */
export async function fuzzySearch(
  query: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzySearchResult[]> {
  const {
    limit = 20,
    threshold = 0.2,
    mediaTypes = ["movie", "series", "person"],
    boostPopular = true,
  } = options;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  // Build UNION query for each media type
  const parts: string[] = [];

  if (mediaTypes.includes("movie")) {
    parts.push(`
      SELECT 
        id,
        title,
        'movie'::text as media_type,
        GREATEST(
          similarity(LOWER(title), $1),
          similarity(LOWER(COALESCE(original_title, '')), $1)
        ) as similarity,
        poster_path,
        EXTRACT(YEAR FROM release_date)::text as year,
        popularity
      FROM movies
      WHERE title % $1 OR original_title % $1
    `);
  }

  if (mediaTypes.includes("series")) {
    parts.push(`
      SELECT 
        id,
        name as title,
        'series'::text as media_type,
        GREATEST(
          similarity(LOWER(name), $1),
          similarity(LOWER(COALESCE(original_name, '')), $1)
        ) as similarity,
        poster_path,
        EXTRACT(YEAR FROM first_air_date)::text as year,
        popularity
      FROM series
      WHERE name % $1 OR original_name % $1
    `);
  }

  if (mediaTypes.includes("person")) {
    parts.push(`
      SELECT 
        p.id,
        p.name as title,
        'person'::text as media_type,
        GREATEST(
          similarity(LOWER(p.name), $1),
          COALESCE(
            (SELECT MAX(similarity(LOWER(alias), $1)) 
             FROM person_aliases WHERE person_id = p.id AND alias % $1),
            0
          )
        ) as similarity,
        p.profile_path as poster_path,
        NULL::text as year,
        p.popularity
      FROM persons p
      WHERE p.name % $1 
        OR EXISTS (
          SELECT 1 FROM person_aliases pa 
          WHERE pa.person_id = p.id AND pa.alias % $1
        )
    `);
  }

  if (parts.length === 0) return [];

  // Combine with popularity boost option
  const orderBy = boostPopular
    ? "similarity * (1 + LOG(GREATEST(popularity, 1)) / 10) DESC"
    : "similarity DESC";

  const sql = `
    WITH ranked AS (
      ${parts.join(" UNION ALL ")}
    )
    SELECT 
      id,
      title,
      media_type as "mediaType",
      similarity,
      poster_path as "posterPath",
      year,
      popularity
    FROM ranked
    WHERE similarity >= $2
    ORDER BY ${orderBy}
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<FuzzySearchResult[]>(
    sql,
    normalizedQuery,
    threshold,
    limit
  );

  return results;
}

/**
 * Get spelling suggestions for a potentially misspelled query.
 * Returns the closest matching titles from the database.
 */
export async function getSpellingSuggestions(
  query: string,
  limit = 5
): Promise<Array<{ suggestion: string; similarity: number }>> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const results = await prisma.$queryRaw<Array<{ suggestion: string; similarity: number }>>`
    SELECT DISTINCT 
      title as suggestion, 
      similarity(LOWER(title), ${normalizedQuery}) as similarity
    FROM (
      SELECT title FROM movies 
      WHERE similarity(LOWER(title), ${normalizedQuery}) > 0.15
      UNION
      SELECT name as title FROM series 
      WHERE similarity(LOWER(name), ${normalizedQuery}) > 0.15
      UNION
      SELECT name as title FROM persons 
      WHERE similarity(LOWER(name), ${normalizedQuery}) > 0.15
    ) combined
    WHERE similarity(LOWER(title), ${normalizedQuery}) > ${normalizedQuery.length > 5 ? 0.2 : 0.15}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return results;
}

/**
 * Check if query exactly matches a known title (for direct navigation).
 */
export async function findExactMatch(query: string): Promise<FuzzySearchResult | null> {
  const normalizedQuery = query.trim().toLowerCase();

  const result = await prisma.$queryRaw<FuzzySearchResult[]>`
    SELECT 
      id,
      title,
      'movie'::text as "mediaType",
      1.0 as similarity,
      poster_path as "posterPath",
      EXTRACT(YEAR FROM release_date)::text as year,
      popularity
    FROM movies
    WHERE LOWER(title) = ${normalizedQuery}
    ORDER BY popularity DESC
    LIMIT 1
  `;

  return result[0] || null;
}
```

#### 1.3 Integrate with Search UI

```typescript
// src/server/actions/search.ts - Add to existing file

import { fuzzySearch, getSpellingSuggestions } from "@/server/db/postgres/fuzzy-search";

export async function enhancedSearch(input: { query: string; page?: number }) {
  const { query, page = 1 } = input;

  // Try PostgreSQL fuzzy search first for better typo handling
  const pgResults = await fuzzySearch(query, { limit: 20, boostPopular: true });

  // If no results, get spelling suggestions
  let suggestions: string[] = [];
  if (pgResults.length === 0) {
    const spellingSuggestions = await getSpellingSuggestions(query);
    suggestions = spellingSuggestions.map((s) => s.suggestion);
  }

  // Fallback to TMDB for items not in our database
  const tmdbResults = await searchMulti(query, page);

  // Merge results, preferring PostgreSQL results
  const merged = mergeSearchResults(pgResults, tmdbResults.results);

  return {
    results: merged,
    suggestions,
    page: tmdbResults.page,
    total_pages: tmdbResults.total_pages,
    total_results: tmdbResults.total_results,
  };
}
```

#### 1.4 Tests

```typescript
// Test cases for fuzzy search
describe("Fuzzy Search", () => {
  it("handles typos in movie titles", async () => {
    const results = await fuzzySearch("Incepton");
    expect(results[0].title).toBe("Inception");
  });

  it("finds movies with partial matches", async () => {
    const results = await fuzzySearch("dark knight");
    expect(results.some((r) => r.title.includes("Dark Knight"))).toBe(true);
  });

  it("searches across person aliases", async () => {
    // Assuming "The Rock" is an alias for Dwayne Johnson
    const results = await fuzzySearch("The Rock", { mediaTypes: ["person"] });
    expect(results[0].title).toBe("Dwayne Johnson");
  });
});
```

---

## Phase 2: Semantic Search with pgvector

### Objective

Enable meaning-based search that understands context, themes, and mood - not just keywords.

### Duration: 3-5 days

### Tasks

#### 2.1 Choose Embedding Model

**Selected: Amazon Titan Text Embeddings V2** (via AWS Bedrock)

| Model                              | Provider    | Dimensions       | Cost/1K tokens | Pros                             | Cons              |
| ---------------------------------- | ----------- | ---------------- | -------------- | -------------------------------- | ----------------- |
| **`amazon.titan-embed-text-v2:0`** | AWS Bedrock | 256/384/**1024** | $0.00002       | AWS ecosystem, configurable dims | ✅ Selected       |
| `text-embedding-3-small`           | OpenAI      | 1536             | $0.00002       | Fast, cheap, proven              | Separate API      |
| `text-embedding-3-large`           | OpenAI      | 3072             | $0.00013       | Higher quality                   | More expensive    |
| `cohere.embed-english-v3`          | AWS Bedrock | 1024             | $0.0001        | Good quality                     | 5x more expensive |
| `amazon.nova-embed-v1:0`           | AWS Bedrock | 256-3072         | $0.0002        | Multimodal                       | Overkill for text |

**Why Titan Text Embeddings V2:**

- **Same price** as OpenAI text-embedding-3-small ($0.00002/1K tokens)
- **Configurable dimensions** (256, 384, 1024) for different use cases
- **Already using Bedrock** for AI agent - consolidate on AWS
- **1024 dimensions** is optimal balance of quality vs. storage (vs. 1536/3072)
- **100+ languages** supported
- **8,192 token** max input

**Dimension Trade-offs:**
| Dimension | Storage/Item | Quality | Use Case |
|-----------|--------------|---------|----------|
| 256 | ~1KB | Good | High-volume, cost-sensitive |
| 384 | ~1.5KB | Better | Balanced |
| **1024** | ~4KB | Best | Production semantic search ✅ |

#### 2.2 Embedding Text Construction

```typescript
// src/lib/embeddings/text-builder.ts

interface MovieEmbeddingInput {
  // Core TMDB data
  title: string;
  overview: string | null;
  genres: string[];
  keywords: string[];
  tagline?: string | null;

  // Credits
  director?: string | null;
  topCast?: string[];

  // AI-enriched data (if available)
  themes?: string[];
  mood?: {
    pacing?: string;
    intensity?: string;
    tone?: string;
    emotional?: string;
  };
  quickTake?: string[];
  hook?: string;
}

/**
 * Build optimized text for embedding generation.
 * Order matters - most important content first (for potential truncation).
 */
export function buildMovieEmbeddingText(input: MovieEmbeddingInput): string {
  const parts: string[] = [];

  // 1. Overview is the richest semantic content
  if (input.overview) {
    parts.push(input.overview);
  }

  // 2. Genres provide categorical context
  if (input.genres.length > 0) {
    parts.push(`Genres: ${input.genres.join(", ")}`);
  }

  // 3. Keywords capture specific themes and tropes
  if (input.keywords.length > 0) {
    // Limit keywords to avoid noise
    parts.push(`Keywords: ${input.keywords.slice(0, 20).join(", ")}`);
  }

  // 4. AI-enriched themes (high value if available)
  if (input.themes && input.themes.length > 0) {
    parts.push(`Themes: ${input.themes.join(", ")}`);
  }

  // 5. Mood descriptors
  if (input.mood) {
    const moodParts = Object.entries(input.mood)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`);
    if (moodParts.length > 0) {
      parts.push(`Mood: ${moodParts.join(", ")}`);
    }
  }

  // 6. Quick take / style descriptors
  if (input.quickTake && input.quickTake.length > 0) {
    parts.push(`Style: ${input.quickTake.join(", ")}`);
  }

  // 7. Tagline (often captures essence)
  if (input.tagline) {
    parts.push(`Tagline: ${input.tagline}`);
  }

  // 8. Director (for "movies by X" queries)
  if (input.director) {
    parts.push(`Director: ${input.director}`);
  }

  // 9. Top cast (for "movies with X" queries)
  if (input.topCast && input.topCast.length > 0) {
    parts.push(`Starring: ${input.topCast.slice(0, 5).join(", ")}`);
  }

  return parts.join(". ");
}

/**
 * Estimate token count for budgeting API calls.
 * Rule of thumb: ~4 characters per token for English.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

#### 2.3 Embedding Generation Pipeline

```typescript
// src/lib/embeddings/generator.ts

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { buildMovieEmbeddingText, estimateTokens } from "./text-builder";
import pino from "pino";

const logger = pino({ name: "embeddings" });
const openai = new OpenAI();

const BATCH_SIZE = 100;
const MAX_TOKENS_PER_REQUEST = 8000;

interface EmbeddingStats {
  processed: number;
  skipped: number;
  errors: number;
  tokensUsed: number;
}

/**
 * Generate embeddings for movies without them.
 */
export async function generateMovieEmbeddings(
  options: {
    limit?: number;
    minPopularity?: number;
    dryRun?: boolean;
  } = {}
): Promise<EmbeddingStats> {
  const { limit = 1000, minPopularity = 0, dryRun = false } = options;

  const stats: EmbeddingStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    tokensUsed: 0,
  };

  // Get movies without embeddings
  // Note: Can't filter by embedding IS NULL in Prisma with Unsupported type
  const movies = await prisma.$queryRaw<
    Array<{
      id: number;
      title: string;
      overview: string | null;
      tagline: string | null;
      popularity: number | null;
    }>
  >`
    SELECT m.id, m.title, m.overview, m.tagline, m.popularity
    FROM movies m
    WHERE m.embedding IS NULL
      AND m.popularity >= ${minPopularity}
    ORDER BY m.popularity DESC NULLS LAST
    LIMIT ${limit}
  `;

  logger.info({ count: movies.length }, "Found movies without embeddings");

  // Process in batches
  for (let i = 0; i < movies.length; i += BATCH_SIZE) {
    const batch = movies.slice(i, i + BATCH_SIZE);

    // Fetch additional data for each movie in batch
    const enrichedBatch = await Promise.all(
      batch.map(async (movie) => {
        const [genres, keywords, credits, aiData] = await Promise.all([
          prisma.movieGenre.findMany({
            where: { movieId: movie.id },
            include: { genre: true },
          }),
          prisma.movieKeyword.findMany({
            where: { movieId: movie.id },
            include: { keyword: true },
            take: 20,
          }),
          prisma.credit.findMany({
            where: { movieId: movie.id },
            include: { person: true },
            take: 10,
          }),
          prisma.aiData.findUnique({
            where: { movieId: movie.id },
          }),
        ]);

        const director = credits.find((c) => c.job === "Director")?.person.name;
        const topCast = credits
          .filter((c) => c.creditType === "CAST")
          .slice(0, 5)
          .map((c) => c.person.name);

        const embeddingText = buildMovieEmbeddingText({
          title: movie.title,
          overview: movie.overview,
          tagline: movie.tagline,
          genres: genres.map((g) => g.genre.name),
          keywords: keywords.map((k) => k.keyword.name),
          director,
          topCast,
          themes: aiData?.themes || undefined,
          mood: (aiData?.mood as any) || undefined,
          quickTake: aiData?.quickTake || undefined,
        });

        return {
          id: movie.id,
          title: movie.title,
          embeddingText,
          tokens: estimateTokens(embeddingText),
        };
      })
    );

    // Filter out movies with no meaningful text
    const validBatch = enrichedBatch.filter((m) => m.embeddingText.length > 50);
    stats.skipped += enrichedBatch.length - validBatch.length;

    if (validBatch.length === 0) continue;

    // Generate embeddings
    const totalTokens = validBatch.reduce((sum, m) => sum + m.tokens, 0);
    stats.tokensUsed += totalTokens;

    logger.info(
      {
        batch: Math.floor(i / BATCH_SIZE) + 1,
        movies: validBatch.length,
        tokens: totalTokens,
      },
      "Processing batch"
    );

    if (dryRun) {
      stats.processed += validBatch.length;
      continue;
    }

    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: validBatch.map((m) => m.embeddingText),
      });

      // Update database with embeddings
      await Promise.all(
        validBatch.map((movie, idx) => {
          const embedding = response.data[idx].embedding;
          return prisma.$executeRaw`
            UPDATE movies 
            SET embedding = ${JSON.stringify(embedding)}::vector
            WHERE id = ${movie.id}
          `;
        })
      );

      stats.processed += validBatch.length;
      logger.info({ processed: stats.processed }, "Batch complete");
    } catch (error) {
      logger.error({ error, batch: i }, "Batch failed");
      stats.errors += validBatch.length;
    }

    // Rate limit: OpenAI allows 3000 RPM, but be conservative
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return stats;
}

/**
 * Generate embedding for a single query string.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  return response.data[0].embedding;
}
```

#### 2.4 HNSW Index for Fast Similarity Search

```sql
-- postgres/init/04-vector-indexes.sql

-- =============================================================================
-- Vector Indexes for Semantic Search (pgvector)
-- =============================================================================

-- Use HNSW (Hierarchical Navigable Small World) for best performance
-- Cosine distance is best for text embeddings

-- Movies embedding index
CREATE INDEX IF NOT EXISTS idx_movies_embedding_hnsw
ON movies USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Series embedding index
CREATE INDEX IF NOT EXISTS idx_series_embedding_hnsw
ON series USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Set search parameters for queries
-- Higher ef_search = more accurate but slower
-- Default: 40, Recommended: 100 for production

-- Note: This is a session setting, set in application connection
-- SET hnsw.ef_search = 100;

-- =============================================================================
-- Index Parameters Explanation
-- =============================================================================
-- m: Maximum number of connections per node (16 is good default)
-- ef_construction: Size of dynamic candidate list during construction
--   Higher = better recall but slower indexing
--   64 is balanced, 100+ for higher accuracy needs
--
-- vector_cosine_ops: Use cosine similarity (1 - cosine_distance)
--   Best for normalized text embeddings
--   Alternative: vector_l2_ops for Euclidean distance
```

#### 2.5 Semantic Search Function

```typescript
// src/server/db/postgres/semantic-search.ts

import { prisma } from "@/lib/prisma";
import { generateQueryEmbedding } from "@/lib/embeddings/generator";

export interface SemanticSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series";
  score: number;
  posterPath: string | null;
  year: string | null;
  overview: string | null;
  genres: string[];
}

export interface SemanticSearchOptions {
  limit?: number;
  mediaType?: "movie" | "series";
  minScore?: number;
  filters?: {
    genres?: number[];
    yearRange?: [number, number];
    minRating?: number;
  };
}

/**
 * Semantic search using vector similarity.
 * Finds movies/series with similar meaning to the query.
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 20, mediaType, minScore = 0.5, filters } = options;

  // Generate embedding for query
  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Build filter conditions
  const conditions: string[] = ["embedding IS NOT NULL"];

  if (filters?.genres?.length) {
    // Subquery for genre filtering
    conditions.push(`
      id IN (
        SELECT movie_id FROM movie_genres 
        WHERE genre_id IN (${filters.genres.join(",")})
      )
    `);
  }

  if (filters?.yearRange) {
    conditions.push(`
      EXTRACT(YEAR FROM release_date) BETWEEN ${filters.yearRange[0]} AND ${filters.yearRange[1]}
    `);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Search movies
  if (mediaType !== "series") {
    const movies = await prisma.$queryRawUnsafe<SemanticSearchResult[]>(`
      SELECT 
        m.id,
        m.title,
        'movie'::text as "mediaType",
        1 - (m.embedding <=> '${embeddingStr}'::vector) as score,
        m.poster_path as "posterPath",
        EXTRACT(YEAR FROM m.release_date)::text as year,
        LEFT(m.overview, 200) as overview,
        ARRAY(
          SELECT g.name FROM genres g
          JOIN movie_genres mg ON g.id = mg.genre_id
          WHERE mg.movie_id = m.id
        ) as genres
      FROM movies m
      ${whereClause}
      ORDER BY m.embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
    `);

    // Filter by minimum score
    return movies.filter((m) => m.score >= minScore);
  }

  // Search series (similar structure)
  const series = await prisma.$queryRawUnsafe<SemanticSearchResult[]>(`
    SELECT 
      s.id,
      s.name as title,
      'series'::text as "mediaType",
      1 - (s.embedding <=> '${embeddingStr}'::vector) as score,
      s.poster_path as "posterPath",
      EXTRACT(YEAR FROM s.first_air_date)::text as year,
      LEFT(s.overview, 200) as overview,
      ARRAY(
        SELECT g.name FROM genres g
        JOIN series_genres sg ON g.id = sg.genre_id
        WHERE sg.series_id = s.id
      ) as genres
    FROM series s
    WHERE s.embedding IS NOT NULL
    ORDER BY s.embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit}
  `);

  return series.filter((s) => s.score >= minScore);
}

/**
 * Find items similar to a specific movie/series by embedding.
 */
export async function findSimilarByEmbedding(
  id: number,
  mediaType: "movie" | "series",
  limit = 10
): Promise<SemanticSearchResult[]> {
  const table = mediaType === "movie" ? "movies" : "series";
  const titleCol = mediaType === "movie" ? "title" : "name";
  const dateCol = mediaType === "movie" ? "release_date" : "first_air_date";

  const results = await prisma.$queryRawUnsafe<SemanticSearchResult[]>(`
    WITH source AS (
      SELECT embedding FROM ${table} WHERE id = ${id}
    )
    SELECT 
      t.id,
      t.${titleCol} as title,
      '${mediaType}'::text as "mediaType",
      1 - (t.embedding <=> source.embedding) as score,
      t.poster_path as "posterPath",
      EXTRACT(YEAR FROM t.${dateCol})::text as year,
      LEFT(t.overview, 200) as overview,
      '{}' as genres
    FROM ${table} t, source
    WHERE t.id != ${id}
      AND t.embedding IS NOT NULL
    ORDER BY t.embedding <=> source.embedding
    LIMIT ${limit}
  `);

  return results;
}
```

#### 2.6 Embedding Generation Script

```typescript
// scripts/generate-embeddings.ts

import { generateMovieEmbeddings } from "@/lib/embeddings/generator";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limit = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "1000");
  const minPopularity = parseFloat(
    args.find((a) => a.startsWith("--min-popularity="))?.split("=")[1] || "0"
  );

  console.log(`
Embedding Generation
====================
Mode: ${dryRun ? "DRY RUN" : "LIVE"}
Limit: ${limit}
Min Popularity: ${minPopularity}
`);

  const stats = await generateMovieEmbeddings({
    limit,
    minPopularity,
    dryRun,
  });

  console.log(`
Results
=======
Processed: ${stats.processed}
Skipped: ${stats.skipped}
Errors: ${stats.errors}
Tokens Used: ${stats.tokensUsed}
Estimated Cost: $${((stats.tokensUsed * 0.00002) / 1000).toFixed(4)}
`);
}

main().catch(console.error);
```

---

## Phase 3: Hybrid Search with RRF

### Objective

Combine fuzzy and semantic search for best-of-both-worlds results.

### Duration: 2-3 days

### Tasks

#### 3.1 Query Intent Classification

```typescript
// src/lib/search/intent.ts

export type QueryIntent = "title" | "semantic" | "person" | "filter" | "mixed";

interface IntentAnalysis {
  intent: QueryIntent;
  confidence: number;
  extractedFilters?: {
    genres?: string[];
    year?: number;
    decade?: string;
    person?: string;
  };
}

const SEMANTIC_INDICATORS = new Set([
  "like",
  "similar",
  "vibe",
  "mood",
  "feel",
  "about",
  "with",
  "featuring",
  "best",
  "top",
  "great",
  "good",
  "funny",
  "scary",
  "dark",
  "light",
  "emotional",
  "action",
  "adventure",
  "romantic",
  "thrilling",
]);

const FILTER_PATTERNS = {
  year: /\b(19|20)\d{2}\b/,
  decade: /\b(19|20)\d0s\b/i,
  genre: /\b(action|comedy|drama|horror|thriller|romance|sci-fi|fantasy|documentary)\b/i,
  fromYear: /\bfrom\s+(19|20)\d{2}\b/i,
  beforeYear: /\bbefore\s+(19|20)\d{2}\b/i,
  afterYear: /\bafter\s+(19|20)\d{2}\b/i,
};

/**
 * Analyze query to determine search intent.
 */
export function classifyQueryIntent(query: string): IntentAnalysis {
  const normalized = query.toLowerCase().trim();
  const words = normalized.split(/\s+/);

  // Check for quoted exact title search
  if (/^["'].*["']$/.test(query)) {
    return { intent: "title", confidence: 0.95 };
  }

  // Check for person-focused query
  if (words.some((w) => ["by", "starring", "directed", "with"].includes(w))) {
    return { intent: "person", confidence: 0.8 };
  }

  // Count semantic indicators
  const semanticCount = words.filter((w) => SEMANTIC_INDICATORS.has(w)).length;
  const hasFilterPatterns = Object.values(FILTER_PATTERNS).some((p) => p.test(normalized));

  // Extract filters
  const extractedFilters: IntentAnalysis["extractedFilters"] = {};

  const yearMatch = normalized.match(FILTER_PATTERNS.year);
  if (yearMatch) extractedFilters.year = parseInt(yearMatch[0]);

  const decadeMatch = normalized.match(FILTER_PATTERNS.decade);
  if (decadeMatch) extractedFilters.decade = decadeMatch[0];

  const genreMatch = normalized.match(FILTER_PATTERNS.genre);
  if (genreMatch) extractedFilters.genres = [genreMatch[0]];

  // Determine intent based on signals
  if (semanticCount >= 2 || words.length > 5) {
    return {
      intent: "semantic",
      confidence: 0.7 + semanticCount * 0.1,
      extractedFilters: hasFilterPatterns ? extractedFilters : undefined,
    };
  }

  if (hasFilterPatterns) {
    return {
      intent: "filter",
      confidence: 0.75,
      extractedFilters,
    };
  }

  if (words.length <= 3 && semanticCount === 0) {
    return { intent: "title", confidence: 0.7 };
  }

  return {
    intent: "mixed",
    confidence: 0.5,
    extractedFilters: hasFilterPatterns ? extractedFilters : undefined,
  };
}
```

#### 3.2 Reciprocal Rank Fusion

```typescript
// src/lib/search/hybrid.ts

import { fuzzySearch, FuzzySearchResult } from "@/server/db/postgres/fuzzy-search";
import { semanticSearch, SemanticSearchResult } from "@/server/db/postgres/semantic-search";
import { classifyQueryIntent } from "./intent";

const RRF_K = 60; // Standard RRF constant

export interface HybridSearchResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  score: number;
  posterPath: string | null;
  year: string | null;
  overview?: string | null;
  matchType: "fuzzy" | "semantic" | "both";
}

export interface HybridSearchOptions {
  limit?: number;
  mediaTypes?: ("movie" | "series" | "person")[];
  boostPopular?: boolean;
  filters?: {
    genres?: number[];
    yearRange?: [number, number];
  };
}

/**
 * Hybrid search combining fuzzy and semantic search with RRF scoring.
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<{
  results: HybridSearchResult[];
  intent: ReturnType<typeof classifyQueryIntent>;
  suggestions?: string[];
}> {
  const { limit = 20, mediaTypes, boostPopular = true, filters } = options;

  // Analyze query intent
  const intent = classifyQueryIntent(query);

  // Determine search weights based on intent
  const weights = getSearchWeights(intent.intent);

  // Run searches in parallel
  const [fuzzyResults, semanticResults] = await Promise.all([
    weights.fuzzy > 0
      ? fuzzySearch(query, {
          limit: limit * 2,
          mediaTypes: mediaTypes?.filter((t) => t !== "person") as any,
          boostPopular,
        })
      : [],
    weights.semantic > 0
      ? semanticSearch(query, {
          limit: limit * 2,
          filters,
        })
      : [],
  ]);

  // Apply RRF scoring
  const scoreMap = new Map<
    string,
    {
      result: HybridSearchResult;
      fuzzyRank: number | null;
      semanticRank: number | null;
      rrfScore: number;
    }
  >();

  // Process fuzzy results
  fuzzyResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.fuzzy / (RRF_K + rank + 1);

    scoreMap.set(key, {
      result: {
        id: result.id,
        title: result.title,
        mediaType: result.mediaType,
        score: 0,
        posterPath: result.posterPath,
        year: result.year,
        matchType: "fuzzy",
      },
      fuzzyRank: rank,
      semanticRank: null,
      rrfScore: rrfContribution,
    });
  });

  // Process semantic results
  semanticResults.forEach((result, rank) => {
    const key = `${result.mediaType}:${result.id}`;
    const rrfContribution = weights.semantic / (RRF_K + rank + 1);

    if (scoreMap.has(key)) {
      const existing = scoreMap.get(key)!;
      existing.semanticRank = rank;
      existing.rrfScore += rrfContribution;
      existing.result.matchType = "both";
      existing.result.overview = result.overview;
    } else {
      scoreMap.set(key, {
        result: {
          id: result.id,
          title: result.title,
          mediaType: result.mediaType,
          score: 0,
          posterPath: result.posterPath,
          year: result.year,
          overview: result.overview,
          matchType: "semantic",
        },
        fuzzyRank: null,
        semanticRank: rank,
        rrfScore: rrfContribution,
      });
    }
  });

  // Sort by RRF score and apply final score
  const sortedResults = Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ result, rrfScore }) => ({
      ...result,
      score: rrfScore,
    }));

  return {
    results: sortedResults,
    intent,
  };
}

function getSearchWeights(intent: string): { fuzzy: number; semantic: number } {
  switch (intent) {
    case "title":
      return { fuzzy: 0.8, semantic: 0.2 };
    case "semantic":
      return { fuzzy: 0.2, semantic: 0.8 };
    case "person":
      return { fuzzy: 0.9, semantic: 0.1 };
    case "filter":
      return { fuzzy: 0.3, semantic: 0.7 };
    default:
      return { fuzzy: 0.4, semantic: 0.6 };
  }
}
```

#### 3.3 Search API Endpoint

```typescript
// src/app/api/search/route.ts

import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/lib/search/hybrid";
import { z } from "zod";

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
  type: z.enum(["all", "movie", "series", "person"]).optional().default("all"),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = SearchParamsSchema.parse({
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      type: searchParams.get("type"),
    });

    const mediaTypes =
      params.type === "all" ? undefined : [params.type as "movie" | "series" | "person"];

    const { results, intent, suggestions } = await hybridSearch(params.q, {
      limit: params.limit,
      mediaTypes,
    });

    return NextResponse.json({
      query: params.q,
      intent: intent.intent,
      results,
      suggestions,
      count: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", details: error.errors },
        { status: 400 }
      );
    }
    throw error;
  }
}
```

---

## Phase 4: AI Agent Integration

### Objective

Enhance the AI agent with semantic search capabilities for more intelligent recommendations.

### Duration: 2-3 days

### Tasks

#### 4.1 New Semantic Search Tool

```typescript
// src/server/ai/tools/semantic-search.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { hybridSearch } from "@/lib/search/hybrid";
import { aiToolLogger } from "@/lib/logger";

const semanticSearchSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language description of what to find. Examples: " +
        "'mind-bending sci-fi', 'feel-good movies about friendship', " +
        "'dark thrillers with plot twists', 'movies similar to Inception'"
    ),
  mediaType: z
    .enum(["movie", "series", "all"])
    .optional()
    .default("all")
    .describe("Filter by content type"),
  limit: z.number().min(1).max(15).optional().default(8).describe("Number of results to return"),
});

type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

export const semanticSearchTool = tool(
  async (input: SemanticSearchInput) => {
    const startTime = Date.now();

    try {
      const mediaTypes =
        input.mediaType === "all" ? (["movie", "series"] as const) : ([input.mediaType] as const);

      const { results, intent } = await hybridSearch(input.query, {
        limit: input.limit,
        mediaTypes: [...mediaTypes],
      });

      aiToolLogger.info({
        event: "semantic_search",
        query: input.query,
        intent: intent.intent,
        resultCount: results.length,
        durationMs: Date.now() - startTime,
      });

      // Format for LLM consumption
      const formattedResults = results.map((r, i) => ({
        rank: i + 1,
        type: r.mediaType,
        id: r.id,
        title: r.title,
        year: r.year,
        score: r.score.toFixed(3),
        matchType: r.matchType,
        overview: r.overview?.slice(0, 150),
      }));

      return JSON.stringify({
        query: input.query,
        searchType: intent.intent,
        totalResults: results.length,
        results: formattedResults,
      });
    } catch (error) {
      aiToolLogger.error({
        event: "semantic_search_error",
        query: input.query,
        error: error instanceof Error ? error.message : String(error),
      });

      return JSON.stringify({
        error: "Search failed",
        query: input.query,
        results: [],
      });
    }
  },
  {
    name: "semantic_search",
    description: `
Search for movies and series using natural language descriptions.
This tool understands context, mood, themes, and finds semantically similar content.

**USE THIS TOOL FOR:**
- Descriptive queries: "dark thrillers", "feel-good comedies"
- Mood/vibe requests: "something like Inception", "mind-bending movies"
- Thematic searches: "movies about redemption", "found family stories"
- Comparative requests: "similar to Breaking Bad", "movies like The Matrix"
- Complex descriptions: "underrated sci-fi with philosophical themes"

**DO NOT USE FOR:**
- Specific titles (use regular search): "The Dark Knight", "Inception"
- Person searches: "Tom Hanks movies" (use search or discover with cast filter)
- Exact filters: "horror movies from 2020" (use discover tool)

Returns ranked results with relevance scores and match types.
    `,
    schema: semanticSearchSchema,
  }
);
```

#### 4.2 Enhanced "Find Similar" Tool

```typescript
// src/server/ai/tools/similar.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { findSimilarByEmbedding } from "@/server/db/postgres/semantic-search";
import { getRecommendations } from "@/server/services/tmdb";
import { aiToolLogger } from "@/lib/logger";

const findSimilarSchema = z.object({
  id: z.number().describe("TMDB ID of the movie or series"),
  mediaType: z.enum(["movie", "series"]).describe("Type of content"),
  limit: z.number().min(1).max(15).optional().default(8),
  useEmbeddings: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use semantic similarity (true) or TMDB recommendations (false)"),
});

type FindSimilarInput = z.infer<typeof findSimilarSchema>;

export const findSimilarTool = tool(
  async (input: FindSimilarInput) => {
    try {
      let results;

      if (input.useEmbeddings) {
        // Try embedding-based similarity first
        const embeddingResults = await findSimilarByEmbedding(
          input.id,
          input.mediaType,
          input.limit
        );

        if (embeddingResults.length >= input.limit / 2) {
          results = embeddingResults.map((r, i) => ({
            rank: i + 1,
            type: r.mediaType,
            id: r.id,
            title: r.title,
            year: r.year,
            similarity: r.score.toFixed(3),
            source: "embedding",
          }));
        }
      }

      // Fallback or supplement with TMDB recommendations
      if (!results || results.length < input.limit) {
        const tmdbRecs = await getRecommendations(input.id, input.mediaType);
        const tmdbResults = tmdbRecs.results.slice(0, input.limit).map((r, i) => ({
          rank: i + 1,
          type: input.mediaType,
          id: r.id,
          title: input.mediaType === "movie" ? r.title : r.name,
          year: (input.mediaType === "movie" ? r.release_date : r.first_air_date)?.slice(0, 4),
          source: "tmdb",
        }));

        results = results
          ? [...results, ...tmdbResults.filter((t) => !results!.some((r) => r.id === t.id))]
          : tmdbResults;
      }

      return JSON.stringify({
        sourceId: input.id,
        sourceType: input.mediaType,
        results: results?.slice(0, input.limit) || [],
      });
    } catch (error) {
      aiToolLogger.error({
        event: "find_similar_error",
        id: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return JSON.stringify({
        error: "Failed to find similar content",
        sourceId: input.id,
        results: [],
      });
    }
  },
  {
    name: "find_similar",
    description: `
Find movies or series similar to a specific item.
Uses semantic embeddings for deep similarity matching, with TMDB fallback.

**Use when user says:**
- "More like this"
- "Similar to [movie name]"
- "If I liked X, what else would I enjoy?"
- "Movies/shows in the same vein as..."

Requires the TMDB ID of the source item.
Returns items ranked by similarity score.
    `,
    schema: findSimilarSchema,
  }
);
```

#### 4.3 Update Tool Registry

```typescript
// src/server/ai/tools/index.ts - Update exports

// Add new semantic tools
export { semanticSearchTool } from "./semantic-search";
export { findSimilarTool } from "./similar";

// Update allTools array
export const allTools = [
  // Search & Discovery
  searchTool, // Keyword/title search (existing)
  semanticSearchTool, // NEW: Natural language semantic search
  discoverTool, // Filter-based discovery (existing)
  getTrendingTool, // Trending content (existing)

  // Details & Similar
  getDetailsTool, // Movie/series details (existing)
  findSimilarTool, // NEW: Embedding-based similarity
  getPersonTool, // Person info (existing)
  getUpcomingTool, // Upcoming releases (existing)

  // User & Context
  getUserDataTool, // User library (existing)
  getPageContextTool, // Current page (existing)
  navigateTool, // Navigation (existing)
];
```

#### 4.4 Update System Prompt

Add guidance for when to use semantic search vs. other tools:

```typescript
// In src/server/ai/prompts/system.ts

const SEARCH_TOOL_GUIDANCE = `
## Search Tool Selection Guide

Choose the right search tool based on user intent:

### Use \`semantic_search\` for:
- Mood/vibe queries: "dark thrillers", "feel-good movies"
- Descriptive requests: "mind-bending sci-fi about identity"
- Comparative: "movies like Inception", "similar to Breaking Bad"
- Thematic: "stories about redemption", "found family narratives"
- Complex descriptions: "underrated 90s films with twist endings"

### Use \`search\` (keyword) for:
- Specific titles: "The Dark Knight", "Breaking Bad"
- Person names: "Christopher Nolan"
- Exact lookups when user knows what they want

### Use \`discover\` for:
- Structured filters: "Korean horror from 2020s"
- Multiple criteria: "comedy + romance + high rating"
- Streaming availability: "on Netflix"
- Cast/crew filters: "directed by Denis Villeneuve"

### Use \`find_similar\` for:
- "More like this" on a specific item
- When user references something from current page context
- Follow-up after showing a specific movie/series

### Examples:
User: "something like Inception but darker"
→ Use semantic_search with "mind-bending thriller darker than Inception"

User: "The Godfather"
→ Use search (exact title lookup)

User: "horror movies from Korea"
→ Use discover with genre + country filters

User: "I loved that! More like this"
→ Use find_similar with the item ID from context
`;
```

---

## Phase 5: Advanced Features

### 5.1 User Taste Embeddings (Personalization)

```sql
-- Add taste embedding to users table
ALTER TABLE users ADD COLUMN taste_embedding vector(1024);
ALTER TABLE users ADD COLUMN taste_updated_at TIMESTAMP;
```

```typescript
// src/lib/personalization/taste-profile.ts

import { prisma } from "@/lib/prisma";

/**
 * Generate a taste embedding for a user based on their ratings.
 * Positive ratings (likes) pull toward those embeddings,
 * negative ratings (dislikes) push away.
 */
export async function updateUserTasteEmbedding(userId: number): Promise<void> {
  // Get user's rated items
  const ratings = await prisma.userRating.findMany({
    where: { userId },
    select: {
      movieId: true,
      seriesId: true,
      rating: true,
    },
  });

  if (ratings.length === 0) return;

  // Get embeddings for rated movies
  const movieIds = ratings.filter((r) => r.movieId).map((r) => r.movieId!);
  const seriesIds = ratings.filter((r) => r.seriesId).map((r) => r.seriesId!);

  const [movieEmbeddings, seriesEmbeddings] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number; embedding: number[] }>>`
      SELECT id, embedding::float[] as embedding
      FROM movies
      WHERE id = ANY(${movieIds})
        AND embedding IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ id: number; embedding: number[] }>>`
      SELECT id, embedding::float[] as embedding
      FROM series
      WHERE id = ANY(${seriesIds})
        AND embedding IS NOT NULL
    `,
  ]);

  // Build embedding lookup
  const embeddingMap = new Map<string, number[]>();
  movieEmbeddings.forEach((m) => embeddingMap.set(`movie:${m.id}`, m.embedding));
  seriesEmbeddings.forEach((s) => embeddingMap.set(`series:${s.id}`, s.embedding));

  // Compute weighted average
  // Likes (+1) add positively, dislikes (-1) add negatively (inverted)
  const dimension = 1024; // Match Amazon Titan V2 dimensions
  const tasteVector = new Array(dimension).fill(0);
  let totalWeight = 0;

  for (const rating of ratings) {
    const key = rating.movieId ? `movie:${rating.movieId}` : `series:${rating.seriesId}`;
    const embedding = embeddingMap.get(key);

    if (!embedding) continue;

    const weight = rating.rating; // +1 for like, -1 for dislike
    totalWeight += Math.abs(weight);

    for (let i = 0; i < dimension; i++) {
      tasteVector[i] += embedding[i] * weight;
    }
  }

  if (totalWeight === 0) return;

  // Normalize
  for (let i = 0; i < dimension; i++) {
    tasteVector[i] /= totalWeight;
  }

  // Update user's taste embedding
  await prisma.$executeRaw`
    UPDATE users 
    SET 
      taste_embedding = ${JSON.stringify(tasteVector)}::vector,
      taste_updated_at = NOW()
    WHERE id = ${userId}
  `;
}

/**
 * Get personalized recommendations for a user.
 */
export async function getPersonalizedRecommendations(
  userId: number,
  options: { limit?: number; excludeWatched?: boolean } = {}
): Promise<Array<{ id: number; title: string; matchScore: number }>> {
  const { limit = 20, excludeWatched = true } = options;

  // Get user's taste embedding
  const user = await prisma.$queryRaw<Array<{ taste_embedding: number[] }>>`
    SELECT taste_embedding::float[] as taste_embedding
    FROM users
    WHERE id = ${userId}
      AND taste_embedding IS NOT NULL
  `;

  if (!user[0]?.taste_embedding) return [];

  const tasteEmbedding = `[${user[0].taste_embedding.join(",")}]`;

  // Find movies closest to user's taste
  const excludeClause = excludeWatched
    ? `AND m.id NOT IN (SELECT movie_id FROM watched_movies WHERE user_id = ${userId})`
    : "";

  const recommendations = await prisma.$queryRawUnsafe<
    Array<{ id: number; title: string; match_score: number }>
  >(`
    SELECT 
      m.id,
      m.title,
      1 - (m.embedding <=> '${tasteEmbedding}'::vector) as match_score
    FROM movies m
    WHERE m.embedding IS NOT NULL
      ${excludeClause}
    ORDER BY m.embedding <=> '${tasteEmbedding}'::vector
    LIMIT ${limit}
  `);

  return recommendations.map((r) => ({
    id: r.id,
    title: r.title,
    matchScore: r.match_score,
  }));
}
```

### 5.2 Query Expansion

```typescript
// src/lib/search/query-expansion.ts

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

/**
 * Expand a search query into related queries for broader coverage.
 */
export async function expandQuery(query: string): Promise<string[]> {
  const prompt = `
Given this movie/TV search query: "${query}"

Generate 3 alternative search queries that capture similar intent but use different words.
Focus on synonyms, related concepts, and different phrasings.

Return ONLY a JSON array of strings, no explanation.
Example: ["alternative 1", "alternative 2", "alternative 3"]
`;

  try {
    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
        contentType: "application/json",
      })
    );

    const result = JSON.parse(new TextDecoder().decode(response.body));
    const content = result.content[0].text;

    // Parse JSON array from response
    const expansions = JSON.parse(content);
    return [query, ...expansions];
  } catch (error) {
    console.error("Query expansion failed:", error);
    return [query];
  }
}
```

### 5.3 Incremental Embedding Updates

```typescript
// src/lib/embeddings/incremental.ts

import { prisma } from "@/lib/prisma";
import { generateQueryEmbedding } from "./generator";
import { buildMovieEmbeddingText } from "./text-builder";

/**
 * Update embedding when AI data is generated/updated.
 * Called from the enrichment pipeline.
 */
export async function updateMovieEmbedding(movieId: number): Promise<void> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true } },
      credits: { include: { person: true } },
      aiData: true,
    },
  });

  if (!movie) return;

  const director = movie.credits.find((c) => c.job === "Director")?.person.name;
  const topCast = movie.credits
    .filter((c) => c.creditType === "CAST")
    .slice(0, 5)
    .map((c) => c.person.name);

  const embeddingText = buildMovieEmbeddingText({
    title: movie.title,
    overview: movie.overview,
    tagline: movie.tagline,
    genres: movie.genres.map((g) => g.genre.name),
    keywords: movie.keywords.map((k) => k.keyword.name),
    director,
    topCast,
    themes: movie.aiData?.themes || undefined,
    mood: (movie.aiData?.mood as any) || undefined,
    quickTake: movie.aiData?.quickTake || undefined,
  });

  const embedding = await generateQueryEmbedding(embeddingText);

  await prisma.$executeRaw`
    UPDATE movies 
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${movieId}
  `;
}
```

---

## Phase 6: Future Enhancements

### 6.1 Multimodal Search (Poster Embeddings)

Use CLIP or similar models to embed movie posters for visual similarity search:

```typescript
// Future: Visual similarity search
interface VisualSearchResult {
  id: number;
  title: string;
  visualSimilarity: number;
}

// "Find movies with similar poster aesthetics"
async function visualSimilaritySearch(movieId: number): Promise<VisualSearchResult[]> {
  // Use CLIP embeddings stored in a separate column
  // poster_embedding vector(512)
}
```

### 6.2 Real-time Search Analytics

Track search patterns to improve:

- Popular queries without good results
- Query intent misclassification
- Search-to-click ratios

```typescript
// Track search analytics
interface SearchEvent {
  query: string;
  intent: string;
  resultCount: number;
  clickedResults: number[];
  timestamp: Date;
  userId?: number;
}
```

### 6.3 Collaborative Filtering Hybrid

Combine content-based embeddings with collaborative filtering:

```sql
-- Users with similar taste embeddings
SELECT u2.id, 1 - (u1.taste_embedding <=> u2.taste_embedding) as similarity
FROM users u1, users u2
WHERE u1.id = $1 AND u2.id != u1.id
  AND u1.taste_embedding IS NOT NULL
  AND u2.taste_embedding IS NOT NULL
ORDER BY u1.taste_embedding <=> u2.taste_embedding
LIMIT 50;
```

### 6.4 Cross-Lingual Search

Support queries in multiple languages by:

- Detecting query language
- Using multilingual embedding models
- Translating queries before embedding

---

## Cost Analysis

### One-Time Costs

| Item                            | Quantity   | Unit Cost          | Total  |
| ------------------------------- | ---------- | ------------------ | ------ |
| Movie embeddings (existing ~5K) | 5,000      | $0.00002/1K tokens | ~$0.50 |
| Movie embeddings (full ~500K)   | 500,000    | $0.00002/1K tokens | ~$50   |
| Series embeddings (~100K)       | 100,000    | $0.00002/1K tokens | ~$10   |
| Development time                | 15-20 days | -                  | -      |

### Recurring Costs

| Item                   | Volume               | Unit Cost          | Monthly Cost   |
| ---------------------- | -------------------- | ------------------ | -------------- |
| Query embeddings       | 750K/month (25K/day) | $0.00002/1K tokens | ~$15           |
| New content embeddings | 1K/month             | $0.00002/1K tokens | ~$0.02         |
| PostgreSQL storage     | ~1GB vectors         | -                  | Minimal        |
| **Total**              |                      |                    | **~$15/month** |

### Cost Optimization Strategies

1. **Cache query embeddings** - Same queries don't need re-embedding
2. **Batch new content** - Generate embeddings in daily batches
3. **Limit to popular content** - Only embed movies with popularity > threshold
4. **Use smaller dimensions** - `text-embedding-3-small` supports dimension reduction

---

## Success Metrics

### Search Quality Metrics

| Metric               | Current  | Target | Measurement                                  |
| -------------------- | -------- | ------ | -------------------------------------------- |
| Typo tolerance       | 0%       | 95%    | Queries with typos returning correct results |
| Semantic recall      | 0%       | 80%    | "Movies like X" returning relevant items     |
| Search latency (p50) | 200ms    | <100ms | PostgreSQL-first search                      |
| Search latency (p99) | 500ms    | <300ms | With embedding generation                    |
| Click-through rate   | Baseline | +20%   | Clicked results / shown results              |

### User Experience Metrics

| Metric                     | Target | Measurement                     |
| -------------------------- | ------ | ------------------------------- |
| "Did you mean?" acceptance | >30%   | Users clicking suggestions      |
| Zero-result queries        | <5%    | Queries with no results         |
| Search-to-discovery        | >15%   | Searches leading to detail page |

### Technical Metrics

| Metric                    | Target  | Measurement            |
| ------------------------- | ------- | ---------------------- |
| Index build time          | <1 hour | HNSW index creation    |
| Query embedding latency   | <50ms   | OpenAI API call        |
| Similarity search latency | <20ms   | pgvector query         |
| Embedding coverage        | >90%    | Movies with embeddings |

---

## Risk Assessment

### Technical Risks

| Risk                     | Likelihood | Impact | Mitigation                           |
| ------------------------ | ---------- | ------ | ------------------------------------ |
| OpenAI API rate limits   | Medium     | High   | Batch requests, caching, retry logic |
| Embedding quality issues | Low        | Medium | A/B testing, human evaluation        |
| Index memory usage       | Medium     | Medium | Monitor, use IVFFlat if needed       |
| Cold start latency       | Low        | Low    | Cache warming, connection pooling    |

### Operational Risks

| Risk             | Likelihood | Impact | Mitigation                       |
| ---------------- | ---------- | ------ | -------------------------------- |
| API cost overrun | Low        | Medium | Budget alerts, usage monitoring  |
| Embedding drift  | Medium     | Low    | Regular re-embedding, monitoring |
| Data consistency | Low        | High   | Transactions, embedding on write |

---

## Implementation Timeline

### Week 1: Foundation

- [ ] Day 1-2: Phase 1 - Trigram indexes + fuzzy search
- [ ] Day 3-4: Phase 2 - Embedding pipeline setup
- [ ] Day 5: Phase 2 - Initial batch embedding generation

### Week 2: Core Search

- [ ] Day 6-7: Phase 2 - Semantic search implementation
- [ ] Day 8-9: Phase 3 - Hybrid search + RRF
- [ ] Day 10: Phase 3 - Search API + testing

### Week 3: AI Integration

- [ ] Day 11-12: Phase 4 - AI agent tools
- [ ] Day 13: Phase 4 - System prompt updates
- [ ] Day 14-15: Integration testing + optimization

### Week 4: Polish & Deploy

- [ ] Day 16-17: UI integration + suggestions
- [ ] Day 18: Performance tuning
- [ ] Day 19: Documentation
- [ ] Day 20: Deployment + monitoring

---

## Appendix A: SQL Reference

### Useful Queries

```sql
-- Check embedding coverage
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / COUNT(*), 2) as coverage_pct
FROM movies;

-- Find movies without embeddings
SELECT id, title, popularity
FROM movies
WHERE embedding IS NULL
ORDER BY popularity DESC
LIMIT 100;

-- Test similarity search performance
EXPLAIN ANALYZE
SELECT id, title, 1 - (embedding <=> '[...]'::vector) as similarity
FROM movies
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[...]'::vector
LIMIT 10;

-- Check index usage
SELECT
  schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%' OR indexname LIKE '%trgm%';
```

---

## Appendix B: Package Dependencies

```json
{
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.x",
    "@prisma/client": "^6.x"
  },
  "devDependencies": {
    "@types/node": "^20.x"
  }
}
```

Note: `@aws-sdk/client-bedrock-runtime` is already installed for the AI agent.

---

## Appendix C: Environment Variables

```bash
# .env.local - embeddings use SAME credentials as AI agent

# AWS Credentials (already configured for AI agent)
AWS_ACCESS_KEY_ID=AKIA...       # ← Already in your .env.local
AWS_SECRET_ACCESS_KEY=...       # ← Already in your .env.local
BEDROCK_REGION=us-east-1        # ← Already in your .env.local (used by both)

# Feature flags (future)
# ENABLE_SEMANTIC_SEARCH=true
# ENABLE_FUZZY_SEARCH=true
```

**Note:** No new environment variables needed - embedding generator uses the same `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `BEDROCK_REGION` as the AI agent.

---

## Document History

| Version | Date       | Author   | Changes                    |
| ------- | ---------- | -------- | -------------------------- |
| 1.0     | 2026-01-10 | AI Agent | Initial comprehensive plan |
