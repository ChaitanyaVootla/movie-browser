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

Detail pages use `loading.tsx` with **real CDN images** instead of skeletons for instant perceived navigation.

### Why This Pattern

- CDN URLs are deterministic: `https://image.themoviebrowser.com/{movie|series}/{id}/backdrop.webp`
- Same URLs used in home carousel, so images are already cached
- User sees actual images immediately on navigation, not shimmer skeletons

### Implementation

```tsx
// loading.tsx (Client component to access URL params)
"use client";
import { useParams } from "next/navigation";

export default function Loading() {
  const params = useParams();
  const id = parseInt(params?.params?.[0] as string, 10);

  if (!id || isNaN(id)) return <FullSkeleton />;

  // Render actual CDN images with onError fallback
  return (
    <article>
      <img
        src={`${CDN_IMAGE_BASE}/movie/${id}/backdrop.webp`}
        onError={() => setFailed(true)}
      />
      {/* Skeletons only for dynamic content (ratings, cast, etc.) */}
    </article>
  );
}
```

### Key Files

- `src/app/movie/[...params]/loading.tsx` - Movie instant loading
- `src/app/series/[...params]/loading.tsx` - Series instant loading
- `src/app/person/[...params]/loading.tsx` - Person skeleton (no CDN images for persons)

### Contrast with Shell Components

| Component | When Used | Purpose |
|-----------|-----------|---------|
| `loading.tsx` | During navigation (before page renders) | Show cached CDN images instantly |
| `HeroBackdropShell` | In page.tsx (SSR/streaming) | Immediate render with TMDB fallback |

Both use the same CDN URLs, ensuring consistent caching.
