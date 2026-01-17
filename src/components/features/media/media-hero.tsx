import { cn } from "@/lib/utils";
import { MediaBackdrop } from "./media-backdrop";
import { HeroContent } from "./hero-content";
import type { Movie, Series } from "@/types";

interface MediaHeroProps {
  item: Movie | Series;
  mediaType: "movie" | "series";
  className?: string;
}

function isMovie(item: Movie | Series): item is Movie {
  return "title" in item;
}

/**
 * Hero section with backdrop image and core info (logo, genres, ratings, watch options).
 * Action buttons are now rendered separately via MediaActionBar.
 */
export function MediaHero({ item, mediaType, className }: MediaHeroProps) {
  const title = isMovie(item) ? item.title : item.name;
  const genres = item.genres || [];
  const tmdbLogoPath = item.images?.logos?.find((l) => l.iso_639_1 === "en")?.file_path;

  return (
    <section className={cn("relative", className)}>
      {/* Hero container with responsive height using CSS variables (defined in globals.css)
          Mobile: clamp(min, target, max) 
          Desktop (md+): clamp(min, target, max) with larger values */}
      <div className="hero-container relative w-full overflow-hidden">
        <MediaBackdrop
          item={item}
          mediaType={mediaType}
          overlay="light"
          className="absolute inset-0"
        />

        {/* Content overlay - positioned at bottom */}
        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-8 lg:px-12">
          <HeroContent
            itemId={item.id}
            title={title}
            mediaType={mediaType}
            genres={genres}
            ratings={item.ratings}
            voteAverage={item.vote_average}
            tmdbLogoPath={tmdbLogoPath}
            watchOptions={item.watch_options}
            item={item}
            priority
            className="pb-5 md:pb-6 lg:pb-8"
          />
        </div>
      </div>
    </section>
  );
}
