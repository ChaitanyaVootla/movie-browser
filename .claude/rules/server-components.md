---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---

# Server Components First

Default to Server Components (no "use client" directive).

## When to Add "use client"

Only add when you need:

- Event handlers (onClick, onChange)
- Hooks (useState, useEffect, custom hooks)
- Browser APIs (window, localStorage)
- Third-party client libraries

## Data Fetching Pattern

```tsx
// Server Component - GOOD
export default async function Page({ params }) {
  const data = await getData(params.id);
  return <Component data={data} />;
}

// Client Component with useEffect - BAD
("use client");
export default function Page({ params }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    getData(params.id).then(setData);
  }, []);
}
```

## Extract Client Islands

Keep client components small and focused:

```tsx
// page.tsx (Server)
export default async function MoviePage({ params }) {
  const movie = await getMovie(params.id);
  return (
    <article>
      <h1>{movie.title}</h1> {/* Server rendered */}
      <WatchlistButton movieId={movie.id} /> {/* Client island */}
    </article>
  );
}

// watchlist-button.tsx (Client)
("use client");
export function WatchlistButton({ movieId }) {
  const { toggleWatchlist } = useUserLibrary();
  return <Button onClick={() => toggleWatchlist(movieId)}>Add</Button>;
}
```

## Instant Loading with CDN Images

Detail pages render **real CDN images** instead of skeletons for instant perceived
navigation, via shell components inside `page.tsx`:

- CDN URLs are deterministic: `https://image.themoviebrowser.com/{movie|series}/{id}/backdrop.webp`
- Same URLs used in home carousel, so images are already cached
- `HeroBackdropShell` / `HeroLogoShell` need only the route ID — they render
  immediately while data-dependent content streams in via in-page Suspense.

### Detail-page `loading.tsx` requires proxy status authority (June 2026)

A route with `loading.tsx` streams every response, and a streamed response is
locked to HTTP **200** before the page runs — `notFound()` (garbage IDs →
soft-404s at crawler scale) and `permanentRedirect()` (wrong-slug
canonicalization) silently stop producing status codes.

**Movie/series carry `loading.tsx` again since Jun 11 2026** (instant nav
skeletons) because their 404/308 resolution moved pre-render into the proxy:
`src/proxy.ts` + `src/server/proxy/media-resolver.ts` (LRU → indexed PG PK
lookup → 2s-capped TMDB check; definitively-missing ids rewrite to
`src/app/media-not-found/page.tsx`, which `notFound()`s pre-flush with a real
404). The pages' `generateMetadata` throws remain only as fallbacks for
proxy-bypassing requests (dev direct hits, tests, resolver fail-open).

**Do NOT add `loading.tsx` to any other status-throwing route** (e.g. person)
unless the proxy resolves its statuses the same way first. See
`.claude/rules/performance.md` "Status codes" for the full recipe + gotchas.
