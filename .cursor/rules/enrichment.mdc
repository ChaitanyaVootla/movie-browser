# Content Enrichment Pipeline

## Overview

The enrichment pipeline collects movie data from multiple sources for AI summarization. It generates optimized, AI-ready markdown files that can be used to generate labels, one-liner summaries, and content assessments.

## Commands

```bash
# Single movie enrichment
yarn enrich <tmdb_id>
yarn enrich 550              # Fight Club
yarn enrich 550 --debug      # Debug mode

# Batch enrichment (from TMDB popularity export)
yarn enrich:batch              # Top 100 movies (default)
yarn enrich:batch --top=50     # Top 50 movies
yarn enrich:batch --skip=10    # Skip first 10 (resume)
yarn enrich:batch --dry-run    # Preview what would run

# TMDB ID export
yarn tmdb:ids                  # Download latest TMDB movie ID dump

# Analysis tools
yarn enrich:analyze <tmdb_id>  # Check Wikidata sources
yarn enrich:cost               # Token/cost estimation
```

## Output Structure

Each enriched movie creates a folder at `data/enriched/<tmdb_id>/`:

| File | Purpose |
|------|---------|
| `ai-input.md` | **Final AI input** - optimized markdown for summarization |
| `metadata.json` | External IDs, stats, source list |
| `tmdb.json` | Raw TMDB API data |
| `wikidata.json` | Wikidata entity + external IDs (optimized, no bloated rawClaims) |
| `wikipedia.json` | Wikipedia content (all sections, categories) |
| `fandom.json` | Fandom wiki content |
| `imdb.json` | IMDb synopsis, summaries, trivia, quotes, parental guide |
| `*.md` | Stripped markdown per source |

## AI Input Structure

The `ai-input.md` file is structured for optimal AI consumption:

```markdown
# Movie Title (Year)

> "Tagline"

## Overview
Brief TMDB overview

## Details
- Genres, Runtime, Rating (with vote count)
- Director, Lead Cast
- Budget, Box Office

## Keywords
theme1, theme2, tone, setting...

## Summary
Wikipedia intro

## Plot
Full plot synopsis

## Themes
Deep thematic analysis (when available)

## Critical Reception
How critics received it

## Legacy & Influence
Cultural impact (when available)

## Categories
Film classifications

## Alternate Summary
Different perspective from IMDb

## Fan Community Reception
Fandom/community view

## Content Advisory
Parental guide (violence, language, etc.)
```

## Data Sources

### English Sources (Active)
| Source | Data | External ID Property |
|--------|------|---------------------|
| TMDB | Core metadata, credits, keywords | P4947 |
| Wikipedia | Plot, themes, reception, legacy | Sitelinks |
| IMDb | Synopsis, trivia, quotes, parental guide | P345 |
| Fandom | Extended content, fan reception | P8084/P6262 |
| Rotten Tomatoes | (ID only - scraping blocked) | P1258 |
| Metacritic | (ID only) | P1712 |
| Letterboxd | (ID only - future scraping) | P6127 |
| TV Tropes | (ID only - needs Playwright) | P6839/P4835 |
| Trakt.tv | (ID only) | P8013 |

### Non-English Sources (Disabled)
- Kinopoisk (Russian) - P2603
- AlloCiné (French) - P1265
- Douban (Chinese) - P7285
- FilmAffinity (Spanish) - P2639

## Token Estimates

### Enrichment (ai-input.md)
| Content Level | Avg Tokens |
|---------------|------------|
| Minimal | ~1,500 |
| Standard | ~2,400 |
| Rich (with themes) | ~3,000 |

### Summarization (Kimi K2 actual costs)
Based on 89-movie batch run:

| Metric | Per Movie | Per 1K Movies |
|--------|-----------|---------------|
| Input tokens | ~1,940 | ~1.94M |
| Output tokens | ~2,240 | ~2.24M |
| **Cost** | ~$0.007 | **~$6.70** |

Pricing: $0.0006/1K input, $0.0025/1K output

## AI Summarization

After enrichment, run AI summarization to generate structured content for the UI.

### Commands

