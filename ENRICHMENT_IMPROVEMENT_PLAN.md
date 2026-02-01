# AI Enrichment System - Improvement Plan

> Analysis completed: Jan 2026
> Final architecture: Flexible tag-based insights with enforced subcategories

---

## Executive Summary

Transform the AI enrichment system from column-based storage to a **flexible tag-based architecture** that:
1. Enables spoiler-gated content for better user engagement
2. Powers semantic search with properly categorized insights
3. Supports icons and visual indicators for key attributes (UI-derived from subcategory)
4. Scales without schema changes as we add new insight types

---

## Final Architecture: Tag-Based Insights

### Database Schema (Prisma)

```prisma
// Simplified AiData - only top-level items
model AiData {
  id       Int  @id @default(autoincrement())
  movieId  Int? @unique @map("movie_id")
  seriesId Int? @unique @map("series_id")

  // Top-level (always shown)
  hook     String?

  // Raw input for AI chat context (full markdown sent to LLM)
  rawInput String? @map("raw_input") @db.Text

  // Metadata
  generatedAt DateTime? @map("generated_at")
  modelId     String?   @map("model_id")
  version     Int       @default(1)

  movie    Movie?      @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series   Series?     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  insights AiInsight[]

  @@map("ai_data")
}

// Flexible insights table - one-to-many
model AiInsight {
  id       Int @id @default(autoincrement())
  aiDataId Int @map("ai_data_id")

  text         String
  category     InsightCategory
  subcategory  String?                              // Enforced via validation
  spoilerLevel SpoilerLevel @default(FREE) @map("spoiler_level")
  priority     Int          @default(50)

  aiData AiData @relation(fields: [aiDataId], references: [id], onDelete: Cascade)

  @@index([aiDataId, category])
  @@index([aiDataId, spoilerLevel])
  @@index([category, subcategory])
  @@index([category, text])  // For MOOD queries
  @@map("ai_insights")
}

enum InsightCategory {
  VIBE       // Quick take pills
  THEME      // Thematic elements
  MOOD       // Pacing, intensity, tone, emotional
  BEST_FOR   // Viewing contexts
  HIGHLIGHT  // Standout aspects
  HEADS_UP   // Content warnings
  QUESTION   // Conversation starters
  DEEP_DIVE  // Post-watch: trivia, insights, memorable, cultural
}

enum SpoilerLevel {
  FREE
  LIGHT
  HEAVY
}
```

### Enforced Subcategories (8 Categories)

| Category | Subcategories | Text Constraint |
|----------|---------------|-----------------|
| **VIBE** | `null` | Freeform |
| **THEME** | `null` | Freeform |
| **MOOD** | `pacing`, `intensity`, `tone`, `emotional` | `slow\|steady\|fast`, `low\|medium\|high`, `dark\|light\|mixed`, `light\|medium\|heavy` |
| **BEST_FOR** | `theatre`, `streaming`, `date_night`, `solo`, `friends`, `family`, `kids`, `rewatch`, `background`, `binge` | Freeform |
| **HIGHLIGHT** | `acting`, `direction`, `cinematography`, `score`, `sound`, `vfx`, `practical`, `writing`, `editing`, `production`, `costume`, `stunt` | Freeform |
| **HEADS_UP** | `violence`, `gore`, `disturbing`, `triggers`, `sad`, `jumpscares`, `language`, `sexual`, `drugs` | Freeform |
| **QUESTION** | `pre_watch`, `post_watch` | Freeform |
| **DEEP_DIVE** | `trivia`, `insight`, `memorable`, `cultural` | Freeform |

### UI Icon Mapping (Derived from Subcategory)

```typescript
// Icons determined by UI based on subcategory - NOT stored in DB
const SUBCATEGORY_ICONS = {
  // BEST_FOR
  theatre: '🎬', streaming: '📺', date_night: '💕', solo: '🧘',
  friends: '👥', family: '👨‍👩‍👧', kids: '👶', rewatch: '🔄',
  background: '🔇', binge: '📺',

  // HIGHLIGHT
  acting: '🎭', direction: '🎬', cinematography: '📷', score: '🎵',
  sound: '🔊', vfx: '✨', practical: '🎪', writing: '✍️',
  editing: '🎞️', production: '🏛️', costume: '👗', stunt: '💥',

  // HEADS_UP
  violence: '⚠️', gore: '🩸', disturbing: '😰', triggers: '⚡',
  sad: '😢', jumpscares: '👻', language: '🗣️', sexual: '🔞', drugs: '💊',

  // DEEP_DIVE
  trivia: '🎯', insight: '💡', memorable: '🎬', cultural: '🌍',

  // MOOD
  pacing: '⏱️', intensity: '🔥', tone: '🎨', emotional: '💔',
};
```

