import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { getMovie } from "@/server/actions/movie";
import {
  MediaHero,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  RecommendationsSection,
  CollectionSection,
  RecentTracker,
} from "@/components/features/media";
import { SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";

interface MoviePageProps {
  params: Promise<{
    params: string[]; // [movieId] or [movieId, slug]
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const movieId = routeParams[0];
  const id = parseInt(movieId, 10);

  if (isNaN(id)) {
    return { title: "Movie Not Found" };
  }

  const movie = await getMovie(id);

  if (!movie) {
    return { title: "Movie Not Found" };
  }

  const year = movie.release_date?.split("-")[0];
  const title = year ? `${movie.title} (${year})` : movie.title;
  const description =
    movie.overview?.slice(0, 160) ||
    `Watch ${movie.title} - details, cast, ratings and where to stream.`;
  const backdropUrl = movie.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${movie.backdrop_path}`
    : undefined;
  const posterUrl = movie.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}`
    : undefined;

  return {
    title,
    description,
    keywords: [
      movie.title,
      ...(movie.genres?.map((g) => g.name) || []),
      "movie",
      "watch",
      "streaming",
      year,
    ].filter(Boolean) as string[],
    openGraph: {
      type: "video.movie",
      title: movie.title,
      description: movie.overview,
      url: `${SITE_URL}/movie/${movie.id}`,
      images: backdropUrl
        ? [
            {
              url: backdropUrl,
              width: 1280,
              height: 720,
              alt: `${movie.title} backdrop`,
            },
          ]
        : posterUrl
          ? [
              {
                url: posterUrl,
                width: 500,
                height: 750,
                alt: `${movie.title} poster`,
              },
            ]
          : [],
      releaseDate: movie.release_date,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: backdropUrl ? [backdropUrl] : posterUrl ? [posterUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/movie/${movie.id}`,
    },
  };
}

// JSON-LD structured data for SEO
function MovieSchema({
  movie,
}: {
  movie: NonNullable<Awaited<ReturnType<typeof getMovie>>>;
}) {
  const director = movie.credits?.crew?.find((c) => c.job === "Director");
  const actors = movie.credits?.cast?.slice(0, 5) || [];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    description: movie.overview,
    datePublished: movie.release_date,
    image: movie.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}`
      : undefined,
    aggregateRating:
      movie.vote_average && movie.vote_count
        ? {
            "@type": "AggregateRating",
            ratingValue: movie.vote_average.toFixed(1),
            ratingCount: movie.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    genre: movie.genres?.map((g) => g.name),
    duration: movie.runtime ? `PT${movie.runtime}M` : undefined,
    director: director
      ? {
          "@type": "Person",
          name: director.name,
        }
      : undefined,
    actor: actors.map((a) => ({
      "@type": "Person",
      name: a.name,
    })),
    productionCompany: movie.production_companies?.slice(0, 3).map((c) => ({
      "@type": "Organization",
      name: c.name,
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

export default async function MoviePage({ params }: MoviePageProps) {
  const { params: routeParams } = await params;
  const movieId = routeParams[0];
  const id = parseInt(movieId, 10);

  if (isNaN(id)) {
    notFound();
  }

  const movie = await getMovie(id);

  if (!movie) {
    notFound();
  }

  // Get YouTube videos
  const youtubeVideos = movie.videos?.results?.filter((v) => v.site === "YouTube") || [];

  return (
    <>
      <MovieSchema movie={movie} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={movie.id}
        isMovie={true}
        title={movie.title}
        poster_path={movie.poster_path}
        backdrop_path={movie.backdrop_path}
      />

      <article className="pb-12">
        {/* Hero section with backdrop, logo, genres, ratings, actions */}
        <MediaHero item={movie} mediaType="movie" />

        {/* Overview, cast, and details */}
        <MediaOverview item={movie} mediaType="movie" />

        {/* Collection/Franchise */}
        {movie.collectionDetails && (
          <CollectionSection
            collection={movie.collectionDetails}
            currentMovieId={movie.id}
            className="mt-8 md:mt-12"
          />
        )}

        {/* Video Gallery */}
        {youtubeVideos.length > 0 && (
          <VideoGallery videos={youtubeVideos} className="mt-8 md:mt-12" />
        )}

        {/* Image Gallery */}
        {movie.images?.backdrops && movie.images.backdrops.length > 0 && (
          <ImageGallery
            images={movie.images.backdrops}
            title="Gallery"
            className="mt-8 md:mt-12"
          />
        )}

        {/* Recommendations & Similar */}
        <RecommendationsSection
          recommendations={movie.recommendations?.results}
          similar={movie.similar?.results}
          mediaType="movie"
          className="mt-8 md:mt-12"
        />
      </article>
    </>
  );
}

