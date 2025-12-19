---
description: SEO requirements and structured data guidelines for search engine optimization
globs: ["src/app/**/*.tsx", "src/app/**/page.tsx"]
alwaysApply: false
---

# SEO Rules

## Critical Requirements

SEO is paramount for this application. Every page MUST be optimized for search engines.

## Metadata

### Every Page Needs `generateMetadata`

```tsx
// src/app/movie/[movieId]/page.tsx
import type { Metadata } from "next";
import { getMovie } from "@/server/actions/movie";

export async function generateMetadata({ params }): Promise<Metadata> {
  const movie = await getMovie(params.movieId);

  return {
    title: `${movie.title} (${movie.year}) - Movie Browser`,
    description: movie.overview?.slice(0, 160),
    keywords: [movie.title, ...movie.genres.map((g) => g.name), "movie", "watch"],
    openGraph: {
      type: "video.movie",
      title: movie.title,
      description: movie.overview,
      images: [
        {
          url: `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`,
          width: 1280,
          height: 720,
          alt: `${movie.title} backdrop`,
        },
      ],
      releaseDate: movie.release_date,
    },
    twitter: {
      card: "summary_large_image",
      title: movie.title,
      description: movie.overview,
      images: [`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`],
    },
    alternates: {
      canonical: `https://themoviebrowser.com/movie/${params.movieId}`,
    },
  };
}
```

### Root Layout Metadata

```tsx
// src/app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://themoviebrowser.com"),
  title: {
    template: "%s - Movie Browser",
    default: "Movie Browser - Discover Movies & TV Shows",
  },
  description: "Track, discover and find where to watch TV shows and movies.",
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "...",
    yandex: "...",
  },
};
```

## Structured Data (JSON-LD)

### Movie Schema

```tsx
// src/components/features/movie/movie-schema.tsx
import Script from "next/script";
import type { Movie } from "@/types";

