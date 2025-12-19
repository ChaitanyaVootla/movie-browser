"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock, Star, Users, ChevronLeft, ChevronRight, X, Film, Clapperboard } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getEpisode } from "@/server/actions/series";
import type { Episode, CastMember, EpisodeStill } from "@/types";

interface EpisodeSheetProps {
  episode: Episode | null;
  seriesId: number;
  seriesName: string;
  seasonNumber: number;
  onClose: () => void;
}

function getSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Guest star card with profile image
function GuestStarCard({ guest }: { guest: CastMember }) {
  const href = `/person/${guest.id}/${getSlug(guest.name)}`;

  return (
    <Link href={href} className="flex-shrink-0 group">
      <div className="w-[90px] text-center">
        <div className="relative w-[70px] h-[70px] mx-auto rounded-full overflow-hidden bg-muted mb-2 ring-1 ring-white/10 group-hover:ring-brand/50 transition-all">
          {guest.profile_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w185${guest.profile_path}`}
              alt={guest.name}
              fill
              className="object-cover"
              sizes="70px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <p className="text-xs font-medium line-clamp-1 group-hover:text-brand transition-colors">
          {guest.name}
        </p>
        <p className="text-[10px] text-muted-foreground line-clamp-1">{guest.character}</p>
      </div>
    </Link>
  );
}

// Image gallery with navigation
function EpisodeImageGallery({ stills, episodeName }: { stills: EpisodeStill[]; episodeName: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? stills.length - 1 : prev - 1));
  }, [stills.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === stills.length - 1 ? 0 : prev + 1));
  }, [stills.length]);

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "Escape") setIsLightboxOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, goToPrevious, goToNext]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

  if (!stills.length) return null;

  const currentStill = stills[currentIndex];

  return (
    <>
      {/* Main image display */}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-muted group">
        <Image
          src={`https://image.tmdb.org/t/p/w780${currentStill.file_path}`}
          alt={`${episodeName} still ${currentIndex + 1}`}
          fill
          className="object-cover cursor-pointer"
          sizes="(max-width: 640px) 100vw, 600px"
          priority
          onClick={() => setIsLightboxOpen(true)}
        />
        
        {/* Navigation arrows */}
        {stills.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Image counter */}
        {stills.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {stills.length}
          </div>
        )}

        {/* Click to expand hint */}
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </div>
      </div>

      {/* Thumbnail strip */}
      {stills.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
          {stills.slice(0, 8).map((still, idx) => (
            <button
              key={still.file_path}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                "flex-shrink-0 w-16 h-10 rounded overflow-hidden ring-2 transition-all",
                idx === currentIndex
                  ? "ring-brand"
                  : "ring-transparent hover:ring-white/30"
              )}
            >
              <Image
                src={`https://image.tmdb.org/t/p/w185${still.file_path}`}
                alt={`Still ${idx + 1}`}
                width={64}
                height={40}
                className="object-cover w-full h-full"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white h-10 w-10"
            onClick={() => setIsLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {stills.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12"
                onClick={goToNext}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- Intentional: lightbox needs native img for full-res external TMDB images */}
          <img
            src={`https://image.tmdb.org/t/p/original${currentStill.file_path}`}
            alt={`${episodeName} still ${currentIndex + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />

          {stills.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1.5 rounded-full">
              {currentIndex + 1} / {stills.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Loading skeleton for episode details
function EpisodeDetailsSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="px-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function EpisodeSheet({
  episode,
  seriesId,
  seriesName,
  seasonNumber,
  onClose,
}: EpisodeSheetProps) {
  const [fullEpisode, setFullEpisode] = useState<Episode | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load full episode details when episode changes
  // Note: We intentionally reset fullEpisode to null to show loading state
  // when switching episodes. isPending from useTransition handles the UI loading state.
  useEffect(() => {
    if (episode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset for loading state when episode changes
      setFullEpisode(null);
      startTransition(async () => {
        const data = await getEpisode(seriesId, seasonNumber, episode.episode_number);
        if (data) {
          setFullEpisode(data);
        }
      });
    }
  }, [episode, seriesId, seasonNumber]);

  if (!episode) return null;

  // Use full episode data if available, otherwise fall back to basic
  const displayEpisode = fullEpisode || episode;
  
  const airDate = displayEpisode.air_date
    ? new Date(displayEpisode.air_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const isUpcoming = displayEpisode.air_date && new Date(displayEpisode.air_date) > new Date();
  
  // Get crew info
  const director = displayEpisode.crew?.find((c) => c.job === "Director");
  const writers = displayEpisode.crew?.filter(
    (c) => c.department === "Writing" || c.job === "Writer" || c.job === "Story"
  ) || [];

  // Episode stills from images or single still_path
  const stills: EpisodeStill[] = fullEpisode?.images?.stills || 
    (displayEpisode.still_path
      ? [{
          file_path: displayEpisode.still_path,
          aspect_ratio: 1.78,
          width: 1280,
          height: 720,
          vote_average: 0,
          vote_count: 0,
        }]
      : []);

  const guestStars = displayEpisode.guest_stars?.slice(0, 12) || [];

  return (
    <Sheet open={!!episode} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 overflow-hidden">
        <ScrollArea className="h-full">
          {isPending && !fullEpisode ? (
            <EpisodeDetailsSkeleton />
          ) : (
            <div className="space-y-6 pb-8">
              {/* Episode images gallery */}
              {stills.length > 0 && (
                <div className="relative">
                  <EpisodeImageGallery stills={stills} episodeName={displayEpisode.name} />
                  
                  {/* Rating overlay on main image area */}
                  {displayEpisode.vote_average > 0 && !isUpcoming && (
                    <Badge
                      variant="secondary"
                      className="absolute top-4 right-4 bg-black/70 text-white border-0 gap-1 z-10"
                    >
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {displayEpisode.vote_average.toFixed(1)}
                    </Badge>
                  )}
                  {isUpcoming && (
                    <Badge
                      variant="secondary"
                      className="absolute top-4 left-4 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 z-10"
                    >
                      Upcoming
                    </Badge>
                  )}
                </div>
              )}

              <div className="px-6 space-y-6">
                {/* Header */}
                <SheetHeader className="text-left space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {seriesName} • Season {seasonNumber}, Episode {displayEpisode.episode_number}
                    </p>
                    <SheetTitle className="text-xl md:text-2xl pr-8">{displayEpisode.name}</SheetTitle>
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {airDate && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        <span>{airDate}</span>
                      </div>
                    )}
                    {displayEpisode.runtime && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>{displayEpisode.runtime} min</span>
                      </div>
                    )}
                  </div>
                </SheetHeader>

                {/* Overview */}
                {displayEpisode.overview && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Film className="h-4 w-4 text-muted-foreground" />
                      Overview
                    </h3>
                    <SheetDescription className="text-sm text-muted-foreground leading-relaxed">
                      {displayEpisode.overview}
                    </SheetDescription>
                  </div>
                )}

                {/* Crew info */}
                {(director || writers.length > 0) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Clapperboard className="h-4 w-4 text-muted-foreground" />
                        Crew
                      </h3>
                      <div className="space-y-2">
                        {director && (
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm text-muted-foreground min-w-[80px]">Directed by</span>
                            <Link
                              href={`/person/${director.id}/${getSlug(director.name)}`}
                              className="text-sm font-medium hover:text-brand transition-colors"
                            >
                              {director.name}
                            </Link>
                          </div>
                        )}
                        {writers.length > 0 && (
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm text-muted-foreground min-w-[80px]">Written by</span>
                            <span className="text-sm font-medium">
                              {writers
                                .slice(0, 3)
                                .map((w) => w.name)
                                .join(", ")}
                              {writers.length > 3 && ` +${writers.length - 3} more`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Guest Stars */}
                {guestStars.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Guest Stars</h3>
                        <Badge variant="secondary" className="text-[10px] ml-auto">
                          {displayEpisode.guest_stars?.length || guestStars.length} guests
                        </Badge>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
                        {guestStars.map((guest) => (
                          <GuestStarCard key={guest.id} guest={guest} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