### Category Taxonomy

#### THEME (thematic elements)
- No subcategory needed
- Examples: "Identity crisis", "Corporate dystopia", "Father-son redemption"
- Icon: none (text-only)
- Spoiler: Usually FREE

#### BEST_FOR (viewing contexts)
| Subcategory | Icon | Example |
|-------------|------|---------|
| `theatre` | 🎬 | "Worth the IMAX ticket" |
| `streaming` | 📺 | "Perfect couch watch" |
| `date_night` | 💕 | "Great date movie (unless you want to talk after)" |
| `solo` | 🧘 | "Solo watch - you'll want to process alone" |
| `friends` | 👥 | "Best with friends who appreciate dark humor" |
| `family` | 👨‍👩‍👧 | "Family-friendly adventure" |
| `kids` | 👶 | "Safe for kids 8+" |
| `background` | 🔇 | "Good background watch while multitasking" |
| `rewatch` | 🔄 | "Gets better on rewatch" |
| `binge` | 📺 | "You'll want to binge this" |
| `drunk` | 🍺 | "Better after a few drinks" |
| `emotional_bandwidth` | 🔋 | "Requires emotional bandwidth" |

#### HEADS_UP (content warnings)
| Subcategory | Icon | Example |
|-------------|------|---------|
| `violence` | ⚠️ | "Graphic violence" |
| `gore` | 🩸 | "Body horror elements" |
| `language` | 🗣️ | "Heavy language throughout" |
| `sexual` | 🔞 | "Sexual content" |
| `drugs` | 💊 | "Drug use depicted" |
| `disturbing` | 😰 | "Psychologically disturbing" |
| `triggers` | ⚡ | "May trigger anxiety" |
| `sad` | 😢 | "Emotionally devastating" |
| `jumpscares` | 👻 | "Frequent jump scares" |

#### HIGHLIGHT (standout aspects)
| Subcategory | Icon | Example |
|-------------|------|---------|
| `acting` | 🎭 | "Career-defining performance from Phoenix" |
| `direction` | 🎬 | "Nolan at his most ambitious" |
| `cinematography` | 📷 | "Every frame is a painting" |
| `score` | 🎵 | "Hans Zimmer absolutely delivers" |
| `sound_design` | 🔊 | "The sound design is immersive" |
| `vfx` | ✨ | "Groundbreaking visual effects" |
| `practical` | 🎪 | "Practical effects that still hold up" |
| `writing` | ✍️ | "Razor-sharp dialogue" |
| `editing` | 🎞️ | "Masterful editing" |
| `costume` | 👗 | "Oscar-worthy costumes" |
| `production` | 🏛️ | "Incredible production design" |
| `stunt` | 💥 | "Mind-blowing stunt work" |

#### QUESTION (conversation starters)
- Subcategory: `pre_watch` or `post_watch`
- Pre-watch examples: "Is this actually good or just meme-worthy?"
- Post-watch examples: "Was the twist earned or cheap?"
- Spoiler: `pre_watch` = FREE, `post_watch` = HEAVY

#### INSIGHT (post-watch analysis)
- Always spoiler-gated (LIGHT or HEAVY)
- Examples: "The narrator's unreliability is hinted at from scene one"
- Icon: 💡

#### QUOTE (memorable lines)
- Can be FREE (iconic, context-free) or HEAVY (spoiler context)
- Examples: "You can't handle the truth!"
- Icon: 💬

#### TRIVIA (fun facts / hidden details)
- Can be FREE or HEAVY (if reveals plot)
- Examples: "The director shot for 2 years to capture all seasons"
- Icon: 🎯

#### CULTURAL (cultural impact)
- Usually FREE
- Examples: "Launched the 'elevated horror' genre"
- Icon: 🌍

#### PAIRING (similar movies)
| Subcategory | Example |
|-------------|---------|
| `similar_vibe` | "If you liked Inception for the mind-bending puzzles" |
| `double_feature` | "Double-feature with: Arrival" |
| `universe` | "Part of the MCU - watch after Iron Man 2" |

#### VIBE (quick take descriptors)
- No subcategory
- Examples: "Emotionally devastating", "Cult classic", "Turn off your brain"
- Icon: none (pill/badge display)