```bash
# Single movie
yarn summarize <tmdb_id>
yarn summarize 550              # Fight Club

# Batch processing
yarn summarize:batch            # All enriched movies (skips existing)
yarn summarize:batch --force    # Regenerate all
yarn summarize:batch --top=50   # Limit to N movies
yarn summarize:batch --parallel=10  # Increase concurrency (default: 5)
yarn summarize:batch --dry-run  # Show what would be processed
```

### Output Schema

Each movie gets an `ai-summary.json` file:

```typescript
interface AISummary {
  hook: string;           // <80 chars - engaging one-liner for above overview
  quickTake: string[];    // 2-4 labels for instant decision (under hero)
  themes: string[];       // 2-4 meaningful themes (not genre synonyms)
  mood: {
    pacing: "slow" | "steady" | "fast";
    intensity: "low" | "medium" | "high";
    tone: "dark" | "light" | "mixed";
    emotional: "light" | "medium" | "heavy";
  };
  aiQuestions: string[];  // 4-5 fun, sassy questions for AI chat
  generatedAt: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}
```

### Example Output

```json
{
  "hook": "The only film where physics makes you cry.",
  "quickTake": ["Emotionally devastating", "Mind-bending sci-fi", "Dad feels in space"],
  "themes": ["Sacrificial love", "Time as a relational construct", "Human survival instinct"],
  "mood": { "pacing": "steady", "intensity": "high", "tone": "mixed", "emotional": "heavy" },
  "aiQuestions": [
    "Is this actually a masterpiece or just a $165M dad-trauma simulator?",
    "Will I understand the physics or just cry every time they mention 'Murph'?",
    "Hot take: is the love speech profound cinema or did Nolan just get too high?"
  ]
}
```

### Model

Uses Kimi K2 (`moonshot.kimi-k2-thinking`) via AWS Bedrock - same as the main AI agent.

## Adding New Sources

1. Create dump script in `scripts/dump-<source>.ts` to understand structure
2. Add scraper function to `enrich-content.ts`
3. Update `generateCombinedAIInput()` to include new data
4. Add external ID to Wikidata SPARQL query if available
5. Test with `yarn enrich <id> --debug`

## Future Enhancements

### Pending Sources
- **TV Tropes** - Needs Playwright (Cloudflare protected)
- **Letterboxd** - User reviews, themes, lists
- **AllMovie** - Moods, themes, tones (JS rendered)

### Planned Features
- MongoDB storage for production
- Incremental updates (only fetch changed data)

## AI Agent Tool Integration

The `get_details` tool for the AI agent includes enriched content when available:

```typescript
// In src/server/ai/tools/details.ts
import { getAIInputMarkdown } from "@/lib/ai-summary";

// For movies, include enriched AI summary if available
const aiSummary = await getAIInputMarkdown(input.id);
if (aiSummary) {
  response.aiSummary = aiSummary;
}
```

**Current:** Returns full `ai-input.md` content (~5-15KB) which may include duplicate synopses from multiple sources.

**⚠️ TODO:** Strip down to single summary/synopsis instance to reduce token usage:
- Keep only one plot synopsis (prefer Wikipedia or TMDB)
- Deduplicate themes across sources
- Truncate reception section to highlights only
- Remove redundant metadata

## UI Integration (Implemented)

AI summaries are integrated into movie detail pages. Data is read directly from the file system (`data/enriched/<tmdb_id>/ai-summary.json`) - no database storage yet.

### Reading AI Summaries

```typescript
import { getAISummary } from "@/lib/ai-summary";

// In server components
const aiSummary = await getAISummary(movieId);
// Returns AISummary | null (null if file doesn't exist)
```

### UI Placements

| Field | Location | Component | Styling |
|-------|----------|-----------|---------|
| `hook` | Above overview text | `<Quote>` | Italic with brand-colored vertical line |
| `quickTake` | Right of action buttons (Trailer, Watchlist, etc.) | `<QuickTake>` | Subtle bordered pills |
| `themes` | Above keywords in overview | `<Badge>` | Subtle bordered pills |
| `mood` | Bottom of details panel (right sidebar) | `MoodIndicators` | 2x2 grid, color-coded by value |
| `aiQuestions` | Below overview section | `<AIQuestionsSection>` | Glow container, clickable question pills |

