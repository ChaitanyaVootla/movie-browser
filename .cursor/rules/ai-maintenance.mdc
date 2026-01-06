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

1. Update relevant `.mdc` rule files in `.cursor/rules/`
2. Document new patterns with examples
3. Remove obsolete patterns

Example:

```markdown
// If you add a new data fetching pattern
// Update .cursor/rules/core.mdc with the new pattern
```

## Before Making Changes

### 1. Understand Context

- Read relevant `.mdc` rule files
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

### 4. Handle Errors with Structured Logging

Use the Pino-based structured loggers for all error handling:

```typescript
import { dataLogger, apiLogger, aiToolLogger } from "@/lib/logger";

// ✅ GOOD - Structured logging with context
try {
  const movie = await getMovie(id);
  return movie;
} catch (error) {
  dataLogger.error({
    event: "fetch_movie_error",
    movieId: id,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new AppError("Movie not found", { cause: error });
}

// ❌ BAD - Unstructured console.error
catch (error) {
  console.error("Failed to fetch movie:", error);
}
```

**Available Loggers:**
- `aiLogger` - AI agent operations
- `aiToolLogger` - AI tool calls/results
- `usageLogger` - Cost/token tracking
- `apiLogger` - API routes
- `userApiLogger` - User library APIs
- `adminApiLogger` - Admin APIs
- `dataLogger` - Data fetching
- `tmdbLogger` - TMDB service

See `src/lib/logger.ts` for the full list and `.cursor/rules/ai-agent.mdc` for log event formats.

## After Making Changes

### 1. Run Checks

```bash
yarn typecheck   # Must pass
yarn lint        # Must pass
yarn test:unit   # Must pass
```

### 2. Update Tests

- If behavior changed: Update existing tests
- If new feature: Add new tests
- If bug fix: Add regression test

### 3. Update Documentation

- Add JSDoc comments for public APIs
- Update rule `.mdc` files if patterns changed
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
3. Document in rule `.mdc` files if pattern is new

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

See `.cursor/rules/auth.mdc` for detailed patterns.

### Deploying to EC2

The app deploys to AWS EC2 alongside the legacy Nuxt app.

| Environment | Domain | Port | PM2 Name |
|-------------|--------|------|----------|
| Production (Nuxt) | themoviebrowser.com | 3001 | `nuxt` |
| Beta (Next.js) | beta.themoviebrowser.com | 3002 | `next` |

**Deploy commands:**
```bash
yarn deploy           # Full build + upload + start
yarn deploy:quick     # Skip build, use existing .next
yarn deploy:restart   # Just restart PM2
```

**What `yarn deploy` does:**
1. Runs `yarn build` locally
2. Creates tarball: `.next`, `public`, `package.json`, `next.config.mjs`, `.env.local`
3. SCPs to EC2 at `/home/ubuntu/movie-browser-next/`
4. Runs `npm install --omit=dev --legacy-peer-deps --ignore-scripts`
5. Starts/restarts PM2 process on port 3002

**SSH access:**
```bash
yarn ssh              # SSH into EC2
yarn ssh:logs         # View PM2 logs (pm2 logs --lines 100)
```

**EC2 instance:** `98.130.30.197` (Elastic IP)
**SSH key:** `./movie-browser-ec2-key.pem`

**After deploying, verify:**
```bash
curl -s https://beta.themoviebrowser.com/health
pm2 logs next --lines 20
```

### Adding a New Subdomain

1. **Route 53**: Add A record → EC2 Elastic IP
2. **SSL**: `sudo certbot certonly --standalone -d subdomain.themoviebrowser.com`
3. **Nginx**: Add server block in `/etc/nginx/sites-enabled/default`
4. **Reload**: `sudo nginx -t && sudo systemctl reload nginx`
5. **Google OAuth**: Add to authorized origins/redirects in Google Cloud Console

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

- **Architecture**: Check `.cursor/rules/core.mdc`
- **Components**: Check `.cursor/rules/components.mdc`
- **SEO**: Check `.cursor/rules/seo.mdc`
- **Testing**: Check `.cursor/rules/testing.mdc`
- **API patterns**: Check `.cursor/rules/api.mdc`
- **Authentication/Admin**: Check `.cursor/rules/auth.mdc`

If still unsure: Ask the human for clarification.
