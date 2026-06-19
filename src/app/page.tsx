import { Film, Tv, CalendarDays, Clapperboard, Play } from "lucide-react";

// ISR: Revalidate every 4 hours (matches trending/discover cache TTL)
// Personalized sections (ContinueWatching, Recents) are client components and unaffected
export const revalidate = 14400;
import {
  getTrending,
  getUpcoming,
  getNowPlaying,
  getTrendingTrailers,
  getYouTubeTrendingTrailers,
} from "@/server/actions/trending";
import { discoverBatch } from "@/server/actions/discover";
import { getPublishedCommentCountsForType } from "@/server/db/postgres/comments";
import { HeroCarousel } from "@/components/features/movie/hero-carousel";
import { MovieCarousel } from "@/components/features/movie/movie-carousel";
import { UpcomingCarousel } from "@/components/features/movie/upcoming-carousel";
import {
  ContinueWatchingSection,
  RecentVisitsSection,
  TopicPills,
  MoodCards,
  TopicScroller,
  TrailerCarousel,
  YouTubeTrailerCarousel,
  UpNextSection,
} from "@/components/features/home";
import { buildBrowseUrl } from "@/lib/discover";
import { getPopularTopics, getTopicByKey } from "@/lib/topics";

/**
 * Pick N items from an array using a stable day-based rotation.
 * This ensures the same topics are shown for the entire day, enabling effective caching.
 * Topics rotate daily to keep the homepage fresh.
 */
function stablePickForDay<T>(arr: T[], count: number): T[] {
  // Use day of year as a stable seed (changes once per day)
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));

  // Rotate the starting index based on day of year
  const startIndex = dayOfYear % arr.length;

  // Pick items starting from the rotated index, wrapping around
  const result: T[] = [];
  for (let i = 0; i < count && i < arr.length; i++) {
    result.push(arr[(startIndex + i) % arr.length]);
  }
  return result;
}

// Topic configuration for scrollers
const TOPIC_SCROLLER_KEYS = [
  "genre-action-movie",
  "genre-comedy-movie",
  "genre-horror-movie",
  "theme-superhero-movie",
  "genre-drama-tv",
  "genre-sci-fi-fantasy-tv",
];

