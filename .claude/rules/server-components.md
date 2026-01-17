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