---

## Semantic Search Integration

### Why This Structure Enables Powerful Search

With properly categorized insights, we can build **faceted semantic search**:

```sql
-- Find movies with great audio that are good for theatre
SELECT DISTINCT m.id, m.title
FROM movies m
JOIN ai_data ad ON ad.movie_id = m.id
JOIN ai_insights ai ON ai.ai_data_id = ad.id
WHERE ai.category = 'HIGHLIGHT' AND ai.subcategory = 'sound_design'
  AND EXISTS (
    SELECT 1 FROM ai_insights ai2
    WHERE ai2.ai_data_id = ad.id
      AND ai2.category = 'BEST_FOR' AND ai2.subcategory = 'theatre'
  );

-- Find movies safe for kids with no content warnings
SELECT m.id, m.title
FROM movies m
JOIN ai_data ad ON ad.movie_id = m.id
JOIN ai_insights ai ON ai.ai_data_id = ad.id
WHERE ai.category = 'BEST_FOR' AND ai.subcategory = 'kids'
  AND NOT EXISTS (
    SELECT 1 FROM ai_insights ai2
    WHERE ai2.ai_data_id = ad.id
      AND ai2.category = 'HEADS_UP'
  );
```

### Search Use Cases

| Query | Implementation |
|-------|----------------|
| "Movies with great cinematography" | `category=HIGHLIGHT, subcategory=cinematography` |
| "Good date night movies" | `category=BEST_FOR, subcategory=date_night` |
| "Safe for kids" | `category=BEST_FOR, subcategory=kids` |
| "Movies about identity crisis" | `category=THEME, text ILIKE '%identity%'` |
| "Mind-bending thrillers" | `category=VIBE, text ILIKE '%mind-bending%'` |
| "Avoid if anxious" | `category=HEADS_UP, subcategory=triggers` (inverse) |
| "Worth watching in theatre" | `category=BEST_FOR, subcategory=theatre` |
| "Great soundtrack" | `category=HIGHLIGHT, subcategory=score` |

### Embedding Strategy

For advanced semantic search, embed key insights:
1. **THEME** insights → Always embed (core for semantic discovery)
2. **VIBE** insights → Always embed (describes viewing experience)
3. **HIGHLIGHT** insights → Embed (for "movies with great X" queries)
4. **Others** → Optional (embed on demand)

### UI Features Enabled

1. **Filter badges**: "🎬 Great in theatre" | "👶 Kid-friendly" | "🎵 Amazing score"
2. **Smart recommendations**: "Because you watched [X], try these visually stunning films"
3. **Mood-based browse**: Filter by emotional bandwidth, spoiler-free
4. **Spoiler unlock**: Mark as watched → unlock hidden insights

---

## Multi-Pass Extraction Strategy

Since we're extracting more structured data, use **multiple focused passes** rather than one giant prompt.

### Pass 1: Core Summary (Spoiler-Free)
**Focus**: Hook, mood, vibes, themes, basic viewing context
**Output**: ~8 items
```json
{
  "hook": "...",
  "mood": { "pacing": "...", "intensity": "...", "tone": "...", "emotional": "..." },
  "vibes": ["Emotionally devastating", "Cult classic"],
  "themes": ["Identity crisis", "Corporate dystopia"],
  "bestFor": [
    { "subcategory": "solo", "text": "Solo watch - you'll want to process alone" }
  ]
}
```

### Pass 2: Pre-Watch Details (Spoiler-Free)
**Focus**: Highlights, heads-up, pre-watch questions, pairings
**Output**: ~15 items
```json
{
  "highlights": [
    { "subcategory": "acting", "text": "Career-defining performance from Phoenix" },
    { "subcategory": "score", "text": "Hans Zimmer absolutely delivers" }
  ],
  "headsUp": [
    { "subcategory": "violence", "text": "Graphic violence throughout" },
    { "subcategory": "disturbing", "text": "Psychologically disturbing imagery" }
  ],
  "questionsPreWatch": [
    "Is this actually good or just edgy?",
    "Will I become insufferable after watching this?"
  ],
  "pairings": [
    { "subcategory": "similar_vibe", "text": "If you liked American Psycho for the dark satire" }
  ],
  "quotes": [
    { "text": "The first rule of Fight Club is...", "spoilerLevel": "FREE" }
  ]
}
```

