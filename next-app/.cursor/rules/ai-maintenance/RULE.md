---
description: Guidelines for AI agents maintaining this codebase
globs: ["**/*"]
alwaysApply: true
---

# AI Maintenance Guidelines

## 🤖 This is an AI-First Repository

This codebase is designed to be primarily maintained by AI agents (Cursor, Copilot, etc.) with human oversight. Follow these guidelines strictly.

## Rule Maintenance

### CRITICAL: Keep Rules Updated

When making changes that affect project patterns or conventions:

1. Update relevant RULE.md files in `.cursor/rules/`
2. Document new patterns with examples
3. Remove obsolete patterns

Example:

```markdown
// If you add a new data fetching pattern
// Update .cursor/rules/core/RULE.md with the new pattern
```

## Before Making Changes

### 1. Understand Context

- Read relevant RULE.md files
- Check existing patterns in similar files
- Review recent git history for context

### 2. Verify Requirements

Ask clarifying questions if:

- Requirements are ambiguous
- Multiple valid approaches exist
- Change impacts core architecture

### 3. Plan First

For changes > 30 lines or architectural changes:

1. Propose a plan
2. Wait for human approval
3. Then implement

## Making Changes

### 1. Follow Existing Patterns

```typescript
// Look for similar code and match its style
// Example: If other components use this pattern:
export function MovieCard({ movie }: { movie: Movie }) { ... }

// Don't introduce a different pattern:
export const MovieCard: FC<MovieCardProps> = ({ movie }) => { ... }
```

### 2. Type Everything

```typescript
// ✅ GOOD
function getMovie(id: number): Promise<Movie> { ... }

// ❌ BAD
function getMovie(id) { ... }
```

### 3. Validate at Boundaries

```typescript
// ✅ GOOD: Validate external input
export async function getMovie(id: unknown) {
  const movieId = z.number().positive().parse(id);
  // ... fetch logic
}
```

### 4. Handle Errors Gracefully

```typescript
// ✅ GOOD
try {
  const movie = await getMovie(id);
  return movie;
} catch (error) {
  console.error("Failed to fetch movie:", error);
  throw new AppError("Movie not found", { cause: error });
}
```

## After Making Changes

### 1. Run Checks

```bash
npm run typecheck   # Must pass
npm run lint        # Must pass
npm run test:unit   # Must pass
```

### 2. Update Tests

- If behavior changed: Update existing tests
- If new feature: Add new tests
- If bug fix: Add regression test

### 3. Update Documentation

- Add JSDoc comments for public APIs
- Update RULE.md if patterns changed
- Update README if significant feature

## Communication Style

### Commit Messages

```
feat(movie): add watchlist functionality

- Add addToWatchlist server action
- Create WatchlistButton component
- Add E2E test for watchlist flow
```

### Code Comments

```typescript
// ✅ GOOD: Explain WHY, not WHAT
// We use optimistic updates here because the watchlist toggle
// feels sluggish with server round-trip wait
const toggleWatchlist = () => {
  setOptimistic(!isInList);
  mutate(movieId);
};

// ❌ BAD: Explains the obvious
// Set optimistic to the opposite of isInList
const toggleWatchlist = () => {
  setOptimistic(!isInList);
};
```

## Common Tasks

### Adding a New Page

1. Create `src/app/{route}/page.tsx`
2. Add `generateMetadata` export
3. Add structured data component (MovieSchema, SeriesSchema, PersonSchema)
4. Create E2E SEO test in `e2e/seo/`
5. Add to sitemap if public

### Adding a New Component

1. Create in `src/components/features/{domain}/`
2. Export from `index.ts` barrel file
3. Add loading skeleton variant
4. Consider Server vs Client component split
5. For sheets/modals that fetch data: use server actions with `useTransition`

### Adding a Server Action

1. Create in `src/server/actions/`
2. Add Zod validation schema
3. Add unit tests
4. Add error handling

### Working with Series-Specific Features

The series page has unique components for seasons/episodes:

1. **Season Selector**: `src/components/features/series/season-selector.tsx`
   - Defaults to latest season, fetches episodes via `getSeason()` action
2. **Episode Scroller**: `src/components/features/series/episode-scroller.tsx`
   - Horizontal scroll of episode cards with thumbnails
3. **Episode Sheet**: `src/components/features/series/episode-sheet.tsx`
   - Full episode details, image gallery, crew, guest stars
   - Fetches detailed data via `getEpisode()` on open
4. **Next Episode Card**: `src/components/features/series/next-episode-card.tsx`
   - Shows upcoming or last aired episode with countdown

When adding series features, reference these existing patterns.

### Adding a New Store

1. Create in `src/stores/`
2. Add unit tests
3. Document in RULE.md if pattern is new

### Adding Protected Routes

1. For page-level protection: Use `proxy.ts` matcher or check in server component
2. For API routes: Use `requireAdmin()` or check `auth()` session
3. For UI elements: Conditionally render based on `session.user.role`

```typescript
// Server component protection
import { auth, requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }
  return <AdminDashboard />;
}

// Client component conditional render
{session?.user?.role === "admin" && <AdminLink />}
```

### Working with Auth

1. **Full auth config** (`auth.ts`): Use in Node.js server code
2. **Edge auth config** (`auth.config.ts`): Use in `proxy.ts`
3. **Admin check**: Use `requireAdmin()` for protected routes
4. **Session access**: `auth()` in server, `useSession()` in client

See `.cursor/rules/auth/RULE.md` for detailed patterns.

## Red Flags

Watch for these anti-patterns:

- ❌ "use client" at page component level
- ❌ Fetching data in useEffect
- ❌ Modifying `src/components/ui/` files
- ❌ Missing TypeScript types
- ❌ Missing error handling
- ❌ Missing tests for new features
- ❌ Breaking existing tests
- ❌ Hardcoded strings that should be constants

## Getting Help

If unsure about:

- **Architecture**: Check `.cursor/rules/core/RULE.md`
- **Components**: Check `.cursor/rules/components/RULE.md`
- **SEO**: Check `.cursor/rules/seo/RULE.md`
- **Testing**: Check `.cursor/rules/testing/RULE.md`
- **API patterns**: Check `.cursor/rules/api/RULE.md`
- **Authentication/Admin**: Check `.cursor/rules/auth/RULE.md`

If still unsure: Ask the human for clarification.
