import { Suspense, cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getMovie as getMovieBase } from "@/server/actions/movie";

// Deduplicate getMovie calls within the same request
// generateMetadata, HeroContentAsync, MovieContentAsync all use the same cached result
const getMovie = cache(getMovieBase);
// Same dedup for AI data — generateMetadata uses the hook/themes (unique SEO
// content) and both async sections render from it; one PG read per request.
const getAIDataCached = cache(getAIData);

// ISR: cache the rendered page for 1h instead of full SSR on every request. The
// SSR HTML is user-agnostic (user state hydrates client-side; ratings stream via
// SSE), so caching it massively cuts CPU under crawler/repeat traffic. Live
// ratings still arrive via the enrichment SSE stream on each client load.
export const revalidate = 3600;

// REQUIRED for ISR: without generateStaticParams, a dynamic route is rendered
// per-request and `revalidate` above is a no-op (verified: no route-cache
// entries ever written). Empty array = prerender nothing at build time, but
// cache every on-demand render for the revalidate window (dynamicParams
// defaults to true).
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}
import { getMovieCollection } from "@/server/services/tmdb";
import { movieExists } from "@/server/services/media-exists";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import {
  breadcrumbList,
  trailerVideoObject,
  watchActions,
  titleSameAs,
  omitEmpty,
  aiThemeKeywords,
} from "@/lib/seo/jsonld";
import { getCollectionFromPostgres } from "@/server/db/postgres";
import { getAIData, aiDataResponseToSummary } from "@/server/services/ai-data-service";
import {
  MediaActionBar,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  SimilarSection,
  SimilarSectionSkeleton,
  CollectionSection,
  RecentTracker,
  HeroBackdropShell,
  HeroLogoShell,
  HeroMediaProvider,
  HeroMediaUpdater,
  WatchOptions,
  DetailBadges,
  AIQuestionsSection,
  DeepDiveSection,
  MediaContextUpdater,
  EnrichmentProvider,
  EnrichmentRefreshIndicator,
  LiveRatings,
  LiveAIHook,
  LiveAISections,
} from "@/components/features/media";
import { sortVideos } from "@/lib/video-utils";
import { getMediaBadges } from "@/lib/badges";
import { ReviewsSection, ReviewsRatingsEntry } from "@/components/features/reviews";
import { DiscussionSection, DiscussionEntryStrip, discussionsHref } from "@/components/features/discussion";
import {
  parseMovieDiscussions,
  generateMovieDiscussionsMetadata,
  MovieDiscussionsView,
} from "./discussions-page";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE, CDN_IMAGE_BASE } from "@/lib/constants";
import type { Collection, Movie } from "@/types";
import {
  extractMovieOverviewProps,
  extractWatchOptionsItem,
  extractTrailerData,
  extractLightCollection,
  extractLightVideos,
  extractLightGalleryImages,
  extractOverviewAISummary,
  extractOverviewAIInsights,
} from "@/types/client-props";

