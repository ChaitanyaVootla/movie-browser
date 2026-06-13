import { Suspense, cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getSeries as getSeriesBase } from "@/server/actions/series";
import { seriesExists } from "@/server/services/media-exists";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import {
  breadcrumbList,
  trailerVideoObject,
  watchActions,
  titleSameAs,
  omitEmpty,
  aiThemeKeywords,
} from "@/lib/seo/jsonld";

// Deduplicate getSeries calls within the same request
// generateMetadata, HeroContentAsync, SeriesContentAsync all use the same cached result
const getSeries = cache(getSeriesBase);

// ISR: cache the rendered page for 1h (see movie page for rationale) — cuts SSR
// CPU under crawler/repeat traffic; live ratings still stream via SSE per load.
export const revalidate = 3600;

// REQUIRED for ISR: without generateStaticParams, a dynamic route is rendered
// per-request and `revalidate` above is a no-op (verified: no route-cache
// entries ever written). Empty array = prerender nothing at build time, but
// cache every on-demand render for the revalidate window (dynamicParams
// defaults to true).
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}
import { getAIData, aiDataResponseToSummary } from "@/server/services/ai-data-service";

// Same dedup for AI data — generateMetadata uses the hook/themes (unique SEO
// content) and both async sections render from it; one PG read per request.
const getAIDataCached = cache(getAIData);
import {
  MediaActionBar,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  SimilarSection,
  SimilarSectionSkeleton,
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
import { SeasonSelector, EpisodeInfoSection } from "@/components/features/series";
import {
  SeriesTrackingProvider,
  SeriesProgressPanel,
} from "@/components/features/tracking";
import NextLink from "next/link";
import { ReviewsSection } from "@/components/features/reviews";
import { DiscussionSection } from "@/components/features/discussion";
import {
  EpisodeDiscussPage,
  generateDiscussMetadata,
  parseDiscussParams,
} from "./discuss-page";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE, CDN_IMAGE_BASE } from "@/lib/constants";
import type { Series } from "@/types";
import {
  extractSeriesOverviewProps,
  extractWatchOptionsItem,
  extractTrailerData,
  extractLightVideos,
  extractLightGalleryImages,
  extractSeasonSelectorSeasons,
  extractLightEpisode,
  extractOverviewAISummary,
  extractOverviewAIInsights,
} from "@/types/client-props";

