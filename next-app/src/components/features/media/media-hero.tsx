"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MediaBackdrop, TrailerOverlay } from "./media-backdrop";
import { HeroContent } from "./hero-content";
import { MediaActions } from "./media-actions";
import type { Movie, Series, Video } from "@/types";

interface MediaHeroProps {
  item: Movie | Series;
  mediaType: "movie" | "series";
  className?: string;
}

function isMovie(item: Movie | Series): item is Movie {
  return "title" in item;
}

// Get trailer from videos
function getTrailer(videos?: { results: Video[] }): Video | null {
  if (!videos?.results?.length) return null;

  const officialTrailer = videos.results.find(
    (v) => v.type === "Trailer" && v.official && v.site === "YouTube"
  );
  if (officialTrailer) return officialTrailer;

  const anyTrailer = videos.results.find((v) => v.type === "Trailer" && v.site === "YouTube");
  if (anyTrailer) return anyTrailer;

  const teaser = videos.results.find((v) => v.type === "Teaser" && v.site === "YouTube");
  if (teaser) return teaser;

  return videos.results.find((v) => v.site === "YouTube") || null;
}

export function MediaHero({ item, mediaType, className }: MediaHeroProps) {
  const [showTrailer, setShowTrailer] = useState(false);

  const title = isMovie(item) ? item.title : item.name;
  const year = isMovie(item)
    ? item.release_date?.split("-")[0]
    : item.first_air_date?.split("-")[0];
  const runtime = isMovie(item) ? item.runtime : item.episode_run_time?.[0];
  const numberOfSeasons = !isMovie(item) ? item.number_of_seasons : undefined;

  const genres = item.genres || [];
  const trailer = getTrailer(item.videos);
  const tmdbLogoPath = item.images?.logos?.find((l) => l.iso_639_1 === "en")?.file_path;

  return (
    <section className={cn("relative", className)}>
      <MediaBackdrop
        item={item}
        mediaType={mediaType}
        overlay="light"
        className="min-h-[50vh] md:min-h-[55vh] lg:min-h-[60vh]"
      >
        {/* Full-width content container */}
        <div className="px-4 md:px-8 lg:px-12 h-full min-h-[50vh] md:min-h-[55vh] lg:min-h-[60vh] flex items-end">
          <HeroContent
            itemId={item.id}
            title={title}
            mediaType={mediaType}
            year={year}
            runtime={runtime}
            numberOfSeasons={numberOfSeasons}
            genres={genres}
            ratings={item.ratings}
            voteAverage={item.vote_average}
            tmdbLogoPath={tmdbLogoPath}
            priority
            className="pb-8 md:pb-10 lg:pb-12"
            actions={
              <MediaActions
                itemId={item.id}
                mediaType={mediaType}
                title={title}
                hasTrailer={!!trailer}
                onPlayTrailer={() => setShowTrailer(true)}
              />
            }
          />
        </div>
      </MediaBackdrop>

      {/* Trailer Overlay */}
      {trailer && (
        <TrailerOverlay
          videoKey={trailer.key}
          isVisible={showTrailer}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </section>
  );
}
