import { Film, Tv } from "lucide-react";
import { getTrending } from "@/server/actions/trending";
import { HeroCarousel } from "@/components/features/movie/hero-carousel";
import { MovieCarousel } from "@/components/features/movie/movie-carousel";
import { PersonalizedSections } from "@/components/features/home";
import { buildBrowseUrl } from "@/lib/discover";

export default async function HomePage() {
  const trending = await getTrending();

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

        {/* Personalized Sections (Continue Watching, Recents) - Client Component */}
        <PersonalizedSections />
      </div>
    </div>
  );
}
