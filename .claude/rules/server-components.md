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

### Detail pages must NOT have `loading.tsx` (June 2026)

The movie/series/person routes previously used `loading.tsx` for the instant
shell. **Deliberately removed — do not add it back**: a route with `loading.tsx`
streams every response, and a streamed response is locked to HTTP **200** before
the page runs, which made `notFound()` (garbage IDs → soft-404s at crawler
scale) and `permanentRedirect()` (wrong-slug canonicalization) silently
impossible. Status-affecting checks live in `generateMetadata` (runs pre-flush;
`htmlLimitedBots: /.*/` in next.config keeps metadata blocking). With ISR
serving most hits from cache (see `.claude/rules/performance.md` item 1), the
streamed shell bought nothing on cache hits, and in-page Suspense still streams
below-the-fold content on cache misses.
