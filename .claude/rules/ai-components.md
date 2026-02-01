---
paths:
  - "src/components/features/ai/**/*.tsx"
  - "src/components/features/ai/**/*.ts"
---

# AI Assistant Components

## Modular Structure

`src/components/features/ai/` (14 files):

**Core:**
- `assistant-floaty.tsx` - Main orchestrator (state, mobile drawer)
- `types.ts` - Shared types (FloatyState, PromptConfig, etc.)
- `prompts.ts` - Prompt generation functions
- `index.ts` - Re-exports

**Views:**
- `idle-circle.tsx` - Floating bubble (idle state)
- `minimal-view.tsx` - Collapsed chat with prompt pills
- `expanded-chat.tsx` - Full chat view
- `mobile-chat-drawer.tsx` - Vaul drawer for mobile

**Chat UI:**
- `chat-tags.tsx` - Tag-based message UI
- `rich-message-content.tsx` - Rich content rendering
- `poster-card-large.tsx` - Large poster cards in chat
- `media-chip.tsx` - Compact media chips

**Utilities:**
- `ai-icon.tsx` - Animated AI icon component
- `ai-animations.tsx` - Animation variants

## State Flow

```
idle → active (user interacts) → expanded (user expands)
  ↑__________________________|  (user minimizes)
```

## Prompt Functions

```typescript
import { getContextualPrompts, IDLE_PROMPTS } from "./prompts";

// Context-aware prompts based on current page
const prompts = getContextualPrompts(pageContext);

// Random idle prompts for the bubble
const idlePrompt = pickRandom(IDLE_PROMPTS);
```

## Mobile Behavior

- Uses Vaul drawer on mobile
- Positioned above MobileBottomNav (bottom-[4.25rem])
- Auto-closes when clicking poster cards for navigation
- Virtual keyboard handling via visualViewport API

## Adding New Prompts

Edit `prompts.ts`:

```typescript
export function getMovieDetailPrompts(title: string, aiQuestions?: string[]) {
  const prompts = [
    { label: "Is it worth watching?", prompt: `Should I watch ${title}?` },
    // ... add more
  ];
  // Include AI-generated questions if available
  if (aiQuestions?.length) {
    prompts.push(...aiQuestions.map((q) => ({ label: truncateForButton(q), prompt: q })));
  }
  return prompts;
}
```