interface MoviePageProps {
  params: Promise<{
    params: string[]; // [movieId] or [movieId, slug]
  }>;
  searchParams: Promise<{
    __e2e_error?: string; // Test-only: triggers error boundary for E2E testing
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const { params: routeParams } = await params;

  // Dedicated discussions page (rides this catch-all — Next.js forbids a static
  // `discussions` segment after [...params]). Branch before detail-page logic.
  const discussionsMovieId = parseMovieDiscussions(routeParams);
  if (discussionsMovieId !== null) return generateMovieDiscussionsMetadata(discussionsMovieId);

  const movieId = routeParams[0];
  const id = parseInt(movieId, 10);

  // STATUS CODES NOW LIVE IN THE PROXY, NOT HERE. This route has loading.tsx
  // (instant nav skeletons), so every response streams a 200 shell before
  // this function can affect the status — notFound()/permanentRedirect()
  // below can no longer emit real 404/308s. The authoritative 404/308
  // resolution happens pre-render in src/proxy.ts via
  // src/server/proxy/media-resolver.ts (LRU → PG PK lookup → TMDB check).
  // The throws are KEPT as a nearly-dead fallback for requests that bypass
  // the proxy (dev direct hits, tests, resolver fail-open): they still render
  // the not-found UI / client-side redirect, just without the status code.
  if (isNaN(id)) {
    notFound();
  }

  // AI data rides along (~5ms PG read, deduped with the page render below).
  const [movie, aiData] = await Promise.all([getMovie(id), getAIDataCached(id, "movie")]);

  if (!movie) {
    // Fallback only (proxy already 404'd definitively-missing ids): treat a
    // transient fetch failure as a graceful 200 shell render.
    if (!(await movieExists(id))) {
      notFound();
    }
    return { title: "Movie Not Found" };
  }

  // Canonicalization fallback — the proxy 308s wrong/missing slugs before the
  // page runs; this only fires for proxy-bypassing requests (soft redirect).
  const canonicalPath = getMediaPath("movie", movie.id, movie.title);
  if (`/movie/${routeParams.join("/")}` !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  const year = movie.release_date?.split("-")[0];
  const titleBase = year ? `${movie.title} (${year})` : movie.title;
  // "where to watch X" is the #1 query class for this site — bake the intent
  // into the SERP title unless the name itself is already long.
  const title =
    movie.title.length <= 35
      ? `${titleBase} — Where to Watch, Ratings & Cast | ${SITE_NAME}`
      : `${titleBase} | ${SITE_NAME}`;
  const watchIntro = `Where to watch ${titleBase} — streaming options, ratings, cast & reviews.`;
  // Prefer the AI hook over the TMDB overview: every TMDB-based site serves
  // the identical overview text (duplicate SERP snippets); the hook is unique
  // to us. Fall back to the overview for un-enriched long-tail titles.
  const aiHook =
    typeof aiData?.hook === "string" && aiData.hook.trim().length > 0
      ? aiData.hook.trim()
      : null;
  const descriptionBody = aiHook ?? movie.overview;
  const description = descriptionBody
    ? truncateAtWord(`${watchIntro} ${descriptionBody}`, 160)
    : watchIntro;
  const backdropUrl = movie.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${movie.backdrop_path}`
    : undefined;
  const posterUrl = movie.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : undefined;

  return {
    // absolute: opt out of the layout's "%s - Movie Browser" template — the
    // brand is already in the watch-intent title.
    title: { absolute: title },
    description,
    keywords: [
      movie.title,
      ...(movie.genres?.map((g) => g.name) || []),
      "movie",
      "watch",
      "streaming",
      year,
    ].filter(Boolean) as string[],
    // Adult titles stay reachable for direct visitors but leave search indexes
    // (they are also excluded from the sitemap and the .md twin layer). A whole
    // adult long tail ranking here would get the domain classified
    // adult-oriented and SafeSearch-filtered, capping the mainstream catalog.
    // Derived from the already-fetched movie row — no dynamic APIs, ISR intact.
    ...(movie.adult ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "video.movie",
      siteName: SITE_NAME,
      locale: "en_US",
      title: movie.title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
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
      title: titleBase,
      description,
      images: backdropUrl ? [backdropUrl] : posterUrl ? [posterUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}${canonicalPath}`,
      // LLM-friendly markdown twin: <link rel="alternate" type="text/markdown">
      types: { "text/markdown": `${SITE_URL}${canonicalPath}.md` },
    },
  };
}

