import { Film, Tv, CalendarDays } from "lucide-react";
import { getTrending, getUpcoming } from "@/server/actions/trending";
import { HeroCarousel } from "@/components/features/movie/hero-carousel";
import { MovieCarousel } from "@/components/features/movie/movie-carousel";
import { UpcomingCarousel } from "@/components/features/movie/upcoming-carousel";
import { PersonalizedSections } from "@/components/features/home";
import { buildBrowseUrl } from "@/lib/discover";

export default async function HomePage() {
  // Fetch trending and upcoming data in parallel
  const [trending, upcoming] = await Promise.all([
    getTrending(),
    getUpcoming(),
  ]);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      {trending.allItems.length > 0 && (
        <HeroCarousel
          items={trending.allItems}
          heroEnhancedData={trending.heroEnhancedData}
          className="mb-8"
        />
      )}

      {/* Content Sections */}
      <div className="px-4 md:px-8 lg:px-12 pb-16 space-y-12">
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

        {/* Personalized Sections (Continue Watching, Recents) - Client Component */}
        <PersonalizedSections />
      </div>
    </div>
  );
}