### Pass 3: Post-Watch Analysis (Spoiler Content)
**Focus**: Post-watch questions, insights, hidden details, memorable scenes
**Output**: ~10 items
**Prompt modification**: "The viewer HAS watched the movie. You CAN discuss spoilers."
```json
{
  "questionsPostWatch": [
    "How did you not see the twist coming?",
    "Is Tyler right about society? Asking for a friend."
  ],
  "insights": [
    { "text": "The narrator's insomnia is actually a metaphor for...", "spoilerLevel": "HEAVY" },
    { "text": "Notice how Tyler never interacts with anyone else directly", "spoilerLevel": "LIGHT" }
  ],
  "hiddenDetails": [
    { "text": "Starbucks cup in every scene - Fincher's commentary on consumerism", "spoilerLevel": "FREE" },
    { "text": "Tyler appears in single frames before his 'reveal'", "spoilerLevel": "HEAVY" }
  ],
  "memorableScenes": [
    { "text": "The chemical burn scene - raw and unforgettable", "spoilerLevel": "LIGHT" },
    { "text": "The ending with the buildings - cathartic or terrifying?", "spoilerLevel": "HEAVY" }
  ],
  "spoilerQuotes": [
    { "text": "I am Jack's complete lack of surprise", "spoilerLevel": "LIGHT" }
  ]
}
```

### Total Extraction: ~35 structured insights per movie

### Cost Estimate (3 passes)
- Pass 1: ~3000 input + ~400 output = ~3400 tokens
- Pass 2: ~3000 input + ~800 output = ~3800 tokens
- Pass 3: ~3000 input + ~600 output = ~3600 tokens
- **Total**: ~10,800 tokens per movie (~$0.003 with Kimi K2)

### Parallelization
Passes 1 & 2 can run in parallel (both use same input, no dependencies).
Pass 3 can also run in parallel but uses different prompt.

---

## Current State

### Pipeline Flow
```
Admin UI Button → POST /api/admin/enrich
                       ↓
              npx tsx enrich-content.ts (120s timeout)
                       ↓
              npx tsx summarize-movies.ts --force (180s timeout)
                       ↓
              revalidatePath() → Page refreshed
```

### Current Timing (Single Movie)
| Phase | Duration | Details |
|-------|----------|---------|
| Enrichment | 8-9s | Sequential fetching with 500ms sleeps |
| Summarization | 5-12s | Kimi K2 API call + DB upsert |
| **Total** | **13-21s** | |

### Data Currently Extracted
- `hook`: Punchy one-liner (<80 chars)
- `quickTake`: 2-4 decision helper labels
- `themes`: 2-4 thematic elements
- `mood`: { pacing, intensity, tone, emotional }
- `aiQuestions`: 4-5 sassy conversation starters
- `watchContext`: 1-3 "when to watch" suggestions
- `contentWarnings`: 0-3 content concerns

---

## Phase 1: Performance Optimizations

### 1.1 Parallelize Data Fetching (Est. savings: 3-4s)

**Current** (sequential):
```
MongoDB → TMDB → Wikidata → Wikipedia → Fandom → IMDb
```

**Proposed** (parallel where possible):
```
┌─────────────────────────────────────────┐
│ PARALLEL TIER 1 (no dependencies)       │
├─────────────────────────────────────────┤
│ MongoDB ─┬─ TMDB ─┬─ Wikidata          │
│    ↓     │   ↓    │    ↓               │
│ (merge)  │ (done) │ (has Wikipedia URL) │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ PARALLEL TIER 2 (depends on tier 1)     │
├─────────────────────────────────────────┤
│ Wikipedia ─┬─ Fandom ─┬─ IMDb          │
│ (from WD)  │ (title)  │ (from WD/TMDB) │
└─────────────────────────────────────────┘
```

**Implementation**:
```typescript
// Tier 1: No dependencies
const [mongodb, tmdb, wikidata] = await Promise.all([
  fetchFromMongoDB(tmdbId),
  fetchTMDB(tmdbId),
  fetchWikidata(tmdbId),
]);

// Tier 2: Depends on tier 1 results
const imdbId = wikidata?.externalIds?.imdb_id || tmdb.external_ids?.imdb_id;
const wikipediaUrl = wikidata?.sitelinks?.enwiki?.url;

const [wikipedia, fandom, imdb] = await Promise.all([
  wikipediaUrl ? scrapeWikipedia(wikipediaUrl) : null,
  scrapeFandom(wikidata?.externalIds?.fandom_wiki, tmdb.title),
  imdbId ? scrapeIMDb(imdbId) : null,
]);
```

### 1.2 Parallelize IMDb Scraping (Est. savings: 2s)

