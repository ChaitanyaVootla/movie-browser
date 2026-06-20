"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { OVERLINE } from "@/lib/design";
import type {
  AISummary,
  MovieOverviewProps,
  SeriesOverviewProps,
  MediaOverviewCast,
} from "@/types";
import type { OverviewAISummary, OverviewAIInsights } from "@/types/client-props";
import Image from "next/image";
import Link from "next/link";
import { KeywordsList } from "./keywords-list";
import { CountryLanguageBadges } from "./country-language-badges";
import { ContentWarningLink } from "./content-warning-link";
import { GenreList } from "./genre-badge";
import { MediaScroller } from "./media-scroller";
import { EnrichButton } from "./enrich-button";
import { RefreshDataButton } from "./refresh-data-button";
import { ItemAnalyticsModal, AIDataModal } from "@/components/features/admin";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WatchNotes } from "./insight-sections";
import { StandoutAspects } from "./standout-aspects";

/**
 * Light prop types for RSC serialization optimization.
 * These contain only the fields needed for rendering, reducing payload by ~80%.
 * AI props are server-trimmed subsets (see extractOverviewAISummary /
 * extractOverviewAIInsights) — the full summary/insights blobs are already
 * serialized via their own consumers (LiveAIHook, MediaActionBar,
 * AIQuestionsSection, DeepDiveSection, MediaContextUpdater).
 */
interface MediaOverviewProps {
  item: MovieOverviewProps | SeriesOverviewProps;
  mediaType: "movie" | "series";
  aiSummary?: OverviewAISummary | null;
  /** Structured AI insights (spoiler-free subset only) */
  aiInsights?: OverviewAIInsights | null;
  className?: string;
}

function isMovie(item: MovieOverviewProps | SeriesOverviewProps): item is MovieOverviewProps {
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
function CastCard({ cast }: { cast: MediaOverviewCast }) {
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
      <p className="text-[13px] font-medium group-hover:text-brand transition-colors leading-tight">
        {cast.name}
      </p>
      <p className="text-xs text-muted-foreground/80 leading-tight">{cast.character}</p>
    </Link>
  );
}

// Info item component
function InfoItem({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  if (!value) return null;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-foreground/70 shrink-0">{label}</span>
      {href ? (
        <Link href={href} className="text-xs font-semibold hover:text-brand transition-colors truncate">
          {value}
        </Link>
      ) : (
        <span className="text-xs font-semibold truncate">{value}</span>
      )}
    </div>
  );
}

