import { Film, Tv, CalendarDays, Clapperboard, Play } from "lucide-react";
import { getTrending, getUpcoming, getNowPlaying, getTrendingTrailers, getYouTubeTrendingTrailers } from "@/server/actions/trending";
import { discoverBatch } from "@/server/actions/discover";
import { HeroCarousel } from "@/components/features/movie/hero-carousel";
import { MovieCarousel } from "@/components/features/movie/movie-carousel";
import { UpcomingCarousel } from "@/components/features/movie/upcoming-carousel";
import { ContinueWatchingSection, RecentVisitsSection, TopicPills, MoodCards, TopicScroller, TrailerCarousel, YouTubeTrailerCarousel } from "@/components/features/home";
import { buildBrowseUrl } from "@/lib/discover";
import { getPopularTopics, getTopicByKey } from "@/lib/topics";

// Randomize and pick N items from an array
function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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
  // Get random topics for scrollers (pick 3)
  const selectedTopicKeys = shuffleAndPick(TOPIC_SCROLLER_KEYS, 3);
  const selectedTopics = selectedTopicKeys
    .map((key) => getTopicByKey(key))
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Fetch all data in parallel
  const [trending, upcoming, nowPlaying, trendingTrailers, youtubeTrailers, ...topicResults] = await Promise.all([
    getTrending(),
    getUpcoming(),
    getNowPlaying(),
    getTrendingTrailers(10),
    getYouTubeTrendingTrailers(12),
    // Fetch topic scrollers
    ...selectedTopics.map((topic) =>
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
    ),
  ]);

  // Prepare topic scroller data
  const topicScrollers = selectedTopics.map((topic, index) => ({
    topic,
    results: topicResults[index]?.results || [],
  }));

  // Get all popular topics for pills
  const popularTopics = getPopularTopics();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      {trending.allItems.length > 0 && (
        <HeroCarousel
          items={trending.allItems}
          heroEnhancedData={trending.heroEnhancedData}
          className="mb-6"
        />
      )}

      {/* Content Sections */}
      <div className="px-4 md:px-8 lg:px-12 pb-16 space-y-10">
        {/* Continue Watching - Top priority for logged-in users */}
        <ContinueWatchingSection />

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
        />

        {/* Trending TV Shows */}
        <MovieCarousel
          title="Trending TV Shows"
          items={trending.tv}
          icon={<Tv className="h-5 w-5 text-brand" />}
          seeAllHref={buildBrowseUrl({ media_type: "tv", sort_by: "popularity.desc" })}
          seeAllLabel="Browse All"
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
            seeAllHref={buildBrowseUrl({
              media_type: "movie",
              sort_by: "popularity.desc",
              "primary_release_date.lte": new Date().toISOString().split("T")[0],
              "primary_release_date.gte": new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0], // Last 60 days
            })}
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