**Current**: 6 sequential requests
```typescript
await scrapeSection("plotsummary", ...);
await scrapeSection("trivia", ...);
await scrapeSection("goofs", ...);
// ... etc
```

**Proposed**: All 6 in parallel
```typescript
const [plotData, triviaData, goofsData, quotesData, connectionsData, parentalData] =
  await Promise.all([
    scrapeSection("plotsummary"),
    scrapeSection("trivia"),
    scrapeSection("goofs"),
    scrapeSection("quotes"),
    scrapeSection("movieconnections"),
    scrapeSection("parentalguide"),
  ]);
```

### 1.3 Reduce/Remove Sleep Timers (Est. savings: 1.5s)

**Current**: 500ms between each source
**Proposed**:
- Remove sleeps for parallel operations
- Keep 200ms sleep only for Fandom (multiple wiki attempts)

### 1.4 Single Process Mode for Admin API (Est. savings: 1-2s)

**Current**: Two shell invocations (`npx tsx` × 2)
**Proposed**: Import scripts as modules, run in single process

```typescript
// New: src/server/services/enrichment-service.ts
export async function enrichAndSummarize(tmdbId: number, mediaType: "movie" | "series") {
  const content = await enrichMovie(tmdbId);  // Direct function call
  const summary = await summarizeMovie(tmdbId, client);  // Direct function call
  return { content, summary };
}
```

### Expected Performance After Phase 1

| Phase | Current | After | Savings |
|-------|---------|-------|---------|
| Enrichment | 8-9s | 3-4s | ~5s |
| Summarization | 5-12s | 5-12s | (unchanged) |
| Shell overhead | 2s | 0s | 2s |
| **Total** | **13-21s** | **8-16s** | **~40%** |

---

## Phase 2: Spoiler vs Spoiler-Free Content

### 2.1 New Data Schema

```typescript
interface AISummary {
  // === SPOILER-FREE (always visible) ===
  hook: string;                    // Existing
  quickTake: string[];             // Existing
  themes: string[];                // Existing
  mood: MoodObject;                // Existing
  watchContext: string[];          // Existing
  contentWarnings: string[];       // Existing

  // Questions split by spoiler status
  questionsPreWatch: string[];     // "Is this actually good?" "Will I cry?"

  // === SPOILER CONTENT (requires "watched" status) ===
  questionsPostWatch: string[];    // "Was the twist earned?" "Did Leo deserve to die?"
  postWatchInsights: string[];     // Deeper analysis that spoils plot points
  hiddenDetails: string[];         // Easter eggs, callbacks, references
  memorableScenes: string[];       // "The diner scene", "When X reveals Y"

  // === NEW FIELDS (spoiler-free) ===
  characterVibes: string[];        // Non-spoiler character descriptions
  divisivePoints: string[];        // What people argue about
  bestQuotes: string[];            // Iconic quotable lines (context-free)
}
```

### 2.2 Database Migration

```sql
-- Add new columns to ai_data table
ALTER TABLE ai_data ADD COLUMN questions_pre_watch TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN questions_post_watch TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN post_watch_insights TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN hidden_details TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN memorable_scenes TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN character_vibes TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN divisive_points TEXT[] DEFAULT '{}';
ALTER TABLE ai_data ADD COLUMN best_quotes TEXT[] DEFAULT '{}';

-- Migrate existing questions to questions_pre_watch
UPDATE ai_data SET questions_pre_watch = questions WHERE questions IS NOT NULL;
```

### 2.3 UI Integration

**Before marking "watched":**
- Show: hook, quickTake, themes, mood, watchContext, contentWarnings
- Show: `questionsPreWatch` in AI Questions section
- Show: "🔒 Mark as watched to unlock spoiler content" hint

**After marking "watched":**
- Show: Everything above PLUS
- Show: `questionsPostWatch` in expanded section
- New section: "Post-Watch Insights" with `postWatchInsights`
- New section: "Hidden Details" with `hiddenDetails`
- New section: "Memorable Scenes" with `memorableScenes`

### 2.4 Updated Prompt (Two-Pass)

**Pass 1: Spoiler-Free Content**
```
Generate spoiler-free content for someone who HASN'T watched the movie.
Never reveal plot twists, deaths, endings, or major reveals.
```

**Pass 2: Spoiler Content**
```
Now generate content for someone who HAS watched the movie.
You CAN discuss: plot twists, character deaths, the ending, reveals.
Focus on: deeper analysis, hidden details, memorable moments worth revisiting.
```