export function MovieSchema({ movie }: { movie: Movie }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    description: movie.overview,
    datePublished: movie.release_date,
    image: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
    aggregateRating: movie.vote_average
      ? {
          "@type": "AggregateRating",
          ratingValue: movie.vote_average,
          ratingCount: movie.vote_count,
          bestRating: 10,
          worstRating: 0,
        }
      : undefined,
    genre: movie.genres?.map((g) => g.name),
    director: movie.credits?.crew?.find((c) => c.job === "Director")?.name,
    actor: movie.credits?.cast?.slice(0, 5).map((a) => ({
      "@type": "Person",
      name: a.name,
    })),
  };

  return (
    <Script
      id="movie-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

### Series Schema

```tsx
export function SeriesSchema({ series }: { series: Series }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.name,
    description: series.overview,
    datePublished: series.first_air_date,
    numberOfSeasons: series.number_of_seasons,
    numberOfEpisodes: series.number_of_episodes,
    image: `https://image.tmdb.org/t/p/w500${series.poster_path}`,
    aggregateRating: series.vote_average
      ? {
          "@type": "AggregateRating",
          ratingValue: series.vote_average,
          ratingCount: series.vote_count,
          bestRating: 10,
          worstRating: 0,
        }
      : undefined,
    genre: series.genres?.map((g) => g.name),
    creator: series.created_by?.map((c) => ({
      "@type": "Person",
      name: c.name,
    })),
    actor: series.credits?.cast?.slice(0, 5).map((a) => ({
      "@type": "Person",
      name: a.name,
    })),
    productionCompany: series.networks?.map((n) => ({
      "@type": "Organization",
      name: n.name,
    })),
  };
  // ...
}
```

### Series Metadata Example

```tsx
// src/app/series/[...params]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const series = await getSeries(seriesId);
  
  const yearRange = series.last_air_date && series.first_air_date !== series.last_air_date
    ? `${new Date(series.first_air_date).getFullYear()}-${new Date(series.last_air_date).getFullYear()}`
    : new Date(series.first_air_date).getFullYear();

  return {
    title: `${series.name} (${yearRange}) - Movie Browser`,
    description: series.overview?.slice(0, 160),
    keywords: [series.name, ...series.genres.map((g) => g.name), "tv show", "series", "watch"],
    openGraph: {
      type: "video.tv_show",
      title: series.name,
      description: series.overview,
      images: [{ url: `https://image.tmdb.org/t/p/w1280${series.backdrop_path}` }],
    },
    alternates: {
      canonical: `https://themoviebrowser.com/series/${seriesId}`,
    },
  };
}
```

### Person Schema

```tsx
export function PersonSchema({ person }: { person: Person }) {
  // Get notable works for performerIn
  const notableWorks = person.combined_credits?.cast
    ?.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 10)
    .map((c) => ({
      "@type": c.media_type === "movie" ? "Movie" : "TVSeries",
      name: c.title || c.name,
      url: `${SITE_URL}/${c.media_type === "movie" ? "movie" : "series"}/${c.id}`,
    }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    description: person.biography?.slice(0, 500),
    image: `https://image.tmdb.org/t/p/w500${person.profile_path}`,
    birthDate: person.birthday,
    deathDate: person.deathday || undefined,
    birthPlace: person.place_of_birth || undefined,
    jobTitle: person.known_for_department,
    url: `${SITE_URL}/person/${person.id}`,
    sameAs: [
      person.imdb_id && `https://www.imdb.com/name/${person.imdb_id}`,
      person.external_ids?.instagram_id && `https://www.instagram.com/${person.external_ids.instagram_id}`,
      person.external_ids?.twitter_id && `https://www.twitter.com/${person.external_ids.twitter_id}`,
      person.external_ids?.facebook_id && `https://www.facebook.com/${person.external_ids.facebook_id}`,
      person.external_ids?.wikidata_id && `https://www.wikidata.org/wiki/${person.external_ids.wikidata_id}`,
      person.homepage,
    ].filter(Boolean),
    performerIn: notableWorks,
  };
  // ...
}
```

### Person Metadata Example

```tsx
// src/app/person/[...params]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const person = await getPerson(id);
  
  // Build description from biography or known works
  let description = person.biography?.slice(0, 160);
  if (!description && person.known_for_department) {
    const titles = person.combined_credits?.cast?.slice(0, 3).map((c) => c.title || c.name);
    description = `${person.name} is a ${person.known_for_department.toLowerCase()} known for ${titles?.join(", ")}.`;
  }

  return {
    title: person.name,  // Uses template: "Brad Pitt - Movie Browser"
    description,
    keywords: [person.name, person.known_for_department, "actor", "filmography", ...topTitles],
    openGraph: {
      type: "profile",
      title: person.name,
      description,
      url: `${SITE_URL}/person/${person.id}`,
      images: person.profile_path ? [{ url: `${TMDB_IMAGE_BASE}/w500${person.profile_path}` }] : [],
      firstName: person.name.split(" ")[0],
      lastName: person.name.split(" ").slice(1).join(" "),
    },
    twitter: {
      card: "summary",  // Square card for profile photos
      title: person.name,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/person/${person.id}`,
    },
  };
}
```

## Heading Hierarchy

Every page MUST have exactly ONE `<h1>` tag:

```tsx
// ✅ GOOD
<main>
  <h1>{movie.title}</h1>
  <section>
    <h2>Cast & Crew</h2>
    <h3>Actors</h3>
    <h3>Directors</h3>
  </section>
</main>

// ❌ BAD
<main>
  <h1>{movie.title}</h1>
  <h1>{movie.tagline}</h1>  {/* Multiple h1s! */}
</main>
```

## Image Optimization

```tsx
import Image from "next/image";

// ✅ GOOD: Proper next/image usage
<Image
  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
  alt={`${movie.title} movie poster - Rated ${movie.vote_average}/10`}
  width={500}
  height={750}
  priority={isAboveFold}
  placeholder="blur"
  blurDataURL={movie.placeholder}
/>

// ❌ BAD: Missing alt, no dimensions
<img src={posterUrl} />
```

## Performance for SEO

### Core Web Vitals Targets

- **LCP**: < 2.5s (Largest Contentful Paint)
- **FID**: < 100ms (First Input Delay)
- **CLS**: < 0.1 (Cumulative Layout Shift)

### Implementation

```tsx
// Preload critical resources
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://api.themoviedb.org" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

## Canonical URLs

Every page needs a canonical URL:

```tsx
alternates: {
  canonical: `https://themoviebrowser.com${pathname}`,
}
```

## Browse & Topics Pages

### Browse Page Metadata

```tsx
// src/app/browse/page.tsx
export async function generateMetadata({ searchParams }): Promise<Metadata> {
  const params = parseDiscoverParams(new URLSearchParams(await searchParams));
  const mediaType = params.media_type === "tv" ? "TV Shows" : "Movies";
  
  // Build description from active filters
  let description = `Browse ${mediaType.toLowerCase()}`;
  if (params.with_genres?.length) {
    const genreNames = params.with_genres.map(id => getGenreById(id, params.media_type)?.name).filter(Boolean);
    description += ` in ${genreNames.join(", ")}`;
  }
  
  return {
    title: `Browse ${mediaType} | Movie Browser`,
    description,
    alternates: {
      canonical: `https://themoviebrowser.com/browse`,
    },
  };
}
```

### Topics Page Metadata

```tsx
// src/app/topics/page.tsx
export const metadata: Metadata = {
  title: "Topics | Movie Browser",
  description: "Explore curated collections of movies and TV shows by genre, theme, and more.",
  alternates: { canonical: "https://themoviebrowser.com/topics" },
};

// src/app/topics/[topic]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { topic: topicKey } = await params;
  const topic = getTopicByKey(topicKey);
  
  if (!topic) return { title: "Topic Not Found" };
  
  const mediaLabel = topic.filterParams.media_type === "tv" ? "TV shows" : "movies";
  
  return {
    title: `${topic.name} | Movie Browser`,
    description: `Discover ${topic.name.toLowerCase()} ${mediaLabel}. Browse popular and highly-rated titles.`,
    alternates: { canonical: `https://themoviebrowser.com/topics/${topicKey}` },
  };
}
```

### Topic Keys as URL Slugs

Topic URLs use the standardized key format for SEO-friendly slugs:

```
/topics/genre-action-movie      → Action Movies
/topics/genre-comedy-tv         → Comedy Shows
/topics/theme-christmas-movie   → Christmas Movies
/topics/theme-space-tv          → Space TV Shows
```

## SSR Verification

Content MUST be visible without JavaScript. Test with:

```bash
curl -s https://themoviebrowser.com/movie/550 | grep -o "<h1>.*</h1>"
curl -s https://themoviebrowser.com/topics | grep -o "<h1>.*</h1>"
curl -s https://themoviebrowser.com/browse | grep -o "grid"
```

The h1 with movie title must be present in the initial HTML.
