"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Star,
  Users,
  X,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Tv,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getEpisode } from "@/server/actions/series";
import type { Episode, CastMember, CrewMember, EpisodeStill } from "@/types";

interface EpisodeModalProps {
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

// Person card for horizontal scroller
function PersonCard({
  person,
  role,
}: {
  person: CastMember | CrewMember;
  role: "cast" | "crew";
}) {
  const href = `/person/${person.id}/${getSlug(person.name)}`;
  const displayRole =
    role === "cast"
      ? (person as CastMember).character
      : (person as CrewMember).job;

  return (
    <Link href={href} className="flex-shrink-0 group">
      <div className="w-[100px] text-center">
        <div className="relative w-[72px] h-[72px] mx-auto rounded-full overflow-hidden bg-muted mb-2 ring-1 ring-white/10 group-hover:ring-brand/50 transition-all">
          {person.profile_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
              alt={person.name}
              fill
              className="object-cover"
              sizes="72px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <p className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
          {person.name}
        </p>
        {displayRole && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {displayRole}
          </p>
        )}
      </div>
    </Link>
  );
}

// Image carousel with 16:9 aspect ratio
function EpisodeImageCarousel({
  stills,
  episodeName,
}: {
  stills: EpisodeStill[];
  episodeName: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const slideDuration = 5000;

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? stills.length - 1 : prev - 1));
  }, [stills.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === stills.length - 1 ? 0 : prev + 1));
  }, [stills.length]);

  useEffect(() => {
    if (!isAutoPlaying || stills.length <= 1 || isLightboxOpen) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % stills.length);
    }, slideDuration);
    return () => clearInterval(interval);
  }, [isAutoPlaying, stills.length, isLightboxOpen]);

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
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted group cursor-pointer"
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
        onClick={() => setIsLightboxOpen(true)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <Image
              src={`https://image.tmdb.org/t/p/w1280${currentStill.file_path}`}
              alt={`${episodeName} still ${currentIndex + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 60vw"
              priority={currentIndex === 0}
            />
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        {stills.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Progress dots */}
        {stills.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {stills.slice(0, 6).map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  idx === currentIndex
                    ? "bg-white w-4"
                    : "bg-white/50 hover:bg-white/70"
                )}
              />
            ))}
          </div>
        )}

        {/* Counter badge */}
        {stills.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
            {currentIndex + 1}/{stills.length}
          </div>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onClick={() => setIsLightboxOpen(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white h-10 w-10 rounded-full"
            onClick={() => setIsLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {stills.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://image.tmdb.org/t/p/original${currentStill.file_path}`}
            alt={`${episodeName} still ${currentIndex + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
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

// Info card component
function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// Loading skeleton
function EpisodeDetailsSkeleton() {
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function EpisodeModal({
  episode,
  seriesId,
  seriesName,
  seasonNumber,
  onClose,
}: EpisodeModalProps) {
  const [fullEpisode, setFullEpisode] = useState<Episode | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (episode) {
      setFullEpisode(null);
      startTransition(async () => {
        const data = await getEpisode(
          seriesId,
          seasonNumber,
          episode.episode_number
        );
        if (data) {
          setFullEpisode(data);
        }
      });
    }
  }, [episode, seriesId, seasonNumber]);

  if (!episode) return null;

  const displayEpisode = fullEpisode || episode;

  const airDate = displayEpisode.air_date
    ? new Date(displayEpisode.air_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const isUpcoming =
    displayEpisode.air_date && new Date(displayEpisode.air_date) > new Date();

  // Crew
  const director = displayEpisode.crew?.find((c) => c.job === "Director");
  const writers =
    displayEpisode.crew?.filter(
      (c) =>
        c.department === "Writing" || c.job === "Writer" || c.job === "Story"
    ) || [];

  // Episode stills
  const stills: EpisodeStill[] =
    fullEpisode?.images?.stills ||
    (displayEpisode.still_path
      ? [
          {
            file_path: displayEpisode.still_path,
            aspect_ratio: 1.78,
            width: 1280,
            height: 720,
            vote_average: 0,
            vote_count: 0,
          },
        ]
      : []);

  const guestStars = displayEpisode.guest_stars || [];
  const additionalCrew =
    displayEpisode.crew?.filter(
      (c) =>
        c.job !== "Director" &&
        c.department !== "Writing" &&
        c.job !== "Writer" &&
        c.job !== "Story"
    ) || [];

  return (
    <Dialog open={!!episode} onOpenChange={() => onClose()}>
      <DialogContent
        className="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-5xl w-full p-0 overflow-hidden max-h-[90vh] gap-0"
        showCloseButton={false}
      >
        <ScrollArea className="max-h-[90vh]">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-30 rounded-full h-8 w-8 bg-background/80 hover:bg-background text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          {isPending && !fullEpisode ? (
            <EpisodeDetailsSkeleton />
          ) : (
            <div className="p-5 space-y-5">
              {/* Top section: Image + Info cards */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Left: Image carousel */}
                <div className="lg:col-span-3">
                  {stills.length > 0 ? (
                    <EpisodeImageCarousel
                      stills={stills}
                      episodeName={displayEpisode.name}
                    />
                  ) : (
                    <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                      <Tv className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Right: Title + Info cards */}
                <div className="lg:col-span-2 flex flex-col">
                  {/* Header */}
                  <DialogHeader className="text-left space-y-1 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        S{seasonNumber} E{displayEpisode.episode_number}
                      </Badge>
                      {isUpcoming && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-muted text-muted-foreground"
                        >
                          Upcoming
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="text-xl font-bold leading-tight">
                      {displayEpisode.name}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">{seriesName}</p>
                  </DialogHeader>

                  {/* Info cards grid */}
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {displayEpisode.vote_average > 0 && !isUpcoming && (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Rating
                          </p>
                          <p className="text-sm font-bold">
                            {displayEpisode.vote_average.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    )}
                    {airDate && (
                      <InfoCard icon={Calendar} label="Air Date" value={airDate} />
                    )}
                    {displayEpisode.runtime && (
                      <InfoCard
                        icon={Clock}
                        label="Runtime"
                        value={`${displayEpisode.runtime} min`}
                      />
                    )}
                    <InfoCard
                      icon={Tv}
                      label="Episode"
                      value={`${seasonNumber}×${displayEpisode.episode_number}`}
                    />
                    {displayEpisode.vote_count && displayEpisode.vote_count > 0 && (
                      <InfoCard
                        icon={TrendingUp}
                        label="Votes"
                        value={displayEpisode.vote_count.toLocaleString()}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Overview */}
              {displayEpisode.overview && (
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  {displayEpisode.overview}
                </DialogDescription>
              )}

              {/* Crew inline */}
              {(director || writers.length > 0) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {director && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Directed by</span>
                      <Link
                        href={`/person/${director.id}/${getSlug(director.name)}`}
                        className="font-medium hover:text-brand transition-colors"
                      >
                        {director.name}
                      </Link>
                    </div>
                  )}
                  {writers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Written by</span>
                      <span className="font-medium">
                        {writers
                          .slice(0, 2)
                          .map((w) => w.name)
                          .join(", ")}
                        {writers.length > 2 && ` +${writers.length - 2}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Guest Stars scroller */}
              {guestStars.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Guest Stars</h3>
                    <span className="text-xs text-muted-foreground">
                      ({guestStars.length})
                    </span>
                  </div>
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-3 pb-2">
                      {guestStars.map((guest) => (
                        <PersonCard key={guest.id} person={guest} role="cast" />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              )}

              {/* Additional Crew scroller */}
              {additionalCrew.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Crew</h3>
                    <span className="text-xs text-muted-foreground">
                      ({additionalCrew.length})
                    </span>
                  </div>
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-3 pb-2">
                      {additionalCrew.slice(0, 12).map((crew) => (
                        <PersonCard
                          key={`${crew.id}-${crew.job}`}
                          person={crew}
                          role="crew"
                        />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