---

## Phase 3: Expanded Data Extraction

### 3.1 New Fields to Extract

| Field | Type | Example | Spoiler? |
|-------|------|---------|----------|
| `similarVibes` | string[] | "If you liked Inception for the mind-bending puzzles" | No |
| `pairingsWith` | string[] | "Double-feature with: Arrival (big ideas sci-fi)" | No |
| `standoutPerformances` | string[] | "Joaquin Phoenix is unhinged in the best way" | No |
| `audioVisualNotes` | string[] | "Dolby Atmos is worth it", "Hans Zimmer goes hard" | No |
| `culturalImpact` | string | "Launched the 'elevated horror' genre" | No |
| `rewindMoments` | string[] | "The hallway fight - watch the choreography" | Yes |
| `watchOrder` | object | { before: [], after: [], universe: "MCU" } | No |

### 3.2 Enhanced Input Data

**Add to ai-input.md generation:**

1. **Awards Context**
   - Oscar wins/nominations
   - Major festival wins (Cannes, Venice, etc.)

2. **Box Office Context**
   - Performance vs budget (flop/hit/phenomenon)
   - Opening weekend records

3. **Franchise Context**
   - Part of what series
   - Recommended watch order

### 3.3 Additional Data Sources (Future)

| Source | Data Type | Complexity |
|--------|-----------|------------|
| TVTropes (have ID) | Tropes, themes | Medium |
| Letterboxd | User reviews, lists | Medium |
| Reddit (r/movies) | Discussion sentiment | High |
| YouTube transcripts | Review opinions | High |

---

## Phase 4: Prompt Engineering Improvements

### 4.1 Quality Gates

Add validation rules to the prompt:

```
QUALITY RULES:
1. If themes are generic (love, friendship, family) → dig deeper for SPECIFIC themes
2. If quickTake overlaps with genres → rethink - should be viewing EXPERIENCE
3. If hook could apply to 100 other movies → make it SPECIFIC to this movie
4. If aiQuestions are boring (What's it about?) → make them PROVOCATIVE
```

### 4.2 Few-Shot Examples

Include 2-3 complete golden examples in the prompt:

```json
// Example: Fight Club (1999)
{
  "hook": "The movie your therapist wishes you'd stop quoting",
  "quickTake": ["Mind-bending twist", "Quotable AF", "Toxic masculinity critique"],
  "themes": ["Consumer culture emptiness", "Fractured identity", "Anarchist fantasy"],
  "questionsPreWatch": [
    "Is this actually deep or just edgy?",
    "Will I become insufferable after watching this?",
    "First rule: should I talk about it or not?"
  ],
  "questionsPostWatch": [
    "How did I not see the twist coming?",
    "Is Tyler right about society? Asking for a friend.",
    "The ending - cathartic or concerning?"
  ]
}
```

### 4.3 Model Considerations

Current: Kimi K2 (via Bedrock)
- Pros: Good reasoning, available in Bedrock
- Cons: Sometimes verbose, can be slow

Consider A/B testing:
- Claude 3.5 Sonnet for faster responses
- GPT-4 Turbo for comparison

---

## Implementation Priority

### High Priority (Do First)
1. **Performance: Parallelize data fetching** - Immediate 40% speed improvement
2. **Spoiler split: questionsPreWatch/questionsPostWatch** - High user value
3. **New field: postWatchInsights** - Differentiated content

### Medium Priority
4. **Single process mode** - Cleaner architecture
5. **New fields: hiddenDetails, memorableScenes** - Spoiler-gated content
6. **Prompt improvements** - Quality over quantity

### Low Priority (Nice to Have)
7. **Additional data sources** - Complex, diminishing returns
8. **watchOrder for franchises** - Useful but limited scope
9. **audioVisualNotes** - Niche appeal

---

## Testing Strategy

### Performance Testing
```bash
# Before changes
time yarn enrich 550  # Fight Club - baseline

# After each optimization
time yarn enrich 550  # Compare
```

### Quality Testing
```bash
# Generate for known movies, manually review quality
yarn enrich 550 && yarn summarize 550 --force  # Fight Club
yarn enrich 278 && yarn summarize 278 --force  # Shawshank
yarn enrich 680 && yarn summarize 680 --force  # Pulp Fiction
```

### A/B Testing Framework
- Flag: `ENRICHMENT_VERSION=v1|v2`
- Store version in ai_data.modelId
- Compare user engagement metrics

---

## Open Questions

