---
paths:
  - "src/components/features/media/standout-*.tsx"
  - "src/components/features/media/insight-sections.tsx"
  - "src/components/features/media/deep-dive-section.tsx"
  - "src/types/ai-insights.ts"
  - "src/server/services/ai-data-service.ts"
  - "scripts/summarize-movies.ts"
---

# AI Insights System

## Data Architecture

AI insights use a **tag-based architecture** stored in `ai_insights` table (one-to-many from `ai_data`).

### Categories & Subcategories

```typescript
// From src/types/ai-insights.ts - INSIGHT_SCHEMA
VIBE: null                    // Quick take pills, no subcategory
THEME: null                   // Thematic elements, no subcategory
MOOD: [pacing, intensity, tone, emotional]  // Constrained text values
BEST_FOR: [theatre, streaming, date_night, solo, friends, family, kids, rewatch, background, binge]
HIGHLIGHT: [acting, direction, cinematography, score, sound, vfx, practical, writing, editing, production, costume, stunt]
HEADS_UP: [violence, gore, disturbing, triggers, sad, jumpscares, language, sexual, drugs]
QUESTION: [pre_watch, post_watch]
DEEP_DIVE: [trivia, insight, memorable, cultural]
```

### Spoiler Levels

- `FREE` - No spoilers, safe for everyone
- `LIGHT` - Minor reveals
- `HEAVY` - Major plot spoilers

## Data Service

```typescript
import { getAIData, aiDataResponseToSummary } from "@/server/services/ai-data-service";

// Fetch structured AI data
const aiData = await getAIData(tmdbId, "movie" | "series");

// Response structure:
interface AIDataResponse {
  hook: string | null;
  mood: { pacing, intensity, tone, emotional } | null;
  insights: {
    spoilerFree: {
      vibes: string[];
      themes: string[];
      bestFor: InsightItem[];
      highlights: InsightItem[];
      headsUp: InsightItem[];
      questions: string[];      // pre_watch only
    };
    spoilerContent: {
      questions: string[];      // post_watch
      deepDive: DeepDiveItem[]; // with spoilerLevel
    };
  };
}

// For backward compatibility with legacy components
const aiSummary = aiData ? aiDataResponseToSummary(aiData) : null;
```

## UI Components

### StandoutBadges (Hero Section)

Compact icon badges shown in hero, max 3-4 items:

```tsx
<StandoutBadges
  highlights={aiData.insights.spoilerFree.highlights}
  bestFor={aiData.insights.spoilerFree.bestFor}
  maxBadges={4}
/>
```

### StandoutAspects (Main Content)

Full highlight items with category icons:

```tsx
<StandoutAspects highlights={aiData.insights.spoilerFree.highlights} maxItems={4} />
```

### BestForSection / HeadsUpSection

Watch context and content warnings with subcategory icons:

```tsx
<BestForSection items={aiData.insights.spoilerFree.bestFor} />
<HeadsUpSection items={aiData.insights.spoilerFree.headsUp} />
```

### DeepDiveSection (Collapsible)

Trivia/insights with spoiler gating:

```tsx
<DeepDiveSection
  items={aiData.insights.spoilerContent.deepDive}
  maxCollapsedItems={3}  // Shows spoiler-free items first
/>
```

## Icon Mapping

Icons are determined by subcategory in UI (NOT stored in DB):

```typescript
// HIGHLIGHT icons (from standout-badges.tsx)
score → Music
acting → Theater
direction → Clapperboard
cinematography → Camera
// ...

// BEST_FOR icons
rewatch → RefreshCw
friends → Users
solo → User
theatre → Film
// ...

// HEADS_UP icons (with severity colors)
violence → Swords (red)
jumpscares → Ghost (amber)
language → MessageCircleWarning (yellow)
// ...
```

## Summarization Script

```bash
yarn summarize <tmdb_id>         # Generate AI insights
yarn summarize <id> --force      # Regenerate existing
yarn summarize:batch             # Batch process popular items
```

**Important**: Uses `maxTokens: 16384` for Kimi K2 since reasoning tokens count toward output limit.

## Validation

All insights are validated against `INSIGHT_SCHEMA` before storage:

```typescript
import { parseAndValidateAIOutput, validateInsight } from "@/types/ai-insights";

// Validates category, subcategory, and text constraints (for MOOD)
const { insights, errors } = parseAndValidateAIOutput(rawAIOutput);
```

## Adding New Categories/Subcategories

1. Update `INSIGHT_SCHEMA` in `src/types/ai-insights.ts`
2. Add Prisma enum value if needed (`InsightCategory`)
3. Add icon mapping in relevant component
4. Update `SYSTEM_PROMPT` in `scripts/summarize-movies.ts`
5. Re-run `yarn summarize --force` for affected items