export default async function HomePage() {
  // Get stable topics for scrollers (pick 3, rotates daily for cacheability)
  const selectedTopicKeys = stablePickForDay(TOPIC_SCROLLER_KEYS, 3);
  const selectedTopics = selectedTopicKeys
    .map((key) => getTopicByKey(key))
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Kick off all fetches that do NOT depend on trending data immediately, so they
  // run concurrently with getTrending() instead of waiting for it to resolve.
  // Only getTrendingTrailers reuses trending.movies, so it alone must await trending.
  const trendingPromise = getTrending();
  const upcomingPromise = getUpcoming();
  const nowPlayingPromise = getNowPlaying();
  const youtubeTrailersPromise = getYouTubeTrendingTrailers(12);
  const topicPromises = selectedTopics.map((topic) =>
    discoverBatch(
      {
        media_type: topic.filterParams.media_type || "movie", // Ensure media_type is set
        ...topic.filterParams,
        sort_by: "popularity.desc",
        "vote_average.gte": 6,
        "vote_count.gte": 100,
      },
      1 // Single page for scrollers
    )
  );

  // Await trending once, then start the only trending-dependent fetch (trailers reuse
  // trending.movies to avoid a duplicate TMDB call). Everything else is already in flight.
  const trending = await trendingPromise;
  const trendingTrailersPromise = getTrendingTrailers(10, trending.movies);
  // Batched published-comment counts for the trending cards (Phase C social
  // proof). Viewer-agnostic + ISR-cached; the badge self-hides below threshold.
  const commentCountsPromise = Promise.all([
    getPublishedCommentCountsForType(
      "movie",
      trending.movies.map((m) => m.id)
    ),
    getPublishedCommentCountsForType(
      "series",
      trending.tv.map((s) => s.id)
    ),
  ]).catch(() => [{}, {}] as [Record<number, number>, Record<number, number>]);

  // Join all the in-flight work.
  const [upcoming, nowPlaying, youtubeTrailers, trendingTrailers, topicResults, commentCounts] =
    await Promise.all([
      upcomingPromise,
      nowPlayingPromise,
      youtubeTrailersPromise,
      trendingTrailersPromise,
      Promise.all(topicPromises),
      commentCountsPromise,
    ]);
  const [movieCommentCounts, seriesCommentCounts] = commentCounts;

  // Prepare topic scroller data
  const topicScrollers = selectedTopics.map((topic, index) => ({
    topic,
    results: topicResults[index]?.results || [],
  }));

  // Get all popular topics for pills
  const popularTopics = getPopularTopics();

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Movie Browser",
    url: "https://themoviebrowser.com",
    description:
      "Track, discover and find where to watch TV shows and movies. Browse trending content, create watchlists, and get personalized recommendations.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://themoviebrowser.com/browse?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {/* Hero Section */}
      {trending.allItems.length > 0 && (
        <HeroCarousel
          items={trending.allItems}
          heroEnhancedData={trending.heroEnhancedData}
          className="mb-6"
        />
      )}

      {/* Single semantic H1 for SEO (visually hidden — the hero carousel is the
          visual headline). Gives crawlers a clear page topic. */}
      <h1 className="sr-only">
        The Movie Browser — Discover trending movies and TV shows
      </h1>

      {/* Content Sections */}
      <div className="px-4 md:px-8 lg:px-12 pb-16 space-y-10">
        {/* Continue Watching - Top priority for logged-in users */}
        <ContinueWatchingSection />

        {/* Up Next - next unwatched episodes (client island, per-user) */}
        <UpNextSection />

        {/* Topic Pills for Quick Navigation */}
        <TopicPills topics={popularTopics} />

        {/* Viral Trailers (YouTube-based, sorted by views) - primary */}
        {/* Falls back to TMDB-based New Trailers if YouTube quota exceeded */}
        {youtubeTrailers.length > 0 ? (
          <YouTubeTrailerCarousel
            title="Trending Trailers"
            trailers={youtubeTrailers}
            icon={<Play className="h-5 w-5 text-red-500" />}
          />
        ) : trendingTrailers.length > 0 ? (
          <TrailerCarousel
            title="Trending Trailers"
            trailers={trendingTrailers}
            icon={<Play className="h-5 w-5 text-red-500" />}
          />
        ) : null}

        {/* Trending Movies */}
        <MovieCarousel
          title="Trending Movies"
          items={trending.movies}
          icon={<Film className="h-5 w-5 text-brand" />}
          seeAllHref={buildBrowseUrl({ media_type: "movie", sort_by: "popularity.desc" })}
          seeAllLabel="Browse All"
          commentCounts={movieCommentCounts}
        />

        {/* Trending TV Shows */}
        <MovieCarousel
          title="Trending TV Shows"
          items={trending.tv}
          icon={<Tv className="h-5 w-5 text-brand" />}
          seeAllHref={buildBrowseUrl({ media_type: "tv", sort_by: "popularity.desc" })}
          seeAllLabel="Browse All"
          commentCounts={seriesCommentCounts}
        />

        {/* Recent Visits - After trending sections for logged-in users */}
        <RecentVisitsSection />

        {/* Mood-Based Discovery Cards */}
        <MoodCards />

        {/* Now Playing in Theaters */}
        {nowPlaying.length > 0 && (
          <MovieCarousel
            title="In Theaters Now"
            items={nowPlaying}
            icon={<Clapperboard className="h-5 w-5 text-brand" />}
            // Server Component - Date.now() is evaluated once on server, not during re-renders
            /* eslint-disable react-hooks/purity */
            seeAllHref={buildBrowseUrl({
              media_type: "movie",
              sort_by: "popularity.desc",
              "primary_release_date.lte": new Date().toISOString().split("T")[0],
              "primary_release_date.gte": new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0], // Last 60 days
            })}
            /* eslint-enable react-hooks/purity */
            seeAllLabel="Browse All"
          />
        )}

        {/* Topic Scrollers (Randomized, with watched/disliked filtering for logged-in users) */}
        {topicScrollers.map(
          ({ topic, results }) =>
            results.length > 0 && (
              <TopicScroller
                key={topic.key}
                title={topic.name}
                items={results}
                seeAllHref={`/topics/${topic.key}`}
                seeAllLabel="View All"
                filterWatched
                filterDisliked
              />
            )
        )}

        {/* Coming Soon - Upcoming Movies sorted by release date */}
        {upcoming.length > 0 && (
          <UpcomingCarousel
            title="Coming Soon"
            items={upcoming}
            icon={<CalendarDays className="h-5 w-5 text-brand" />}
            seeAllHref={buildBrowseUrl({
              media_type: "movie",
              sort_by: "primary_release_date.asc",
              "primary_release_date.gte": new Date().toISOString().split("T")[0],
            })}
            seeAllLabel="Browse All"
          />
        )}
      </div>
    </div>
  );
}