interface SeriesPageProps {
  params: Promise<{
    params: string[]; // [seriesId] or [seriesId, slug]
  }>;
  searchParams: Promise<{
    __e2e_error?: string; // Test-only: triggers error boundary for E2E testing
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { params: routeParams } = await params;

  // Per-episode discussion pages (Task 13) ride this catch-all (Next.js
  // forbids a sibling [seriesId] segment). Branch before the detail-page logic.
  const discuss = parseDiscussParams(routeParams);
  if (discuss) return generateDiscussMetadata(discuss);

  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

  // STATUS CODES NOW LIVE IN THE PROXY, NOT HERE — see the movie page's
  // generateMetadata for the full rationale. This route has loading.tsx, so
  // the throws below are a nearly-dead fallback for proxy-bypassing requests
  // (dev direct hits, tests, resolver fail-open); real 404/308s are emitted
  // pre-render by src/proxy.ts via src/server/proxy/media-resolver.ts.
  if (isNaN(id)) {
    notFound();
  }

  // AI data rides along (~5ms PG read, deduped with the page render below).
  const [series, aiData] = await Promise.all([getSeries(id), getAIDataCached(id, "series")]);

  if (!series) {
    // Fallback only (proxy already 404'd definitively-missing ids): treat a
    // transient fetch failure as a graceful 200 shell render.
    if (!(await seriesExists(id))) {
      notFound();
    }
    return { title: "Series Not Found" };
  }

  // Canonicalization fallback — the proxy 308s wrong/missing slugs before the
  // page runs; this only fires for proxy-bypassing requests (soft redirect).
  const canonicalPath = getMediaPath("series", series.id, series.name);
  if (`/series/${routeParams.join("/")}` !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  const year = series.first_air_date?.split("-")[0];
  const titleBase = year ? `${series.name} (${year})` : series.name;
  // "where to watch X" is the #1 query class for this site — bake the intent
  // into the SERP title unless the name itself is already long.
  const title =
    series.name.length <= 35
      ? `${titleBase} — Where to Watch, Ratings & Cast | ${SITE_NAME}`
      : `${titleBase} | ${SITE_NAME}`;
  const watchIntro = `Where to watch ${titleBase} — streaming options, ratings, cast & episodes.`;
  // Prefer the AI hook over the TMDB overview: every TMDB-based site serves
  // the identical overview text (duplicate SERP snippets); the hook is unique
  // to us. Fall back to the overview for un-enriched long-tail titles.
  const aiHook =
    typeof aiData?.hook === "string" && aiData.hook.trim().length > 0
      ? aiData.hook.trim()
      : null;
  const descriptionBody = aiHook ?? series.overview;
  const description = descriptionBody
    ? truncateAtWord(`${watchIntro} ${descriptionBody}`, 160)
    : watchIntro;
  const backdropUrl = series.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${series.backdrop_path}`
    : undefined;
  const posterUrl = series.poster_path ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}` : undefined;

  return {
    // absolute: opt out of the layout's "%s - Movie Browser" template — the
    // brand is already in the watch-intent title.
    title: { absolute: title },
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
      siteName: SITE_NAME,
      locale: "en_US",
      title: series.name,
      description,
      url: `${SITE_URL}${canonicalPath}`,
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
      title: titleBase,
      description,
      images: backdropUrl ? [backdropUrl] : posterUrl ? [posterUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}${canonicalPath}`,
    },
  };
}

// Preload CDN images for faster LCP
function ImagePreloader({ seriesId }: { seriesId: number }) {
  const backdropUrl = `${CDN_IMAGE_BASE}/series/${seriesId}/backdrop.webp`;
  const logoUrl = `${CDN_IMAGE_BASE}/series/${seriesId}/logo.webp`;

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

// Async hero content - fetches data and renders badges, genres, ratings, watch options, hook
async function HeroContentAsync({ seriesId }: { seriesId: number }) {
  // Fetch series and AI data in parallel
  const [series, aiData] = await Promise.all([
    getSeries(seriesId),
    getAIDataCached(seriesId, "series"),
  ]);
  if (!series) return null;

  // Convert to legacy format for components that still use it
  const aiSummary = aiData ? aiDataResponseToSummary(aiData) : null;

  const displayRatings = series.ratings?.length
    ? series.ratings
    : series.vote_average && series.vote_average > 0
      ? [{ name: "TMDB", rating: Math.round(series.vote_average * 10).toString() }]
      : [];

  // Get badges for detail page (show more than cards)
  const badges = getMediaBadges(series, { maxBadges: 3, context: "detail" });

  // Get English logo for fallback (prefer English, then first available)
  const englishLogo = series.images?.logos?.find((logo) => logo.iso_639_1 === "en");
  const logoPath = englishLogo?.file_path ?? series.images?.logos?.[0]?.file_path;

  return (
    <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 pb-2 md:pb-6 lg:pb-8 md:hero-content-width">
      {/* Provide TMDB fallback data to hero shells via context */}
      <HeroMediaUpdater
        tmdbBackdropPath={series.backdrop_path}
        tmdbLogoPath={logoPath}
        title={series.name}
      />

      {/* AI Hook - tagline above content (live-updated via SSE) */}
      <LiveAIHook initialHook={aiSummary?.hook ?? null} />

      {/* Status badges (trending, new season, currently airing, etc.) */}
      {badges.length > 0 && <DetailBadges badges={badges} className="drop-shadow-md" />}

      {/* Ratings (live-updated via SSE when Lambda scrapes fresh data) */}
      <LiveRatings
        initialRatings={displayRatings}
        size="md"
        maxVisible={5}
        mediaType="series"
        tmdbId={series.id}
      />

      {/* Refresh indicator — subtle pulsing dot when enrichment is in progress */}
      <EnrichmentRefreshIndicator />

      {/* Watch Options - using light item props to reduce RSC payload */}
      {series.watch_options?.options?.length ? (
        <WatchOptions
          watchOptions={series.watch_options}
          item={extractWatchOptionsItem(series, false)}
          isMovie={false}
        />
      ) : null}
    </div>
  );
}

// Async page content - action bar, seasons, overview, galleries, recommendations
async function SeriesContentAsync({ seriesId }: { seriesId: number }) {
  // Fetch series data and AI data in parallel
  const [series, aiData] = await Promise.all([
    getSeries(seriesId),
    getAIDataCached(seriesId, "series"),
  ]);
  if (!series) return null;

  // Convert to legacy format for components that still use it
  const aiSummary = aiData ? aiDataResponseToSummary(aiData) : null;

  // Filter YouTube videos and sort by priority (Trailer > Teaser > etc.) + date
  const youtubeVideos = sortVideos(
    series.videos?.results?.filter((v) => v.site === "YouTube") || []
  );
  const displaySeasons = series.seasons?.filter((s) => s.season_number >= 0) || [];

  return (
    <SeriesTrackingProvider seriesId={series.id}>
      {/* JSON-LD Schema */}
      {/* Single semantic H1 (visually hidden) — see movie page */}
      <h1 className="sr-only">
        {series.name}
        {series.first_air_date ? ` (${series.first_air_date.split("-")[0]})` : ""}
      </h1>

      <SeriesSchema series={series} aiThemes={aiData?.insights?.spoilerFree?.themes} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={series.id}
        isMovie={false}
        name={series.name}
        poster_path={series.poster_path}
        backdrop_path={series.backdrop_path}
      />

      {/* Update global media context for AI chat prompts */}
      <MediaContextUpdater
        mediaType="series"
        itemId={series.id}
        title={series.name}
        year={series.first_air_date?.split("-")[0]}
        rating={series.vote_average}
        voteCount={series.vote_count}
        genres={series.genres?.map((g) => g.name)}
        aiQuestions={aiSummary?.aiQuestions}
        postWatchQuestions={aiData?.insights?.spoilerContent?.questions}
        trivia={aiData?.insights?.spoilerContent?.deepDive
          ?.filter((d) => d.subcategory === "trivia" || d.subcategory === "insight")
          .map((d) => d.text)}
        seasonCount={series.number_of_seasons}
        status={series.status}
      />

      {/* Action buttons - Play Trailer, Watchlist, Like/Dislike, Share + QuickTake pills */}
      {/* Pass only trailer data instead of full videos array */}
      <MediaActionBar
        itemId={series.id}
        mediaType="series"
        title={series.name}
        trailer={extractTrailerData(series.videos)}
        quickTake={aiSummary?.quickTake}
        className="mt-2 md:mt-3"
      />

      {/* Series progress (client island — renders nothing in cached anon HTML) */}
      <SeriesProgressPanel
        seriesId={series.id}
        seasons={extractSeasonSelectorSeasons(displaySeasons)}
        className="mt-3"
      />

      {/* Season & Episode Selector - light seasons (no per-season overview/poster) */}
      {displaySeasons.length > 0 && (
        <SeasonSelector
          seriesId={series.id}
          seriesName={series.name}
          seasons={extractSeasonSelectorSeasons(displaySeasons)}
          className="mt-4 md:mt-6"
        />
      )}

      {/* Next/Last Episode Info - display fields only */}
      <EpisodeInfoSection
        nextEpisode={extractLightEpisode(series.next_episode_to_air)}
        lastEpisode={extractLightEpisode(series.last_episode_to_air)}
        seriesId={series.id}
        seriesName={series.name}
        className="mt-6 md:mt-8"
      />

      {/* Overview, cast, and details - using light props to reduce RSC payload by ~80% */}
      <MediaOverview
        item={extractSeriesOverviewProps(series)}
        mediaType="series"
        aiSummary={extractOverviewAISummary(aiSummary)}
        aiInsights={extractOverviewAIInsights(aiData?.insights)}
      />

      {/* AI Questions - clickable prompts that trigger AI chat */}
      {aiSummary?.aiQuestions && aiSummary.aiQuestions.length > 0 && (
        <AIQuestionsSection
          questions={aiSummary.aiQuestions}
          title={series.name}
          year={series.first_air_date?.split("-")[0]}
          tmdbId={series.id}
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
            mediaId={series.id}
          />
        )}

      {/* Live AI sections — when server had no AI data, SSE delivers it with fade-in */}
      {!aiData && (
        <LiveAISections
          title={series.name}
          year={series.first_air_date?.split("-")[0]}
          tmdbId={series.id}
        />
      )}

      {/* Video Gallery - field-picked to declared Video shape */}
      {youtubeVideos.length > 0 && (
        <VideoGallery
          videos={extractLightVideos(youtubeVideos, 20)}
          mediaId={series.id}
          mediaType="series"
          className="mt-8 md:mt-12"
        />
      )}

      {/* Image Gallery - light images (drops iso_639_1/vote_average) */}
      {series.images?.backdrops && series.images.backdrops.length > 0 && (
        <ImageGallery
          images={extractLightGalleryImages(series.images.backdrops, 20)}
          title="Gallery"
          className="mt-8 md:mt-12"
        />
      )}

      {/* User reviews (published+public only in cached HTML; own review hydrates client-side) */}
      <ReviewsSection
        mediaType="series"
        tmdbId={series.id}
        title={series.name}
        className="mt-8 md:mt-12"
      />

      {/* Similar - AI-powered embedding similarity with TMDB fallback */}
      <Suspense fallback={<SimilarSectionSkeleton />}>
        <SimilarSection
          itemId={series.id}
          mediaType="series"
          tmdbRecommendations={series.recommendations?.results?.slice(0, 15)}
          tmdbSimilar={series.similar?.results?.slice(0, 15)}
          className="mt-8 md:mt-12"
        />
      </Suspense>

      {/* Discussion — series-level anchor; links to per-episode threads.
          Anon tier + locked teaser are ISR-safe; gated tier hydrates client-side. */}
      <Suspense fallback={null}>
        <DiscussionSection
          anchor={{ type: "series", seriesId: series.id, seasonNumber: null, episodeNumber: null }}
          starters={(aiSummary?.aiQuestions ?? []).slice(0, 4)}
          className="mt-8 md:mt-12"
        >
          <EpisodeThreadsLink seriesId={series.id} seriesName={series.name} />
        </DiscussionSection>
      </Suspense>
    </SeriesTrackingProvider>
  );
}

function EpisodeThreadsLink({
  seriesId,
  seriesName,
}: {
  seriesId: number;
  seriesName: string;
}) {
  return (
    <NextLink
      href={`${getMediaPath("series", seriesId, seriesName)}/discuss/s1e1`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10"
    >
      Browse per-episode discussions →
    </NextLink>
  );
}

// JSON-LD structured data for SEO
function SeriesSchema({ series, aiThemes }: { series: Series; aiThemes?: string[] }) {
  // TMDB "created_by" maps to crew job "Creator"; fall back to created_by-less
  const creators = series.credits?.crew?.filter((c) => c.job === "Creator") || [];
  const actors = series.credits?.cast?.slice(0, 5) || [];
  const canonicalPath = getMediaPath("series", series.id, series.name);
  // Exclude season 0 ("Specials"): its inflated episode counts made
  // numberOfEpisodes contradict the containsSeason sum (e.g. The Boys 40 vs 115)
  const regularSeasons = series.seasons?.filter((s) => s.season_number > 0);

  const schema = omitEmpty({
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.name,
    url: `${SITE_URL}${canonicalPath}`,
    description: series.overview,
    datePublished: series.first_air_date,
    image: series.poster_path ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}` : undefined,
    aggregateRating:
      series.vote_average && series.vote_count
        ? {
            "@type": "AggregateRating",
            // Number, not string — Google's documented type for ratingValue
            ratingValue: Number(series.vote_average.toFixed(1)),
            ratingCount: series.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    genre: series.genres?.map((g) => g.name),
    // AI-generated themes — unique-to-us keywords (genre is shared TMDB taxonomy)
    keywords: aiThemeKeywords(aiThemes),
    numberOfSeasons: regularSeasons?.length || series.number_of_seasons,
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
    containsSeason: regularSeasons?.map((s) => ({
      "@type": "TVSeason",
      seasonNumber: s.season_number,
      numberOfEpisodes: s.episode_count,
      name: s.name,
    })),
    trailer: trailerVideoObject(series.videos?.results, series.name),
    sameAs: titleSameAs(series.external_ids?.imdb_id),
    potentialAction: watchActions(series.watch_options?.options),
  });

  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: "TV Series", path: "/browse" },
    { name: series.name },
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

export default async function SeriesPage({ params, searchParams }: SeriesPageProps) {
  const { params: routeParams } = await params;

  // Per-episode discussion branch (Task 13) — same catch-all, no dynamic APIs.
  const discuss = parseDiscussParams(routeParams);
  if (discuss) return <EpisodeDiscussPage params={discuss} />;

  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

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
  // CDN URLs are deterministic: /series/{id}/backdrop.webp, /series/{id}/logo.webp
  // Content loads via Suspense while images are already loading/visible
  // HeroMediaProvider enables shells to receive TMDB fallback data from async content
  return (
    <>
      <ImagePreloader seriesId={id} />

      <HeroMediaProvider>
        <EnrichmentProvider mediaType="series" mediaId={id}>
          <article className="pb-12">
            {/* Hero section - backdrop & logo render IMMEDIATELY with just ID
                Mobile: Image with aspect ratio, content below (centered)
                Desktop: Image fills container, content overlays at bottom */}
            <section className="relative">
              <div className="hero-container relative w-full overflow-hidden">
                <HeroBackdropShell mediaId={id} mediaType="series" overlay="light">
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
                        mediaType="series"
                        className="max-w-[260px] sm:max-w-[320px] md:max-w-[500px] lg:max-w-[600px] max-h-[80px] sm:max-h-[100px] md:max-h-[160px] lg:max-h-[180px]"
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
        </EnrichmentProvider>
      </HeroMediaProvider>
    </>
  );
}