1. **Spoiler detection**: How do we handle movies where the TMDB description itself contains spoilers?

2. **Regeneration policy**: When we add new fields, do we regenerate all existing summaries?

3. **Cost tracking**: Should we add detailed cost tracking per enrichment? (Currently just token counts)

4. **Rate limiting**: Do we need to add rate limiting for admin enrichment to avoid API abuse?

5. **Caching strategy**: Should we cache enriched data longer and only regenerate summaries?

---

## UI Mockups & Use Cases

### Movie Page: Before Watching

```
┌─────────────────────────────────────────────────────────────────┐
│  FIGHT CLUB (1999)                                             │
│  "The movie your therapist wishes you'd stop quoting"          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Emotionally devastating] [Mind-bending twist] [Quotable AF]  │  ← VIBE pills
│                                                                 │
│  ── Themes ──────────────────────────────────────────────────  │
│  Consumer culture emptiness • Fractured identity • Anarchism   │
│                                                                 │
│  ── Best For ────────────────────────────────────────────────  │
│  🧘 Solo watch - you'll want to process alone                  │
│  🔄 Gets better on rewatch                                      │
│                                                                 │
│  ── Standout ────────────────────────────────────────────────  │
│  🎭 Career-defining performance from Brad Pitt                  │
│  ✍️ Razor-sharp dialogue                                        │
│  🎬 Fincher's visual style at its peak                          │
│                                                                 │
│  ── Heads Up ────────────────────────────────────────────────  │
│  ⚠️ Graphic violence throughout                                 │
│  😰 Psychologically disturbing imagery                          │
│                                                                 │
│  ── Ask About This Movie ────────────────────────────────────  │
│  [Is this actually deep or just edgy?]                          │
│  [Will I become insufferable after watching this?]              │
│  [First rule: should I talk about it or not?]                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔒 UNLOCK SPOILER CONTENT                               │   │
│  │  Mark as watched to see post-watch insights,             │   │
│  │  hidden details, and spoiler discussions                 │   │
│  │                                                          │   │
│  │  [Mark as Watched]                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Movie Page: After Marking as Watched

```
┌─────────────────────────────────────────────────────────────────┐
│  FIGHT CLUB (1999)                              ✅ WATCHED      │
│  "The movie your therapist wishes you'd stop quoting"          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ... [Same spoiler-free content above] ...                     │
│                                                                 │
│  ══════════════════════════════════════════════════════════════ │
│  🔓 SPOILER CONTENT UNLOCKED                                   │
│  ══════════════════════════════════════════════════════════════ │
│                                                                 │
│  ── Post-Watch Questions ────────────────────────────────────  │
│  [How did I not see the twist coming?]                          │
│  [Is Tyler right about society? Asking for a friend.]           │
│  [The ending - cathartic or concerning?]                        │
│                                                                 │
│  ── Hidden Details 🎯 ───────────────────────────────────────  │
│  • Starbucks cup in every scene - Fincher's consumerism jab    │
│  • Tyler appears in single frames before his "reveal"           │
│  • The narrator's name is never revealed                        │
│                                                                 │
│  ── Memorable Moments ───────────────────────────────────────  │
│  • The chemical burn scene - raw and unforgettable              │
│  • "His name is Robert Paulson" chant                           │
│  • The ending with the buildings - cathartic or terrifying?     │
│                                                                 │
│  ── Post-Watch Insights 💡 ──────────────────────────────────  │
│  • The narrator's insomnia represents modern disconnection      │
│  • Notice how Tyler never interacts with strangers directly     │
│  • The support groups foreshadow the need for genuine human     │
│    connection that Tyler's ideology can't provide               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Browse Page: Filter Badges

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSE MOVIES                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filter by AI Insights:                                         │
│                                                                 │
│  Best For:                                                      │
│  [🎬 Theatre] [💕 Date Night] [👨‍👩‍👧 Family] [👶 Kids] [🧘 Solo]     │
│                                                                 │
│  Standout:                                                      │
│  [🎭 Great Acting] [🎵 Amazing Score] [📷 Cinematography]        │
│  [✨ Visual Effects] [✍️ Sharp Writing] [🔊 Sound Design]        │
│                                                                 │
│  Avoid if:                                                      │
│  [⚠️ Violence] [😰 Disturbing] [😢 Emotionally Heavy]            │
│                                                                 │
│  Vibe:                                                          │
│  [Mind-bending] [Feel-good] [Cult Classic] [Turn Off Brain]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Search Results: Badge Display