// Preload CDN images for faster LCP
function ImagePreloader({ movieId }: { movieId: number }) {
  const backdropUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/backdrop.webp`;
  const logoUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/logo.webp`;

  return (
    <>
      <link rel="preload" as="image" href={backdropUrl} type="image/webp" fetchPriority="high" />
      <link rel="preload" as="image" href={logoUrl} type="image/webp" fetchPriority="high" />
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

// Async hero content - fetches data and renders badges, genres, ratings, watch options, hook
async function HeroContentAsync({ movieId }: { movieId: number }) {
  // Fetch movie and AI data in parallel
  const [movie, aiData] = await Promise.all([
    getMovie(movieId),
    getAIDataCached(movieId, "movie"),
  ]);
  if (!movie) return null;

  // Convert to legacy format for components that still use it
  const aiSummary = aiData ? aiDataResponseToSummary(aiData) : null;

  const displayRatings = movie.ratings?.length
    ? movie.ratings
    : movie.vote_average && movie.vote_average > 0
      ? [{ name: "TMDB", rating: Math.round(movie.vote_average * 10).toString() }]
      : [];

  // Get badges for detail page (show more than cards)
  const badges = getMediaBadges(movie, { maxBadges: 3, context: "detail" });

  // Get English logo for fallback (prefer English, then first available)
  const englishLogo = movie.images?.logos?.find((logo) => logo.iso_639_1 === "en");
  const logoPath = englishLogo?.file_path ?? movie.images?.logos?.[0]?.file_path;

  return (
    <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 pb-2 md:pb-6 lg:pb-8 md:hero-content-width">
      {/* Provide TMDB fallback data to hero shells via context */}
      <HeroMediaUpdater
        tmdbBackdropPath={movie.backdrop_path}
        tmdbLogoPath={logoPath}
        title={movie.title}
      />

      {/* AI Hook - tagline above content (live-updated via SSE) */}
      <LiveAIHook initialHook={aiSummary?.hook ?? null} />

      {/* Status badges (trending, new, critically acclaimed, etc.) */}
      {badges.length > 0 && <DetailBadges badges={badges} className="drop-shadow-md" />}

      {/* Ratings (live-updated via SSE when Lambda scrapes fresh data) */}
      <LiveRatings
        initialRatings={displayRatings}
        size="md"
        maxVisible={5}
        mediaType="movie"
        tmdbId={movie.id}
      />

      {/* Refresh indicator — subtle pulsing dot when enrichment is in progress */}
      <EnrichmentRefreshIndicator />

      {/* Watch Options - using light item props to reduce RSC payload */}
      {movie.watch_options?.options?.length ? (
        <WatchOptions
          watchOptions={movie.watch_options}
          item={extractWatchOptionsItem(movie, true)}
          isMovie={true}
        />
      ) : null}
    </div>
  );
}

// Async page content - action bar, overview, galleries, recommendations
async function MovieContentAsync({ movieId }: { movieId: number }) {
  // Fetch movie data and AI data in parallel
  const [movie, aiData] = await Promise.all([
    getMovie(movieId),
    getAIDataCached(movieId, "movie"),
  ]);
  if (!movie) return null;

  // Convert to legacy format for components that still use it
  const aiSummary = aiData ? aiDataResponseToSummary(aiData) : null;

  // Filter YouTube videos and sort by priority (Trailer > Teaser > etc.) + date
  const youtubeVideos = sortVideos(
    movie.videos?.results?.filter((v) => v.site === "YouTube") || []
  );

  return (
    <>
      {/* Single semantic H1 (visually hidden — the hero logo image is the
          visual headline). Movie/series pages previously had NO h1 at all. */}
      <h1 className="sr-only">
        {movie.title}
        {movie.release_date ? ` (${movie.release_date.split("-")[0]})` : ""}
      </h1>

      {/* JSON-LD Schema */}
      <MovieSchema movie={movie} aiThemes={aiData?.insights?.spoilerFree?.themes} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={movie.id}
        isMovie={true}
        title={movie.title}
        poster_path={movie.poster_path}
        backdrop_path={movie.backdrop_path}
      />

      {/* Update global media context for AI chat prompts */}
      <MediaContextUpdater
        mediaType="movie"
        itemId={movie.id}
        title={movie.title}
        year={movie.release_date?.split("-")[0]}
        runtime={movie.runtime}
        rating={movie.vote_average}
        voteCount={movie.vote_count}
        genres={movie.genres?.map((g) => g.name)}
        aiQuestions={aiSummary?.aiQuestions}
        postWatchQuestions={aiData?.insights?.spoilerContent?.questions}
        trivia={aiData?.insights?.spoilerContent?.deepDive
          ?.filter((d) => d.subcategory === "trivia" || d.subcategory === "insight")
          .map((d) => d.text)}
      />

      {/* Action buttons - Play Trailer, Watchlist, Like/Dislike, Share + QuickTake pills */}
      {/* Pass only trailer data instead of full videos array */}
      <MediaActionBar
        itemId={movie.id}
        mediaType="movie"
        title={movie.title}
        posterPath={movie.poster_path}
        trailer={extractTrailerData(movie.videos)}
        quickTake={aiSummary?.quickTake}
        className="mt-2 md:mt-3"
      />

      {/* Community entry row — Discussion + Reviews&Ratings as PEER teasers right
          below the action bar (spec §4.3). Both cacheable/anon-tier (no viewer
          state). Each links into its full section lower on the page. */}
      <div className="px-4 md:px-8 lg:px-12 mt-3 md:mt-4 grid gap-3 md:grid-cols-2">
        <Suspense fallback={null}>
          <DiscussionEntryStrip anchor={{ type: "movie", movieId: movie.id }} title={movie.title} />
        </Suspense>
        <Suspense fallback={null}>
          <ReviewsRatingsEntry mediaType="movie" tmdbId={movie.id} href="#reviews" />
        </Suspense>
      </div>

      {/* Overview, cast, and details - using light props to reduce RSC payload by ~80% */}
      <MediaOverview
        item={extractMovieOverviewProps(movie)}
        mediaType="movie"
        aiSummary={extractOverviewAISummary(aiSummary)}
        aiInsights={extractOverviewAIInsights(aiData?.insights)}
      />

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

      {/* Deep Dive - trivia, insights, behind the scenes with spoiler gating */}
      {aiData?.insights?.spoilerContent?.deepDive &&
        aiData.insights.spoilerContent.deepDive.length > 0 && (
          <DeepDiveSection
            items={aiData.insights.spoilerContent.deepDive}
            className="mt-6"
            maxCollapsedItems={3}
            mediaId={movie.id}
          />
        )}

      {/* Live AI sections — when server had no AI data, SSE delivers it with fade-in */}
      {!aiData && (
        <LiveAISections
          title={movie.title}
          year={movie.release_date?.split("-")[0]}
          tmdbId={movie.id}
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

      {/* Video Gallery - field-picked to declared Video shape */}
      {youtubeVideos.length > 0 && (
        <VideoGallery
          videos={extractLightVideos(youtubeVideos, 20)}
          mediaId={movie.id}
          mediaType="movie"
          className="mt-8 md:mt-12"
        />
      )}

      {/* Image Gallery - light images (drops iso_639_1/vote_average) */}
      {movie.images?.backdrops && movie.images.backdrops.length > 0 && (
        <ImageGallery
          images={extractLightGalleryImages(movie.images.backdrops, 20)}
          title="Gallery"
          className="mt-8 md:mt-12"
        />
      )}

      {/* User reviews (published+public only in cached HTML; own review hydrates client-side) */}
      <ReviewsSection
        mediaType="movie"
        tmdbId={movie.id}
        title={movie.title}
        className="mt-8 md:mt-12"
      />

      {/* Similar - AI-powered embedding similarity with TMDB fallback */}
      <Suspense fallback={<SimilarSectionSkeleton />}>
        <SimilarSection
          itemId={movie.id}
          mediaType="movie"
          tmdbRecommendations={movie.recommendations?.results?.slice(0, 15)}
          tmdbSimilar={movie.similar?.results?.slice(0, 15)}
          className="mt-8 md:mt-12"
          // Exclude movies from the same collection (they're shown in CollectionSection above)
          excludeCollectionId={(movie.belongs_to_collection as { id?: number } | null)?.id}
        />
      </Suspense>

      {/* Discussion — anon tier + locked teaser are progress-independent (ISR-safe);
          gated tier hydrates client-side. */}
      <Suspense fallback={null}>
        <DiscussionSection
          anchor={{ type: "movie", movieId: movie.id }}
          starters={[]}
          className="mt-8 md:mt-12"
          viewAllHref={discussionsHref({ type: "movie", movieId: movie.id }, movie.title)}
        />
      </Suspense>
    </>
  );
}

// JSON-LD structured data for SEO
function MovieSchema({ movie, aiThemes }: { movie: Movie; aiThemes?: string[] }) {
  const director = movie.credits?.crew?.find((c) => c.job === "Director");
  const actors = movie.credits?.cast?.slice(0, 5) || [];
  const canonicalPath = getMediaPath("movie", movie.id, movie.title);

  const schema = omitEmpty({
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    url: `${SITE_URL}${canonicalPath}`,
    description: movie.overview,
    datePublished: movie.release_date,
    image: movie.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : undefined,
    aggregateRating:
      movie.vote_average && movie.vote_count
        ? {
            "@type": "AggregateRating",
            // Number, not string — Google's documented type for ratingValue
            ratingValue: Number(movie.vote_average.toFixed(1)),
            ratingCount: movie.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    genre: movie.genres?.map((g) => g.name),
    // AI-generated themes — unique-to-us keywords (genre is shared TMDB taxonomy)
    keywords: aiThemeKeywords(aiThemes),
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
    trailer: trailerVideoObject(movie.videos?.results, movie.title),
    sameAs: titleSameAs(movie.imdb_id),
    potentialAction: watchActions(movie.watch_options?.options),
  });

  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: "Movies", path: "/browse" },
    { name: movie.title },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
    </>
  );
}

// Async collection component - tries PostgreSQL first, falls back to TMDB
async function CollectionAsync({
  collectionId,
  currentMovieId,
}: {
  collectionId: number;
  currentMovieId: number;
}) {
  try {
    // Try PostgreSQL first
    const USE_POSTGRES = process.env.USE_POSTGRES_DATA === "true";
    let collection: Collection | null = null;

    if (USE_POSTGRES) {
      collection = await getCollectionFromPostgres(collectionId);
    }

    // Fallback to TMDB if not in PostgreSQL
    if (!collection) {
      const collectionData = await getMovieCollection(collectionId);
      if (!collectionData) return null;

      collection = {
        id: collectionData.id as number,
        name: collectionData.name as string,
        overview: collectionData.overview as string | undefined,
        poster_path: collectionData.poster_path as string | null,
        backdrop_path: collectionData.backdrop_path as string | null,
        parts: collectionData.parts as Collection["parts"],
      };
    }

    // Extract light collection to strip overview from parts (~2-15KB savings)
    // Note: JSX in try/catch is valid in RSC - it catches data fetch errors, not render errors
    /* eslint-disable react-hooks/error-boundaries */
    return (
      <CollectionSection
        collection={extractLightCollection(collection)}
        currentMovieId={currentMovieId}
        className="mt-8 md:mt-12"
      />
    );
    /* eslint-enable react-hooks/error-boundaries */
  } catch {
    return null;
  }
}

export default async function MoviePage({ params, searchParams }: MoviePageProps) {
  const { params: routeParams } = await params;

  // Dedicated discussions page branch (same catch-all, no dynamic APIs).
  const discussionsMovieId = parseMovieDiscussions(routeParams);
  if (discussionsMovieId !== null) return <MovieDiscussionsView movieId={discussionsMovieId} />;

  const movieId = routeParams[0];
  const id = parseInt(movieId, 10);

  if (isNaN(id)) {
    notFound();
  }

  // E2E test trigger: throw an error to test error boundary.
  // The NODE_ENV gate must wrap the `await searchParams` itself — unwrapping
  // searchParams opts the route out of ISR, so production must never touch it.
  if (process.env.NODE_ENV !== "production") {
    const { __e2e_error } = await searchParams;
    if (__e2e_error === "true") {
      throw new Error("E2E Test Error: Simulated error for error boundary testing");
    }
  }

  // Hero images render IMMEDIATELY - just needs the ID
  // CDN URLs are deterministic: /movie/{id}/backdrop.webp, /movie/{id}/logo.webp
  // Content loads via Suspense while images are already loading/visible
  // HeroMediaProvider enables shells to receive TMDB fallback data from async content
  return (
    <>
      <ImagePreloader movieId={id} />

      <HeroMediaProvider>
        <EnrichmentProvider mediaType="movie" mediaId={id}>
          <article className="pb-12">
            {/* Hero section - backdrop & logo render IMMEDIATELY with just ID
                Mobile: Image with aspect ratio, content below (centered)
                Desktop: Image fills container, content overlays at bottom */}
            <section className="relative">
              <div className="hero-container relative w-full overflow-hidden">
                {/* viewTransitionName opts this hero into the detail↔discussions
                    shared-element morph (matched on the discussions page's hero
                    band). Other HeroBackdropShell usages omit it → no morph. */}
                <HeroBackdropShell
                  mediaId={id}
                  mediaType="movie"
                  overlay="light"
                  viewTransitionName="hero-backdrop"
                >
                  {/* Content container
                      Mobile: centered, normal document flow (below image)
                      Desktop: fills the shell's overlay wrapper, bottom-anchored.
                      md:h-full (not md:absolute): when the shell collapses to its
                      compact no-backdrop layout, this must flow at natural height. */}
                  <div className="flex flex-col items-center text-center md:items-start md:text-left md:h-full md:flex md:flex-col md:justify-end md:px-8 lg:px-12">
                    {/* Logo renders immediately with just ID */}
                    <div className="mb-3 md:mb-6 lg:mb-8">
                      <HeroLogoShell
                        mediaId={id}
                        mediaType="movie"
                        viewTransitionName="hero-logo"
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
        </EnrichmentProvider>
      </HeroMediaProvider>
    </>
  );
}
