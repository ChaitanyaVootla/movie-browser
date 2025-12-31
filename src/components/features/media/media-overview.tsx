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

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Cast member card - compact size
function CastCard({ cast }: { cast: CastMember }) {
  if (!cast.profile_path) return null;

  const href = `/person/${cast.id}/${getSlug(cast.name)}`;

  return (
    <Link href={href} className="group flex-shrink-0 w-[90px] sm:w-[100px] md:w-[110px]">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-1.5 ring-1 ring-white/10 group-hover:ring-brand/50 transition-all">
        <Image
          src={`https://image.tmdb.org/t/p/w185${cast.profile_path}`}
          alt={cast.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="110px"
        />
      </div>
      <p className="text-xs font-medium line-clamp-1 group-hover:text-brand transition-colors">
        {cast.name}
      </p>
      <p className="text-[11px] text-muted-foreground line-clamp-1">{cast.character}</p>
    </Link>
  );
}

// Info item component
function InfoItem({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  if (!value) return null;

  const content = <span className="text-foreground">{value}</span>;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      {href ? (
        <Link href={href} className="text-xs hover:text-brand transition-colors truncate">
          {content}
        </Link>
      ) : (
        <span className="text-xs truncate">{content}</span>
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
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium", config.color)}>
      {config.icon && <span className="animate-pulse text-[6px]">{config.icon}</span>}
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
    <div className={cn("py-4 md:py-5 space-y-5 md:space-y-6", className)}>
      {/* Overview & Details - Card container */}
      <section className="px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_280px] xl:grid-cols-[1fr_1px_320px]">
            {/* Main content - Overview */}
            <div className="p-4 md:p-5 space-y-3">
              {item.overview && (
                <div>
                  <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Overview</h2>
                  <p className="text-sm text-foreground/90 leading-relaxed">{item.overview}</p>
                </div>
              )}

              {/* Country, Language, Content Warning */}
              <div className="flex flex-wrap items-center gap-2">
                <CountryLanguageBadges
                  originCountry={item.origin_country}
                  originalLanguage={item.original_language}
                  mediaType={mediaType}
                  size="xs"
                />
                <ContentWarningLink imdbId={imdbId} size="xs" />
              </div>

              {/* Keywords */}
              {keywords && keywords.length > 0 && (
                <KeywordsList keywords={keywords} mediaType={mediaType} maxVisible={10} />
              )}
            </div>

            {/* Vertical separator - hidden on mobile */}
            <div className="hidden lg:block bg-white/10" />

            {/* Sidebar - Details */}
            <div className="p-4 md:p-5 space-y-2 border-t lg:border-t-0 border-white/10">
              {/* Director/Creator at top with avatar */}
              {isMovie(item) && director && (
                <Link 
                  href={`/person/${director.id}/${getSlug(director.name)}`}
                  className="flex items-center gap-2.5 group mb-3"
                >
                  <div className="relative h-9 w-9 rounded-full overflow-hidden bg-muted ring-1 ring-white/10 group-hover:ring-brand/50 transition-all flex-shrink-0">
                    {director.profile_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w45${director.profile_path}`}
                        alt={director.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-medium">
                        {director.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Director</p>
                    <p className="text-xs font-medium truncate group-hover:text-brand transition-colors">{director.name}</p>
                  </div>
                </Link>
              )}
              {!isMovie(item) && creators && creators.length > 0 && (
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="flex -space-x-1.5">
                    {creators.slice(0, 2).map((c) => (
                      <Link 
                        key={c.id}
                        href={`/person/${c.id}/${getSlug(c.name)}`}
                        className="relative h-9 w-9 rounded-full overflow-hidden bg-muted ring-2 ring-background hover:ring-brand/50 transition-all flex-shrink-0"
                      >
                        {c.profile_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w45${c.profile_path}`}
                            alt={c.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-medium">
                            {c.name.charAt(0)}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {creators.length > 1 ? "Creators" : "Creator"}
                    </p>
                    <p className="text-xs font-medium truncate">
                      {creators.map((c) => c.name).join(", ")}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {/* Release Date - Full readable format */}
                {isMovie(item) && item.release_date && (
                  <InfoItem label="Released" value={formatDate(item.release_date)} />
                )}
                {!isMovie(item) && item.first_air_date && (
                  <InfoItem label="First Aired" value={formatDate(item.first_air_date)} />
                )}
                
                {/* Runtime (movies only) */}
                {isMovie(item) && item.runtime && (
                  <InfoItem label="Runtime" value={formatRuntime(item.runtime)} />
                )}
              
                {/* Series status with badge */}
                {!isMovie(item) && item.status && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Status</span>
                    <SeriesStatusBadge 
                      status={item.status} 
                      inProduction={item.in_production} 
                      nextAirDate={item.next_episode_to_air?.air_date}
                    />
                  </div>
                )}
                {isMovie(item) && <InfoItem label="Status" value={item.status} />}
              
                {/* Budget & Revenue - Combined on one row */}
                {isMovie(item) && (item.budget || item.revenue) && (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {item.budget ? (
                      <>
                        <span className="text-muted-foreground text-xs">Budget</span>
                        <span className="text-xs text-foreground">{formatCurrency(item.budget)}</span>
                      </>
                    ) : null}
                    {item.budget && item.revenue ? (
                      <span className="text-muted-foreground text-xs">·</span>
                    ) : null}
                    {item.revenue ? (
                      <>
                        <span className="text-muted-foreground text-xs">Revenue</span>
                        <span className="text-xs text-foreground">{formatCurrency(item.revenue)}</span>
                      </>
                    ) : null}
                  </div>
                )}
              
                {/* Seasons & Episodes - Combined on one row */}
                {!isMovie(item) && (item.number_of_seasons || item.number_of_episodes) && (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {item.number_of_seasons ? (
                      <>
                        <span className="text-muted-foreground text-xs">Seasons</span>
                        <span className="text-xs text-foreground">{item.number_of_seasons}</span>
                      </>
                    ) : null}
                    {item.number_of_seasons && item.number_of_episodes ? (
                      <span className="text-muted-foreground text-xs">·</span>
                    ) : null}
                    {item.number_of_episodes ? (
                      <>
                        <span className="text-muted-foreground text-xs">Episodes</span>
                        <span className="text-xs text-foreground">{item.number_of_episodes}</span>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Networks - for series */}
                {!isMovie(item) && item.networks && item.networks.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {item.networks.slice(0, 2).map((network) => (
                      <div
                        key={network.id}
                        className="flex items-center justify-center bg-white/5 rounded px-2 py-0.5"
                      >
                        {network.logo_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w154${network.logo_path}`}
                            alt={network.name}
                            width={40}
                            height={16}
                            className="h-3.5 object-contain brightness-0 invert opacity-80"
                            style={{ width: "auto" }}
                          />
                        ) : (
                          <span className="text-[9px] font-medium text-muted-foreground">{network.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              
                {/* Studio with logo */}
                {item.production_companies && item.production_companies.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {item.production_companies.slice(0, 2).map((company) => (
                      <div
                        key={company.id}
                        className="flex items-center justify-center bg-white/5 rounded px-2 py-0.5"
                      >
                        {company.logo_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w154${company.logo_path}`}
                            alt={company.name}
                            width={40}
                            height={16}
                            className="h-3.5 object-contain brightness-0 invert opacity-80"
                            style={{ width: "auto" }}
                          />
                        ) : (
                          <span className="text-[9px] font-medium text-muted-foreground">{company.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
