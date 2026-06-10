"use client";

import {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollContainer } from "@/components/features/media/scroll-container";
import { cn } from "@/lib/utils";
import { getEpisode } from "@/server/actions/series";
import type { Episode, CastMember, CrewMember, EpisodeStill } from "@/types";

// SSR-safe media query hook
const emptySubscribe = () => () => {};
const getIsMobileSnapshot = () => typeof window !== "undefined" && window.innerWidth < 768;
const getServerSnapshot = () => false;

function useIsMobile() {
  const subscribeToResize = useCallback((callback: () => void) => {
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }, []);

  return useSyncExternalStore(
    typeof window !== "undefined" ? subscribeToResize : emptySubscribe,
    getIsMobileSnapshot,
    getServerSnapshot
  );
}

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

// Person card with squircle avatar (like CastCard in media-overview)
function PersonCard({ person, role }: { person: CastMember | CrewMember; role: "cast" | "crew" }) {
  const href = `/person/${person.id}/${getSlug(person.name)}`;
  const displayRole =
    role === "cast" ? (person as CastMember).character : (person as CrewMember).job;

  return (
    <Link href={href} className="group flex-shrink-0 w-[85px]">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-1 ring-white/10 group-hover:ring-brand/50 transition-all">
        {person.profile_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
            alt={person.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="85px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-lg font-light text-muted-foreground/50">
              {person.name.charAt(0)}
            </span>
          </div>
        )}
      </div>
      <p className="text-xs font-medium group-hover:text-brand transition-colors">
        {person.name}
      </p>
      {displayRole && (
        <p className="text-[11px] text-muted-foreground">{displayRole}</p>
      )}
    </Link>
  );
}

