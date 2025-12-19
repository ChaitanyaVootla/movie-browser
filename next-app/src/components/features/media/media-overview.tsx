"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Movie, Series, CastMember } from "@/types";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { KeywordsList } from "./keywords-list";
import { CountryLanguageBadges } from "./country-language-badges";
import { ContentWarningLink } from "./content-warning-link";

interface MediaOverviewProps {
  item: Movie | Series;
  mediaType: "movie" | "series";
  className?: string;
}

function isMovie(item: Movie | Series): item is Movie {
  return "title" in item;
}

function getSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Cast member card
function CastCard({ cast }: { cast: CastMember }) {
  if (!cast.profile_path) return null;

  const href = `/person/${cast.id}/${getSlug(cast.name)}`;

  return (
    <Link href={href} className="group flex-shrink-0 w-[110px] sm:w-[125px] md:w-[140px]">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-2 ring-1 ring-white/10 group-hover:ring-brand/50 transition-all">
        <Image
          src={`https://image.tmdb.org/t/p/w185${cast.profile_path}`}
          alt={cast.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="140px"
        />
      </div>
      <p className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
        {cast.name}
      </p>
      <p className="text-xs text-muted-foreground line-clamp-1">{cast.character}</p>
    </Link>
  );
}

// Info item component
function InfoItem({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  if (!value) return null;

  const content = <span className="text-foreground">{value}</span>;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      {href ? (
        <Link href={href} className="text-sm hover:text-brand transition-colors truncate">
          {content}
        </Link>
      ) : (
        <span className="text-sm truncate">{content}</span>
      )}
    </div>
  );
}

// Series status badge with enhanced visuals
function SeriesStatusBadge({ status, inProduction, nextAirDate }: { status: string; inProduction?: boolean; nextAirDate?: string }) {
  const getStatusConfig = () => {
    // Check if there's an upcoming episode
    const hasUpcomingEpisode = nextAirDate && new Date(nextAirDate) > new Date();
    
    switch (status) {
      case "Returning Series":
        if (hasUpcomingEpisode) {
          return { 
            label: "Airing", 
            color: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
            icon: "●" 
          };
        }
        return { 
          label: inProduction ? "Ongoing" : "Returning Soon", 
          color: "bg-green-500/20 text-green-400 border border-green-500/30",
          icon: null 
        };
      case "Ended":
        return { 
          label: "Ended", 
          color: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
          icon: null 
        };
      case "Canceled":
        return { 
          label: "Canceled", 
          color: "bg-red-500/20 text-red-400 border border-red-500/30",
          icon: null 
        };
      case "In Production":
        return { 
          label: "In Production", 
          color: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
          icon: null 
        };
      case "Pilot":
        return { 
          label: "Pilot", 
          color: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
          icon: null 
        };
      case "Planned":
        return { 
          label: "Planned", 
          color: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
          icon: null 
        };
      default:
        return { 
          label: status, 
          color: "bg-muted text-muted-foreground border border-border",
          icon: null 
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.color)}>
      {config.icon && <span className="animate-pulse text-[8px]">{config.icon}</span>}
      {config.label}
    </span>
  );
}

export function MediaOverview({ item, mediaType, className }: MediaOverviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const director = item.credits?.crew?.find((c) => c.job === "Director");
  const creators = !isMovie(item)
    ? item.created_by || item.credits?.crew?.filter((c) => c.job === "Creator")
    : [];
  const topCast = item.credits?.cast?.slice(0, 15) || [];

  // Get keywords based on media type
  const keywords = isMovie(item) ? item.keywords?.keywords : item.keywords?.results;

  // Get IMDB ID
  const imdbId = isMovie(item) ? item.imdb_id : item.external_ids?.imdb_id;

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // Format currency - deterministic to avoid SSR hydration mismatch
  const formatCurrency = (amount?: number): string | null => {
    if (!amount) return null;
    if (amount >= 1_000_000_000) {
      const billions = amount / 1_000_000_000;
      return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
      const millions = amount / 1_000_000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
    }
    if (amount >= 1_000) {
      const thousands = amount / 1_000;
      return `$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
    }
    return `$${amount}`;
  };

  return (
    <div className={cn("py-8 md:py-12 space-y-10 md:space-y-12", className)}>
      {/* Overview & Details - Full width */}
      <section className="px-4 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px] gap-8 lg:gap-12">
          {/* Main content */}
          <div className="space-y-5">
            {item.overview && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Overview</h2>
                <p className="text-muted-foreground leading-relaxed">{item.overview}</p>
              </div>
            )}

            {item.tagline && (
              <blockquote className="border-l-2 border-brand pl-4 italic text-muted-foreground">
                &ldquo;{item.tagline}&rdquo;
              </blockquote>
            )}

            {/* Country, Language, Content Warning */}
            <div className="flex flex-wrap items-center gap-3">
              <CountryLanguageBadges
                originCountry={item.origin_country}
                originalLanguage={item.original_language}
                mediaType={mediaType}
              />
              <ContentWarningLink imdbId={imdbId} size="sm" />
            </div>

            {/* Keywords */}
            {keywords && keywords.length > 0 && (
              <KeywordsList keywords={keywords} mediaType={mediaType} maxVisible={10} />
            )}
          </div>

          {/* Sidebar - Details */}
          <div className="space-y-3 lg:bg-card/30 lg:rounded-xl lg:p-5 lg:h-fit">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 hidden lg:block">
              Details
            </h3>
            
            {isMovie(item) && director && (
              <InfoItem
                label="Director"
                value={director.name}
                href={`/person/${director.id}/${getSlug(director.name)}`}
              />
            )}
            {!isMovie(item) && creators && creators.length > 0 && (
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground text-sm shrink-0">
                  {creators.length > 1 ? "Creators" : "Creator"}
                </span>
                <span className="text-sm flex flex-wrap gap-x-1">
                  {creators.map((c, i) => (
                    <span key={c.id}>
                      <Link
                        href={`/person/${c.id}/${getSlug(c.name)}`}
                        className="hover:text-brand transition-colors font-medium"
                      >
                        {c.name}
                      </Link>
                      {i < creators.length - 1 && ", "}
                    </span>
                  ))}
                </span>
              </div>
            )}
            
            {/* Series status with badge */}
            {!isMovie(item) && item.status && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Status</span>
                <SeriesStatusBadge 
                  status={item.status} 
                  inProduction={item.in_production} 
                  nextAirDate={item.next_episode_to_air?.air_date}
                />
              </div>
            )}
            {isMovie(item) && <InfoItem label="Status" value={item.status} />}
            
            {isMovie(item) && (
              <>
                <InfoItem label="Budget" value={formatCurrency(item.budget)} />
                <InfoItem label="Revenue" value={formatCurrency(item.revenue)} />
              </>
            )}
            
            {!isMovie(item) && (
              <>
                <InfoItem label="Seasons" value={item.number_of_seasons} />
                <InfoItem label="Episodes" value={item.number_of_episodes} />
                {item.networks && item.networks.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-muted-foreground text-sm">
                      {item.networks.length > 1 ? "Networks" : "Network"}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {item.networks.slice(0, 3).map((network) => (
                        <div
                          key={network.id}
                          className="flex items-center gap-2 bg-card/50 rounded-md px-2 py-1"
                        >
                          {network.logo_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w92${network.logo_path}`}
                              alt={network.name}
                              width={40}
                              height={20}
                              className="h-4 w-auto object-contain brightness-0 invert opacity-80"
                            />
                          ) : (
                            <span className="text-xs font-medium">{network.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            
            {item.production_companies && item.production_companies.length > 0 && (
              <InfoItem label="Studio" value={item.production_companies[0].name} />
            )}
            
            {imdbId && (
              <a
                href={`https://www.imdb.com/title/${imdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand/80 transition-colors pt-2"
              >
                View on IMDb
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Cast Carousel - Full width, matching MovieCarousel pattern */}
      {topCast.length > 0 && (
        <section className="space-y-4">
          {/* Header */}
          <div className="px-4 md:px-8 lg:px-12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand" />
              <h2 className="text-xl font-semibold tracking-tight">Top Cast</h2>
            </div>
            <div className="hidden md:flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => scroll("left")}
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => scroll("right")}
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Cast scroll area */}
          <ScrollArea className="w-full whitespace-nowrap">
            <div ref={scrollRef} className="flex gap-4 pb-4 px-4 md:px-8 lg:px-12">
              {topCast.map((cast) => (
                <CastCard key={cast.id} cast={cast} />
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </section>
      )}
    </div>
  );
}
