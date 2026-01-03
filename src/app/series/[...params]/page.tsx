import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { getSeries } from "@/server/actions/series";
import {
  MediaActionBar,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  RecommendationsSection,
  RecentTracker,
  HeroBackdropShell,
  HeroLogoShell,
  HeroMediaProvider,
  HeroMediaUpdater,
  GenreList,
  RatingsBar,
  WatchOptions,
  DetailBadges,
} from "@/components/features/media";
import { getMediaBadges } from "@/lib/badges";
import { SeasonSelector, EpisodeInfoSection } from "@/components/features/series";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE_URL, TMDB_IMAGE_BASE, CDN_IMAGE_BASE } from "@/lib/constants";
import type { Series } from "@/types";

interface SeriesPageProps {
  params: Promise<{
    params: string[]; // [seriesId] or [seriesId, slug]
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

  if (isNaN(id)) {
    return { title: "Series Not Found" };
  }

  const series = await getSeries(id);

  if (!series) {
    return { title: "Series Not Found" };
  }

  const year = series.first_air_date?.split("-")[0];
  const title = year ? `${series.name} (${year})` : series.name;
  const description =
    series.overview?.slice(0, 160) ||
    `Watch ${series.name} - details, cast, ratings and where to stream.`;
  const backdropUrl = series.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${series.backdrop_path}`
    : undefined;
  const posterUrl = series.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}`
    : undefined;

  return {
    title,
    description,
    keywords: [
      series.name,
      ...(series.genres?.map((g) => g.name) || []),
      "tv show",
      "series",
      "watch",
      "streaming",
      year,
    ].filter(Boolean) as string[],
    openGraph: {
      type: "video.tv_show",
      title: series.name,
      description: series.overview,
      url: `${SITE_URL}/series/${series.id}`,
      images: backdropUrl
        ? [
            {
              url: backdropUrl,
              width: 1280,
              height: 720,
              alt: `${series.name} backdrop`,
            },
          ]
        : posterUrl
          ? [
              {
                url: posterUrl,
                width: 500,
                height: 750,
                alt: `${series.name} poster`,
              },
            ]
          : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: backdropUrl ? [backdropUrl] : posterUrl ? [posterUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/series/${series.id}`,
    },
  };
}

// Preload CDN images for faster LCP
function ImagePreloader({ seriesId }: { seriesId: number }) {
  const backdropUrl = `${CDN_IMAGE_BASE}/series/${seriesId}/backdrop.webp`;
  const logoUrl = `${CDN_IMAGE_BASE}/series/${seriesId}/logo.webp`;

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

      {/* Season selector skeleton */}
      <section className="mt-4 md:mt-6 px-4 md:px-8 lg:px-12">
        <div className="space-y-4">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-lg flex-shrink-0" />
            ))}
          </div>
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[200px] sm:w-[240px]">
                <Skeleton className="aspect-video rounded-lg mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Next episode skeleton */}
      <section className="mt-6 md:mt-8 px-4 md:px-8 lg:px-12">
        <Skeleton className="h-32 w-full max-w-xl rounded-xl" />
      </section>

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
async function HeroContentAsync({ seriesId }: { seriesId: number }) {
  const series = await getSeries(seriesId);
  if (!series) return null;

  const genres = series.genres || [];
  const displayRatings =
    series.ratings?.length
      ? series.ratings
      : series.vote_average && series.vote_average > 0
        ? [{ name: "TMDB", rating: Math.round(series.vote_average * 10).toString() }]
        : [];

  // Get badges for detail page (show more than cards)
  const badges = getMediaBadges(series, { maxBadges: 3, context: "detail" });

  // Get English logo for fallback (prefer English, then first available)
  const englishLogo = series.images?.logos?.find(
    (logo) => logo.iso_639_1 === "en"
  );
  const logoPath = englishLogo?.file_path ?? series.images?.logos?.[0]?.file_path;

  return (
    <div className="hero-content-width pb-5 md:pb-6 lg:pb-8 flex flex-col items-start gap-2.5 md:gap-3">
      {/* Provide TMDB fallback data to hero shells via context */}
      <HeroMediaUpdater
        tmdbBackdropPath={series.backdrop_path}
        tmdbLogoPath={logoPath}
        title={series.name}
      />

      {/* Status badges (trending, new season, currently airing, etc.) */}
      {badges.length > 0 && <DetailBadges badges={badges} />}

      {/* Genres */}
      {genres.length > 0 && (
        <GenreList genres={genres} mediaType="series" size="sm" maxVisible={4} />
      )}

      {/* Ratings */}
      {displayRatings.length > 0 && (
        <RatingsBar ratings={displayRatings} size="md" maxVisible={5} />
      )}

      {/* Watch Options */}
      {series.watch_options?.options?.length ? (
        <WatchOptions
          watchOptions={series.watch_options}
          watchProviders={series.watch_providers}
          item={{ id: series.id, name: series.name, poster_path: series.poster_path, backdrop_path: series.backdrop_path }}
          isMovie={false}
        />
      ) : null}
    </div>
  );
}

// Async page content - action bar, seasons, overview, galleries, recommendations
async function SeriesContentAsync({ seriesId }: { seriesId: number }) {
  const series = await getSeries(seriesId);
  if (!series) return null;

  const youtubeVideos = series.videos?.results?.filter((v) => v.site === "YouTube") || [];
  const displaySeasons = series.seasons?.filter((s) => s.season_number >= 0) || [];

  return (
    <>
      {/* JSON-LD Schema */}
      <SeriesSchema series={series} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={series.id}
        isMovie={false}
        name={series.name}
        poster_path={series.poster_path}
        backdrop_path={series.backdrop_path}
      />

      {/* Action buttons - Play Trailer, Watchlist, Like/Dislike, Share */}
      <MediaActionBar
        itemId={series.id}
        mediaType="series"
        title={series.name}
        videos={series.videos}
        className="mt-2 md:mt-3"
      />

      {/* Season & Episode Selector */}
      {displaySeasons.length > 0 && (
        <SeasonSelector
          seriesId={series.id}
          seriesName={series.name}
          seasons={displaySeasons}
          className="mt-4 md:mt-6"
        />
      )}

      {/* Next/Last Episode Info */}
      <EpisodeInfoSection
        nextEpisode={series.next_episode_to_air}
        lastEpisode={series.last_episode_to_air}
        seriesName={series.name}
        className="mt-6 md:mt-8"
      />

      {/* Overview, cast, and details */}
      <MediaOverview item={series} mediaType="series" />

      {/* Video Gallery */}
      {youtubeVideos.length > 0 && (
        <VideoGallery videos={youtubeVideos} className="mt-8 md:mt-12" />
      )}

      {/* Image Gallery */}
      {series.images?.backdrops && series.images.backdrops.length > 0 && (
        <ImageGallery
          images={series.images.backdrops}
          title="Gallery"
          className="mt-8 md:mt-12"
        />
      )}

      {/* Recommendations & Similar */}
      <RecommendationsSection
        recommendations={series.recommendations?.results}
        similar={series.similar?.results}
        mediaType="series"
        className="mt-8 md:mt-12"
      />
    </>
  );
}

// JSON-LD structured data for SEO
function SeriesSchema({ series }: { series: Series }) {
  const creators =
    series.credits?.crew?.filter((c) => c.job === "Creator") || [];
  const actors = series.credits?.cast?.slice(0, 5) || [];

  const schema = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.name,
    description: series.overview,
    datePublished: series.first_air_date,
    image: series.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}`
      : undefined,
    aggregateRating:
      series.vote_average && series.vote_count
        ? {
            "@type": "AggregateRating",
            ratingValue: series.vote_average.toFixed(1),
            ratingCount: series.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    genre: series.genres?.map((g) => g.name),
    numberOfSeasons: series.number_of_seasons,
    numberOfEpisodes: series.number_of_episodes,
    creator: creators.map((c) => ({
      "@type": "Person",
      name: c.name,
    })),
    actor: actors.map((a) => ({
      "@type": "Person",
      name: a.name,
    })),
    productionCompany: series.production_companies?.slice(0, 3).map((c) => ({
      "@type": "Organization",
      name: c.name,
    })),
    containsSeason: series.seasons?.map((s) => ({
      "@type": "TVSeason",
      seasonNumber: s.season_number,
      numberOfEpisodes: s.episode_count,
      name: s.name,
    })),
  };

  return (
    <Script
      id="series-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { params: routeParams } = await params;
  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

  if (isNaN(id)) {
    notFound();
  }

  // Hero images render IMMEDIATELY - just needs the ID
  // CDN URLs are deterministic: /series/{id}/backdrop.webp, /series/{id}/logo.webp
  // Content loads via Suspense while images are already loading/visible
  // HeroMediaProvider enables shells to receive TMDB fallback data from async content
  return (
    <>
      <ImagePreloader seriesId={id} />

      <HeroMediaProvider>
        <article className="pb-12">
          {/* Hero section - backdrop & logo render IMMEDIATELY with just ID */}
          <section className="relative">
            <div className="hero-container relative w-full overflow-hidden">
              <HeroBackdropShell mediaId={id} mediaType="series" overlay="light">
                {/* Content overlay - positioned at bottom */}
                <div className="absolute inset-0 flex flex-col justify-end px-4 md:px-8 lg:px-12">
                  {/* Logo renders immediately with just ID
                      Constraints: tall logos need generous height,
                      wide logos expand to fill available space */}
                  <div className="mb-4 md:mb-6 lg:mb-8">
                    <HeroLogoShell
                      mediaId={id}
                      mediaType="series"
                      className="max-w-[280px] sm:max-w-[380px] md:max-w-[500px] lg:max-w-[600px] max-h-[100px] sm:max-h-[130px] md:max-h-[160px] lg:max-h-[180px]"
                    />
                  </div>
                  
                  {/* Genres, ratings, watch options load via Suspense */}
                  <Suspense fallback={<HeroContentSkeleton />}>
                    <HeroContentAsync seriesId={id} />
                  </Suspense>
                </div>
              </HeroBackdropShell>
            </div>
          </section>

          {/* Rest of page content loads via Suspense */}
          <Suspense fallback={<PageContentSkeleton />}>
            <SeriesContentAsync seriesId={id} />
          </Suspense>
        </article>
      </HeroMediaProvider>
    </>
  );
}