// Small circular avatar for crew inline display
function CrewAvatar({ person, label }: { person: CrewMember; label: string }) {
  const href = `/person/${person.id}/${getSlug(person.name)}`;

  return (
    <Link href={href} className="flex items-center gap-2 group">
      <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted ring-1 ring-white/10 group-hover:ring-brand/50 transition-all flex-shrink-0">
        {person.profile_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w45${person.profile_path}`}
            alt={person.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground font-medium">
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate group-hover:text-brand transition-colors">
          {person.name}
        </p>
      </div>
    </Link>
  );
}

const SWIPE_THRESHOLD = 50; // Minimum distance for swipe

// Image carousel with 16:9 aspect ratio - renders lightbox via portal
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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? stills.length - 1 : prev - 1));
  }, [stills.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === stills.length - 1 ? 0 : prev + 1));
  }, [stills.length]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsAutoPlaying(false);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || stills.length <= 1) {
        setIsAutoPlaying(true);
        return;
      }

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const dx = touchEnd.x - touchStartRef.current.x;
      const dy = touchEnd.y - touchStartRef.current.y;

      // Only trigger swipe if horizontal movement is greater than vertical
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx > 0) {
          goToPrevious();
        } else {
          goToNext();
        }
      }

      touchStartRef.current = null;
      setIsAutoPlaying(true);
    },
    [stills.length, goToPrevious, goToNext]
  );

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

  // Lightbox rendered via portal to escape modal z-index
  const lightbox = isLightboxOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black flex items-center justify-center touch-pan-y"
          onClick={() => setIsLightboxOpen(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
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
                className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12 rounded-full"
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
                className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white h-12 w-12 rounded-full"
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
            className="max-w-[90vw] max-h-[90dvh] object-contain select-none pointer-events-none"
            draggable={false}
          />

          {stills.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1.5 rounded-full">
              {currentIndex + 1} / {stills.length}
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        className="relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-muted group cursor-pointer touch-pan-y"
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
              sizes="(max-width: 768px) 100vw, 500px"
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
                  idx === currentIndex ? "bg-white w-4" : "bg-white/50 hover:bg-white/70"
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

      {lightbox}
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
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// Loading skeleton
function EpisodeDetailsSkeleton() {
  return (
    <div className="p-4 md:p-5 space-y-4 md:space-y-5">
      <div className="flex flex-col lg:flex-row gap-4 md:gap-5 items-start">
        <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0">
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <div className="grid grid-cols-2 gap-2 mt-4">
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

// Shared episode content component
function EpisodeContent({
  episode,
  fullEpisode,
  seriesName,
  seasonNumber,
  isPending,
  variant,
}: {
  episode: Episode;
  fullEpisode: Episode | null;
  seriesName: string;
  seasonNumber: number;
  isPending: boolean;
  variant: "dialog" | "drawer";
}) {
  const displayEpisode = fullEpisode || episode;

  const airDate = displayEpisode.air_date
    ? new Date(displayEpisode.air_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const isUpcoming = displayEpisode.air_date && new Date(displayEpisode.air_date) > new Date();

  // Crew
  const director = displayEpisode.crew?.find((c) => c.job === "Director");
  const writers =
    displayEpisode.crew?.filter(
      (c) => c.department === "Writing" || c.job === "Writer" || c.job === "Story"
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

  if (isPending && !fullEpisode) {
    return <EpisodeDetailsSkeleton />;
  }

  const Header = variant === "dialog" ? DialogHeader : DrawerHeader;
  const Title = variant === "dialog" ? DialogTitle : DrawerTitle;
  const Description = variant === "dialog" ? DialogDescription : DrawerDescription;

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="p-4 md:p-5 space-y-4 md:space-y-5">
        {/* Top section: Image + Info - flex layout with top alignment */}
        <div className="flex flex-col lg:flex-row gap-4 md:gap-5 items-start">
          {/* Left: Image carousel - constrained width on desktop */}
          <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0">
            {stills.length > 0 ? (
              <EpisodeImageCarousel stills={stills} episodeName={displayEpisode.name} />
            ) : (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <Tv className="h-12 w-12 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Right: Title + Info cards - fills remaining space */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <Header className="text-left space-y-1.5 mb-4 p-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  S{seasonNumber} E{displayEpisode.episode_number}
                </Badge>
                {isUpcoming && (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                    Upcoming
                  </Badge>
                )}
              </div>
              <Title className="text-xl font-bold leading-tight">{displayEpisode.name}</Title>
              <p className="text-sm text-muted-foreground">{seriesName}</p>
            </Header>

            {/* Info cards grid */}
            <div className="grid grid-cols-2 gap-2">
              {displayEpisode.vote_average > 0 && !isUpcoming && (
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Rating
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-sm font-bold">{displayEpisode.vote_average.toFixed(1)}</p>
                      {displayEpisode.vote_count && displayEpisode.vote_count > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          ({displayEpisode.vote_count.toLocaleString()})
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {airDate && <InfoCard icon={Calendar} label="Air Date" value={airDate} />}
              {displayEpisode.runtime && (
                <InfoCard icon={Clock} label="Runtime" value={`${displayEpisode.runtime} min`} />
              )}
              <InfoCard
                icon={Tv}
                label="Episode"
                value={`${seasonNumber}×${displayEpisode.episode_number}`}
              />
            </div>

            {/* Director & Writer with avatars */}
            {(director || writers.length > 0) && (
              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border/50">
                {director && <CrewAvatar person={director} label="Director" />}
                {writers.slice(0, 2).map((writer) => (
                  <CrewAvatar key={writer.id} person={writer} label="Writer" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Overview */}
        {displayEpisode.overview && (
          <Description className="text-sm text-muted-foreground leading-relaxed">
            {displayEpisode.overview}
          </Description>
        )}

        {/* Guest Stars scroller */}
        {guestStars.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Guest Stars</h3>
              <span className="text-xs text-muted-foreground">({guestStars.length})</span>
            </div>
            <ScrollContainer gap="gap-3" showControls={false} bottomPadding="pb-2">
              {guestStars.map((guest) => (
                <PersonCard key={guest.id} person={guest} role="cast" />
              ))}
            </ScrollContainer>
          </div>
        )}

        {/* Additional Crew scroller */}
        {additionalCrew.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Crew</h3>
              <span className="text-xs text-muted-foreground">({additionalCrew.length})</span>
            </div>
            <ScrollContainer gap="gap-3" showControls={false} bottomPadding="pb-2">
              {additionalCrew.slice(0, 12).map((crew) => (
                <PersonCard key={`${crew.id}-${crew.job}`} person={crew} role="crew" />
              ))}
            </ScrollContainer>
          </div>
        )}
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
  const isMobile = useIsMobile();

  useEffect(() => {
    if (episode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Mobile: Use Drawer (bottom pull-up)
  if (isMobile) {
    return (
      <Drawer open={!!episode} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[90dvh] bg-background">
          {/* Close button */}
          <DrawerClose asChild>
            <button
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/80 hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </DrawerClose>
          <EpisodeContent
            episode={episode}
            fullEpisode={fullEpisode}
            seriesName={seriesName}
            seasonNumber={seasonNumber}
            isPending={isPending}
            variant="drawer"
          />
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Use Dialog (centered modal)
  return (
    <Dialog open={!!episode} onOpenChange={() => onClose()}>
      <DialogContent
        className="sm:max-w-[95vw] md:max-w-[85vw] lg:max-w-4xl w-full p-0 overflow-hidden max-h-[85dvh] gap-0 flex flex-col"
        showCloseButton={false}
      >
        {/* Close button - fixed position */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 z-30 rounded-full h-8 w-8 bg-background/80 hover:bg-background text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        <EpisodeContent
          episode={episode}
          fullEpisode={fullEpisode}
          seriesName={seriesName}
          seasonNumber={seasonNumber}
          isPending={isPending}
          variant="dialog"
        />
      </DialogContent>
    </Dialog>
  );
}