### Mood Indicator Colors & Tooltips

Values have semantic colors for quick visual scanning, with tooltips explaining each value:

| Type | Values & Colors |
|------|----------------|
| Pacing | fast → yellow, slow → blue, steady → gray |
| Intensity | high → orange, low → cyan, medium → gray |
| Tone | dark → purple, light → amber, mixed → gray |
| Emotional | heavy → rose, light → emerald, medium → gray |

**Tooltip Descriptions:**

| Type | Value | Description |
|------|-------|-------------|
| Pacing | fast | Quick cuts, lots of action, keeps you on the edge |
| Pacing | steady | Balanced rhythm with room to breathe |
| Pacing | slow | Deliberate, contemplative storytelling |
| Intensity | high | Gripping and tense, emotionally demanding |
| Intensity | medium | Engaging with peaks of tension |
| Intensity | low | Relaxed and easygoing |
| Tone | dark | Serious, grim, or bleak themes |
| Tone | light | Upbeat, optimistic, or comedic |
| Tone | mixed | Balances lighter and heavier moments |
| Emotional | heavy | May leave you thinking or feeling deeply |
| Emotional | medium | Engaging without being overwhelming |
| Emotional | light | Easy watch, won't weigh on you

### AI Questions → Chat Integration

Questions trigger the AI chat via custom event with movie context appended:

```typescript
// Dispatch from AIQuestionsSection - includes movie context
function triggerAIChat(question: string, title: string, year: string | undefined, tmdbId: number) {
  const contextSuffix = year 
    ? ` [About: ${title} (${year}), TMDB ID: ${tmdbId}]`
    : ` [About: ${title}, TMDB ID: ${tmdbId}]`;
  
  window.dispatchEvent(new CustomEvent("ai-chat-trigger", {
    detail: { message: question + contextSuffix }
  }));
}

// Listen in AssistantFloaty
useEffect(() => {
  const handler = (e: CustomEvent) => {
    setState("active");
    sendMessage(e.detail.message);
  };
  window.addEventListener("ai-chat-trigger", handler);
  return () => window.removeEventListener("ai-chat-trigger", handler);
}, []);
```

**Required props for AIQuestionsSection:**
- `title` - Movie title for display and context
- `year` - Release year (optional, extracted from `release_date`)
- `tmdbId` - TMDB ID for AI agent context

### Shared AI Components

Reuse these from `@/components/features/ai/`:

| Component | Import | Usage |
|-----------|--------|-------|
| `AISparkIcon` | `@/components/features/ai/ai-icon` | Animated star icon for AI content |
| `GlowContainer` | `@/components/features/ai/ai-animations` | Animated glow border effect |

### AI Styling Guidelines

- **No red/brand text** - Use subtle borders (`border-brand/30`) to indicate AI content
- **Consistent glow** - Use `GlowContainer` with `isActive={true}` for AI sections
- **Value-based colors** - Mood indicators use semantic colors based on values
- **Animated icon** - Use `AISparkIcon` instead of generic Sparkles icon

## File Locations

```
scripts/
├── enrich-content.ts       # Main enrichment script
├── enrich-batch.ts         # Batch enrichment (top N movies)
├── summarize-movies.ts     # AI summarization script
├── download-tmdb-ids.ts    # Download TMDB ID exports
├── analyze-wikidata-sources.ts  # Wikidata property analyzer
├── estimate-ai-costs.ts    # Token/cost estimation
├── dump-letterboxd.ts      # Letterboxd structure explorer
├── dump-rottentomatoes.ts  # RT structure explorer
├── dump-tvtropes.ts        # TV Tropes structure explorer
└── dump-allmovie.ts        # AllMovie structure explorer

data/
├── enriched/<tmdb_id>/     # Per-movie enriched data
│   ├── ai-input.md         # Enriched markdown for AI
│   ├── ai-summary.json     # AI-generated summary
│   └── metadata.json       # External IDs, stats
├── tmdb-dump/              # TMDB ID exports
└── dumps/<source>/         # Raw dumps from exploratory scripts
```

## .gitignore

The `data/` folder is gitignored - enriched data is regenerated as needed.
