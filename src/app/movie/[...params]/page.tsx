import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { getMovie } from "@/server/actions/movie";
import { getMovieCollection } from "@/server/services/tmdb";
import { getAISummary } from "@/lib/ai-summary";
import {
  MediaActionBar,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  RecommendationsSection,
  CollectionSection,
  RecentTracker,
  HeroBackdropShell,
  HeroLogoShell,
  HeroMediaProvider,
  HeroMediaUpdater,
  GenreList,
  RatingsBar,
  WatchOptions,
  DetailBadges,
  AIQuestionsSection,
} from "@/components/features/media";
import { getMediaBadges } from "@/lib/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE_URL, TMDB_IMAGE_BASE, CDN_IMAGE_BASE } from "@/lib/constants";
import type { Collection, Movie, AISummary } from "@/types";

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

// Preload CDN images for faster LCP
function ImagePreloader({ movieId }: { movieId: number }) {
  const backdropUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/backdrop.webp`;
  const logoUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/logo.webp`;

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={backdropUrl}
        type="image/webp"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href={logoUrl}
        type="image/webp"
        fetchPriority="high"
      />
    </>
  );
}

// Hero content skeleton - shown while data loads
function HeroContentSkeleton() {
  return (
    <div className="hero-content-width pb-5 md:pb-6 lg:pb-8 flex flex-col items-start gap-2.5 md:gap-3">
      {/* Badges skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
        <Skeleton className="h-6 w-28 rounded-full bg-white/10" />
      </div>

      {/* Genres skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
        <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
        <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
      </div>
      
      {/* Ratings skeleton */}
      <Skeleton className="h-8 w-52 rounded-full bg-white/10" />
      
      {/* Watch options skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
        <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
      </div>
    </div>
  );
}

// Collection section skeleton
function CollectionSkeleton() {
  return (
    <section className="mt-8 md:mt-12 space-y-4">
      <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="flex gap-3 px-4 md:px-8 lg:px-12 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[130px] sm:w-[145px] md:w-[160px]">
            <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

// Page content skeleton - overview, cast, etc.
function PageContentSkeleton() {
  return (
    <>
      {/* Action bar skeleton */}
      <div className="mt-2 md:mt-3 px-4 md:px-8 lg:px-12">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      {/* Overview section skeleton */}
      <section className="py-4 md:py-5 px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_280px] xl:grid-cols-[1fr_1px_320px]">
            <div className="p-5 md:p-6 space-y-4">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="hidden lg:block bg-white/10" />
            <div className="p-5 md:p-6 space-y-3 border-t lg:border-t-0 border-white/10">
              <Skeleton className="h-4 w-16 mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cast skeleton */}
      <section className="space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[90px] sm:w-[100px] md:w-[110px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-1.5" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// Async hero content - fetches data and renders badges, genres, ratings, watch options
async function HeroContentAsync({ movieId }: { movieId: number }) {
  const movie = await getMovie(movieId);
  if (!movie) return null;

  const genres = movie.genres || [];
  const displayRatings =
    movie.ratings?.length
      ? movie.ratings
      : movie.vote_average && movie.vote_average > 0
        ? [{ name: "TMDB", rating: Math.round(movie.vote_average * 10).toString() }]
        : [];

  // Get badges for detail page (show more than cards)
  const badges = getMediaBadges(movie, { maxBadges: 3, context: "detail" });

  // Get English logo for fallback (prefer English, then first available)
  const englishLogo = movie.images?.logos?.find(
    (logo) => logo.iso_639_1 === "en"
  );
  const logoPath = englishLogo?.file_path ?? movie.images?.logos?.[0]?.file_path;

  return (
    <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 pb-2 md:pb-6 lg:pb-8 md:hero-content-width">
      {/* Provide TMDB fallback data to hero shells via context */}
      <HeroMediaUpdater
        tmdbBackdropPath={movie.backdrop_path}
        tmdbLogoPath={logoPath}
        title={movie.title}
      />

      {/* Status badges (trending, new, critically acclaimed, etc.) */}
      {badges.length > 0 && <DetailBadges badges={badges} className="drop-shadow-md" />}

      {/* Genres */}
      {genres.length > 0 && (
        <GenreList genres={genres} mediaType="movie" size="sm" maxVisible={4} />
      )}

      {/* Ratings */}
      {displayRatings.length > 0 && (
        <RatingsBar ratings={displayRatings} size="md" maxVisible={5} />
      )}

      {/* Watch Options */}
      {movie.watch_options?.options?.length ? (
        <WatchOptions
          watchOptions={movie.watch_options}
          watchProviders={movie.watch_providers}
          item={{ id: movie.id, title: movie.title, poster_path: movie.poster_path, backdrop_path: movie.backdrop_path }}
          isMovie={true}
        />
      ) : null}
    </div>
  );
}

// Async page content - action bar, overview, galleries, recommendations
async function MovieContentAsync({ movieId }: { movieId: number }) {
  // Fetch movie data and AI summary in parallel
  const [movie, aiSummary] = await Promise.all([
    getMovie(movieId),
    getAISummary(movieId),
  ]);
  if (!movie) return null;

  const youtubeVideos = movie.videos?.results?.filter((v) => v.site === "YouTube") || [];

  return (
    <>
      {/* JSON-LD Schema */}
      <MovieSchema movie={movie} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={movie.id}
        isMovie={true}
        title={movie.title}
        poster_path={movie.poster_path}
        backdrop_path={movie.backdrop_path}
      />

      {/* Action buttons - Play Trailer, Watchlist, Like/Dislike, Share + QuickTake pills */}
      <MediaActionBar
        itemId={movie.id}
        mediaType="movie"
        title={movie.title}
        videos={movie.videos}
        quickTake={aiSummary?.quickTake}
        className="mt-2 md:mt-3"
      />

      {/* Overview, cast, and details */}
      <MediaOverview item={movie} mediaType="movie" aiSummary={aiSummary} />

      {/* AI Questions - clickable prompts that trigger AI chat */}
      {aiSummary?.aiQuestions && aiSummary.aiQuestions.length > 0 && (
        <AIQuestionsSection
          questions={aiSummary.aiQuestions}
          title={movie.title}
          year={movie.release_date?.split("-")[0]}
          tmdbId={movie.id}
          className="mt-4"
        />
      )}

      {/* Collection/Franchise - Deferred with Suspense */}
      {movie.belongs_to_collection && (
        <Suspense fallback={<CollectionSkeleton />}>
          <CollectionAsync
            collectionId={(movie.belongs_to_collection as { id: number }).id}
            currentMovieId={movie.id}
          />
        </Suspense>
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
    </>
  );
}

// JSON-LD structured data for SEO
function MovieSchema({ movie }: { movie: Movie }) {
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

// Async collection component
async function CollectionAsync({
  collectionId,
  currentMovieId,
}: {
  collectionId: number;
  currentMovieId: number;
}) {
  try {
    const collectionData = await getMovieCollection(collectionId);
    if (!collectionData) return null;

    const collection: Collection = {
      id: collectionData.id as number,
      name: collectionData.name as string,
      overview: collectionData.overview as string | undefined,
      poster_path: collectionData.poster_path as string | null,
      backdrop_path: collectionData.backdrop_path as string | null,
      parts: collectionData.parts as Collection["parts"],
    };

    return (
      <CollectionSection
        collection={collection}
        currentMovieId={currentMovieId}
        className="mt-8 md:mt-12"
      />
    );
  } catch {
    return null;
  }
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { params: routeParams } = await params;
  const movieId = routeParams[0];
  const id = parseInt(movieId, 10);

  if (isNaN(id)) {
    notFound();
  }

  // Hero images render IMMEDIATELY - just needs the ID
  // CDN URLs are deterministic: /movie/{id}/backdrop.webp, /movie/{id}/logo.webp
  // Content loads via Suspense while images are already loading/visible
  // HeroMediaProvider enables shells to receive TMDB fallback data from async content
  return (
    <>
      <ImagePreloader movieId={id} />

      <HeroMediaProvider>
        <article className="pb-12">
          {/* Hero section - backdrop & logo render IMMEDIATELY with just ID
              Mobile: Image with aspect ratio, content below (centered)
              Desktop: Image fills container, content overlays at bottom */}
          <section className="relative">
            <div className="hero-container relative w-full overflow-hidden">
              <HeroBackdropShell mediaId={id} mediaType="movie" overlay="light">
                {/* Content container
                    Mobile: centered, normal document flow (below image)
                    Desktop: absolute positioned overlay at bottom */}
                <div className="flex flex-col items-center text-center md:items-start md:text-left md:absolute md:inset-0 md:flex md:flex-col md:justify-end md:px-8 lg:px-12">
                  {/* Logo renders immediately with just ID */}
                  <div className="mb-3 md:mb-6 lg:mb-8">
                    <HeroLogoShell
                      mediaId={id}
                      mediaType="movie"
                      className="max-w-[260px] sm:max-w-[320px] md:max-w-[500px] lg:max-w-[600px] max-h-[80px] sm:max-h-[100px] md:max-h-[160px] lg:max-h-[180px]"
                    />
                  </div>
                  
                  {/* Genres, ratings, watch options load via Suspense */}
                  <Suspense fallback={<HeroContentSkeleton />}>
                    <HeroContentAsync movieId={id} />
                  </Suspense>
                </div>
              </HeroBackdropShell>
            </div>
          </section>

          {/* Rest of page content loads via Suspense */}
          <Suspense fallback={<PageContentSkeleton />}>
            <MovieContentAsync movieId={id} />
          </Suspense>
        </article>
      </HeroMediaProvider>
    </>
  );
}