// Mood indicators - "Vibe" section with clean 2x2 grid
// Subtle color hints for extreme values
function MoodIndicators({ mood }: { mood: AISummary["mood"] }) {
  // Tooltip descriptions for each mood type and value
  const getTooltip = (type: string, value: string): string => {
    const tooltips: Record<string, Record<string, string>> = {
      pacing: {
        fast: "Quick cuts, lots of action, keeps you on the edge",
        steady: "Balanced rhythm with room to breathe",
        slow: "Deliberate, contemplative storytelling",
      },
      intensity: {
        high: "Gripping and tense throughout",
        medium: "Engaging with peaks of tension",
        low: "Relaxed and easygoing",
      },
      tone: {
        dark: "Serious, grim themes and atmosphere",
        light: "Upbeat, optimistic, or comedic",
        mixed: "Balances lighter and heavier moments",
      },
      emotional: {
        heavy: "Emotionally intense, may leave you thinking",
        medium: "Emotionally engaging without overwhelming",
        light: "Easy watch, won't weigh on you",
      },
    };
    return tooltips[type]?.[value] || "";
  };

  // Subtle color accents for extreme values only
  const getColorClasses = (type: string, value: string): string => {
    const base = "bg-white/[0.03] border-white/5";
    switch (type) {
      case "pacing":
        if (value === "fast") return "bg-amber-500/[0.06] border-amber-500/20 text-amber-200";
        if (value === "slow") return "bg-blue-500/[0.06] border-blue-500/20 text-blue-200";
        return base;
      case "intensity":
        if (value === "high") return "bg-orange-500/[0.06] border-orange-500/20 text-orange-200";
        if (value === "low") return "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-200";
        return base;
      case "tone":
        if (value === "dark") return "bg-purple-500/[0.06] border-purple-500/20 text-purple-200";
        if (value === "light") return "bg-yellow-500/[0.06] border-yellow-500/20 text-yellow-200";
        return base;
      case "emotional":
        if (value === "heavy") return "bg-rose-500/[0.06] border-rose-500/20 text-rose-200";
        if (value === "light") return "bg-cyan-500/[0.06] border-cyan-500/20 text-cyan-200";
        return base;
      default:
        return base;
    }
  };

  const indicators = [
    { key: "pacing", label: "Pace", value: mood.pacing },
    { key: "intensity", label: "Intensity", value: mood.intensity },
    { key: "tone", label: "Tone", value: mood.tone },
    { key: "emotional", label: "Feel", value: mood.emotional },
  ];

  return (
    <div className="pt-3 mt-3 border-t border-white/10">
      <h4 className={cn(OVERLINE, "mb-2")}>Vibe</h4>
      <div className="grid grid-cols-2 gap-1.5">
        {indicators.map(({ key, label, value }) => {
          const tooltip = getTooltip(key, value);
          const colorClasses = getColorClasses(key, value);
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex flex-col px-2.5 py-1.5 rounded-md border cursor-help transition-colors",
                  colorClasses
                )}>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                  <span className="text-xs font-semibold capitalize">{value}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[180px] text-center">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}



// Series status badge with enhanced visuals
function SeriesStatusBadge({
  status,
  inProduction,
  nextAirDate,
}: {
  status: string;
  inProduction?: boolean;
  nextAirDate?: string;
}) {
  const getStatusConfig = () => {
    // Check if there's an upcoming episode
    const hasUpcomingEpisode = nextAirDate && new Date(nextAirDate) > new Date();

    switch (status) {
      case "Returning Series":
        if (hasUpcomingEpisode) {
          return {
            label: "Airing",
            color: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
            icon: "●",
          };
        }
        return {
          label: inProduction ? "Ongoing" : "Returning Soon",
          color: "bg-green-500/20 text-green-400 border border-green-500/30",
          icon: null,
        };
      case "Ended":
        return {
          label: "Ended",
          color: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
          icon: null,
        };
      case "Canceled":
        return {
          label: "Canceled",
          color: "bg-red-500/20 text-red-400 border border-red-500/30",
          icon: null,
        };
      case "In Production":
        return {
          label: "In Production",
          color: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
          icon: null,
        };
      case "Pilot":
        return {
          label: "Pilot",
          color: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
          icon: null,
        };
      case "Planned":
        return {
          label: "Planned",
          color: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
          icon: null,
        };
      default:
        return {
          label: status,
          color: "bg-muted text-muted-foreground border border-border",
          icon: null,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        config.color
      )}
    >
      {config.icon && <span className="animate-pulse text-[10px]">{config.icon}</span>}
      {config.label}
    </span>
  );
}

/**
 * Admin-only footer with data tools (only renders for admins)
 */
function AdminToolsFooter({
  tmdbId,
  mediaType,
}: {
  tmdbId: number;
  mediaType: "movie" | "series";
}) {
  const isAdmin = useIsAdmin();

  // Don't render anything for non-admins
  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 border-t border-white/5 md:justify-end [&>*]:shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ItemAnalyticsModal tmdbId={tmdbId} mediaType={mediaType} />
      <AIDataModal tmdbId={tmdbId} mediaType={mediaType} />
      <RefreshDataButton tmdbId={tmdbId} mediaType={mediaType} />
      <EnrichButton tmdbId={tmdbId} mediaType={mediaType} />
    </div>
  );
}

export function MediaOverview({ item, mediaType, aiSummary, aiInsights, className }: MediaOverviewProps) {
  // Props are now pre-extracted - no more digging into nested objects
  const isMobileView = useMobile();
  const director = isMovie(item) ? item.director : undefined;
  const creators = !isMovie(item) ? item.creators : undefined;
  const topCast = item.topCast || [];
  const keywords = item.keywords;
  const imdbId = item.imdb_id;

  // Format currency - deterministic to avoid SSR hydration mismatch
  // Note: Prisma may return BigInt for large numbers, so we convert to Number
  const formatCurrency = (amount?: number | bigint): string | null => {
    if (!amount) return null;
    const num = typeof amount === "bigint" ? Number(amount) : amount;
    if (num >= 1_000_000_000) {
      const billions = num / 1_000_000_000;
      return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
    }
    if (num >= 1_000_000) {
      const millions = num / 1_000_000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
    }
    if (num >= 1_000) {
      const thousands = num / 1_000;
      return `$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
    }
    return `$${num}`;
  };

  return (
    <div className={cn("py-4 md:py-5 space-y-5 md:space-y-6", className)}>
      {/* Overview & Details - Card container */}
      <section className="px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_300px] xl:grid-cols-[1fr_1px_360px]">
            {/* Main content - Overview */}
            <div className="p-4 md:p-5 space-y-3">
              {item.overview && (
                <div>
                  <h2 className={cn(OVERLINE, "mb-2")}>Overview</h2>
                  {/* Genres - under overview heading */}
                  {item.genres && item.genres.length > 0 && (
                    <GenreList
                      genres={item.genres}
                      mediaType={mediaType}
                      size="sm"
                      maxVisible={5}
                      className="mb-2"
                    />
                  )}
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

              {/* Keywords (TMDB) — fewer on mobile to cut vertical scroll.
                  AI themes used to render here too but were dropped: they
                  looked different and cluttered the section. */}
              {keywords && keywords.length > 0 && (
                <KeywordsList
                  keywords={keywords}
                  mediaType={mediaType}
                  maxVisible={isMobileView ? 5 : 10}
                />
              )}

              {/* Standout Aspects - clean text-based design */}
              {aiInsights?.spoilerFree?.highlights && aiInsights.spoilerFree.highlights.length > 0 && (
                <StandoutAspects highlights={aiInsights.spoilerFree.highlights} maxItems={3} />
              )}

              {/* Watch Notes - unified Best For + Heads Up section */}
              <WatchNotes
                bestFor={aiInsights?.spoilerFree?.bestFor}
                headsUp={aiInsights?.spoilerFree?.headsUp}
              />
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
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Director</p>
                    <p className="text-sm font-semibold truncate group-hover:text-brand transition-colors">
                      {director.name}
                    </p>
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
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {creators.length > 1 ? "Creators" : "Creator"}
                    </p>
                    <p className="text-sm font-semibold truncate">
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
                    <span className="text-xs text-foreground/70">Status</span>
                    <SeriesStatusBadge
                      status={item.status}
                      inProduction={item.in_production}
                      nextAirDate={item.next_air_date}
                    />
                  </div>
                )}
                {isMovie(item) && <InfoItem label="Status" value={item.status} />}

                {/* AI Mood indicators - prominent position for decision-making */}
                {aiSummary?.mood && <MoodIndicators mood={aiSummary.mood} />}

                {/* Budget & Revenue - Combined on one row */}
                {isMovie(item) && (item.budget || item.revenue) && (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {item.budget ? (
                      <>
                        <span className="text-xs text-foreground/70">Budget</span>
                        <span className="text-xs font-semibold">{formatCurrency(item.budget)}</span>
                      </>
                    ) : null}
                    {item.budget && item.revenue ? (
                      <span className="text-xs text-foreground/70">·</span>
                    ) : null}
                    {item.revenue ? (
                      <>
                        <span className="text-xs text-foreground/70">Revenue</span>
                        <span className="text-xs font-semibold">{formatCurrency(item.revenue)}</span>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Seasons & Episodes - Combined on one row */}
                {!isMovie(item) && (item.number_of_seasons || item.number_of_episodes) && (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {item.number_of_seasons ? (
                      <>
                        <span className="text-xs text-foreground/70">Seasons</span>
                        <span className="text-xs font-semibold">{item.number_of_seasons}</span>
                      </>
                    ) : null}
                    {item.number_of_seasons && item.number_of_episodes ? (
                      <span className="text-xs text-foreground/70">·</span>
                    ) : null}
                    {item.number_of_episodes ? (
                      <>
                        <span className="text-xs text-foreground/70">Episodes</span>
                        <span className="text-xs font-semibold">{item.number_of_episodes}</span>
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
                            src={`https://image.tmdb.org/t/p/w300${network.logo_path}`}
                            alt={network.name}
                            width={80}
                            height={32}
                            className="h-3.5 object-contain brightness-0 invert opacity-80"
                            style={{ width: "auto" }}
                            unoptimized
                          />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {network.name}
                          </span>
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
                            src={`https://image.tmdb.org/t/p/w300${company.logo_path}`}
                            alt={company.name}
                            width={80}
                            height={32}
                            className="h-3.5 object-contain brightness-0 invert opacity-80"
                            style={{ width: "auto" }}
                            unoptimized
                          />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {company.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Admin-only tools - subtle footer (only renders for admins) */}
          <AdminToolsFooter tmdbId={item.id} mediaType={mediaType} />
        </div>
      </section>

      {/* Cast Carousel - Full width, using unified MediaScroller */}
      {topCast.length > 0 && (
        <MediaScroller title="Top Cast" titleIcon={<Users className="h-5 w-5 text-brand" />}>
          {topCast.map((cast) => (
            <CastCard key={cast.id} cast={cast} />
          ))}
        </MediaScroller>
      )}
    </div>
  );
}