```
┌─────────────────────────────────────────────────────────────────┐
│  Search: "great cinematography date night"                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  LA LA LAND (2016)                                       │   │
│  │  "A musical for people who don't like musicals"          │   │
│  │                                                          │   │
│  │  📷 Cinematography  💕 Date Night  🎵 Score              │   │
│  │  [Romantic] [Bittersweet] [Musical]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IN THE MOOD FOR LOVE (2000)                             │   │
│  │  "Longing has never looked this beautiful"               │   │
│  │                                                          │   │
│  │  📷 Cinematography  💕 Date Night  🎵 Score              │   │
│  │  [Slow Burn] [Romantic] [Art House]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Revised Implementation Priority

### Phase 1: Database & Performance (Week 1)
1. **Create `ai_insights` table** with new schema
2. **Migration script** - Convert existing `ai_data` to new structure
3. **Parallelize data fetching** in enrichment script
4. **Parallelize IMDb scraping** (6 requests in parallel)

### Phase 2: Multi-Pass Extraction (Week 2)
5. **Refactor summarization** to 3-pass system
6. **Pass 1 prompt**: Core summary (spoiler-free)
7. **Pass 2 prompt**: Pre-watch details (highlights, heads-up, questions)
8. **Pass 3 prompt**: Post-watch analysis (spoiler content)

### Phase 3: UI Integration (Week 3)
9. **API changes** - Return insights grouped by category & spoiler level
10. **Movie page** - Display spoiler-free insights
11. **Spoiler unlock** - Show post-watch content after "watched" status
12. **Badge components** - Reusable insight badges with icons

### Phase 4: Search Integration (Week 4)
13. **Filter UI** - Browse by insight categories
14. **Semantic search** - Embed key insights for vector search
15. **Smart recommendations** - "Because you liked X" with insight matching

---

## Example API Response (New Structure)

```typescript
// GET /api/movies/550/ai-data
{
  "hook": "The movie your therapist wishes you'd stop quoting",
  "mood": {
    "pacing": "steady",
    "intensity": "high",
    "tone": "dark",
    "emotional": "heavy"
  },
  "insights": {
    "spoilerFree": {
      "vibes": ["Mind-bending twist", "Quotable AF", "Cult classic"],
      "themes": ["Consumer culture emptiness", "Fractured identity"],
      "bestFor": [
        { "text": "Solo watch - you'll want to process alone", "icon": "solo" },
        { "text": "Gets better on rewatch", "icon": "rewatch" }
      ],
      "highlights": [
        { "text": "Career-defining performance from Brad Pitt", "icon": "acting", "subcategory": "acting" },
        { "text": "Razor-sharp dialogue", "icon": "writing", "subcategory": "writing" }
      ],
      "headsUp": [
        { "text": "Graphic violence throughout", "icon": "violence", "subcategory": "violence" },
        { "text": "Psychologically disturbing imagery", "icon": "disturbing", "subcategory": "disturbing" }
      ],
      "questions": [
        "Is this actually deep or just edgy?",
        "Will I become insufferable after watching this?"
      ],
      "quotes": [
        { "text": "The first rule of Fight Club is...", "icon": "quote" }
      ]
    },
    "spoilerContent": {
      // Only included if user has marked as "watched"
      "questions": [
        "How did I not see the twist coming?",
        "Is Tyler right about society?"
      ],
      "insights": [
        { "text": "The narrator's insomnia represents modern disconnection", "level": "HEAVY" }
      ],
      "hiddenDetails": [
        { "text": "Tyler appears in single frames before his reveal", "level": "HEAVY" }
      ],
      "memorableScenes": [
        { "text": "The chemical burn scene", "level": "LIGHT" }
      ]
    }
  },
  "generatedAt": "2026-01-17T10:30:00Z",
  "version": 2
}
```

---

## Differentiation Summary

This feature set will make the platform stand out:

| Feature | Competitor Status | Our Advantage |
|---------|-------------------|---------------|
| **Spoiler-gated insights** | ❌ None have this | Users engage more, mark "watched" to unlock |
| **AI questions** | ❌ Unique | Drives AI chat engagement |
| **Structured highlights** | ⚠️ Basic tags | Proper categorization with icons |
| **"Best For" context** | ❌ None | Users find right movie for their mood |
| **Semantic insight search** | ❌ None | "Find movies with great sound design" |
| **Post-watch analysis** | ❌ None | Reward for completing movies |

This transforms from "another movie database" to **"AI-powered movie companion that grows with you"**.
