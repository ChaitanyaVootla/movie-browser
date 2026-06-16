import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Clapperboard,
  Clock,
  Flame,
  Heart,
  ListChecks,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  Quote,
  Repeat,
  Star,
  Tv,
  UserPlus,
} from "lucide-react";
import { BreakdownBars, Histogram } from "@/components/features/stats/bar-charts";
import { ReviewCard } from "@/components/features/reviews/review-card";
import { episodeCode } from "@/lib/tracking-format";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { WidgetCard, StatTile } from "./widget-card";
import { CountryMapWidget } from "./country-map";
import { WatchActivityWidget } from "./watch-activity";
import type { ProfileWidgetData, WidgetType } from "./types";

type RenderFn = (props: { data: ProfileWidgetData; config?: Record<string, unknown> }) => ReactNode;

function PosterBoard({ data, config }: { data: ProfileWidgetData; config?: Record<string, unknown> }) {
  const limit = typeof config?.limit === "number" ? config.limit : 4;
  const items = data.fourFavorites.slice(0, limit);
  if (items.length === 0) return null;
  return (
    <WidgetCard title="Favorites" icon={<Star className="h-4 w-4" />}>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, i) => (
          <Link
            key={`${item.mediaType}-${item.tmdbId}`}
            href={getMediaPath(item.mediaType, item.tmdbId, item.title)}
            prefetch={false}
            className="group"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted ring-1 ring-transparent transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-brand/60">
              {item.posterPath && (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w342${item.posterPath}`}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width:768px) 22vw, 120px"
                />
              )}
              <span className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/70 text-[9px] font-bold text-white backdrop-blur-sm">
                {i + 1}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}

export const WIDGET_RENDER: Record<WidgetType, RenderFn> = {
  "stat.films": ({ data }) => (
    <StatTile icon={<Clapperboard className="h-4 w-4" />} value={data.counts.filmsWatched} label="Films" />
  ),
  "stat.episodes": ({ data }) => (
    <StatTile icon={<Tv className="h-4 w-4" />} value={data.counts.episodesWatched} label="Episodes" />
  ),
  "stat.hours": ({ data }) => (
    <StatTile icon={<Clock className="h-4 w-4" />} value={data.counts.hoursWatched} label="Hours" />
  ),
  "stat.streak": ({ data }) => (
    <StatTile icon={<Flame className="h-4 w-4" />} value={data.longestStreakDays} label="Day streak" />
  ),
  "stat.rewatches": ({ data }) => (
    <StatTile icon={<Repeat className="h-4 w-4" />} value={data.rewatchCount} label="Rewatches" />
  ),
  "stat.following": ({ data }) => (
    <StatTile icon={<UserPlus className="h-4 w-4" />} value={data.counts.following} label="Following" />
  ),

  "chart.ratings": ({ data }) =>
    data.ratingsHistogram.some((n) => n > 0) ? (
      <WidgetCard title="Ratings" icon={<Star className="h-4 w-4" />}>
        <Histogram counts={data.ratingsHistogram} />
      </WidgetCard>
    ) : null,
  "chart.genres": ({ data }) =>
    data.topGenres.length > 0 ? (
      <WidgetCard title="Top genres">
        <BreakdownBars data={data.topGenres.slice(0, 6)} />
      </WidgetCard>
    ) : null,
  "chart.decades": ({ data }) =>
    data.topDecades.length > 0 ? (
      <WidgetCard title="Decades">
        <BreakdownBars data={data.topDecades.slice(0, 6)} />
      </WidgetCard>
    ) : null,
  "chart.countries": ({ data }) => <CountryMapWidget data={data} />,
  "chart.activity": ({ data }) =>
    data.dailyActivity.some((d) => d.count > 0) || data.recentWatches.length > 0 ? (
      <WatchActivityWidget data={data} />
    ) : null,

  "showcase.favorites": PosterBoard,
  "showcase.watching": ({ data }) =>
    data.currentlyWatching.length > 0 ? (
      <WidgetCard title="Currently watching" icon={<Tv className="h-4 w-4" />}>
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {data.currentlyWatching.map((item) => (
            <Link
              key={item.seriesId}
              href={getMediaPath("series", item.seriesId, item.seriesName)}
              prefetch={false}
              className="group w-16 flex-shrink-0"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted ring-1 ring-transparent transition-all duration-300 group-hover:ring-2 group-hover:ring-brand/60">
                {item.posterPath && (
                  <Image src={`${TMDB_IMAGE_BASE}/w185${item.posterPath}`} alt={item.seriesName} fill className="object-cover" sizes="64px" />
                )}
                {item.seasonNumber !== null && item.episodeNumber !== null && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-white">
                    {episodeCode(item.seasonNumber, item.episodeNumber)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </WidgetCard>
    ) : null,
  "showcase.lists": ({ data }) =>
    data.pinnedLists.length > 0 ? (
      <WidgetCard title="Lists" icon={<ListChecks className="h-4 w-4" />}>
        <div className="space-y-2">
          {data.pinnedLists.slice(0, 3).map((list) => (
            <Link
              key={list.id}
              href={`/u/${data.username}/list/${list.slug}`}
              prefetch={false}
              className="group flex items-center gap-2.5"
            >
              <div className="flex -space-x-3">
                {list.posterPaths.slice(0, 3).map((path, i) => (
                  <div key={i} className="relative h-12 w-8 overflow-hidden rounded border border-border bg-muted" style={{ zIndex: 3 - i }}>
                    <Image src={`${TMDB_IMAGE_BASE}/w92${path}`} alt="" fill className="object-cover" sizes="32px" />
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium transition-colors group-hover:text-brand">{list.name}</p>
                <p className="text-xs font-medium text-muted-foreground">{list.itemCount} titles</p>
              </div>
            </Link>
          ))}
        </div>
      </WidgetCard>
    ) : null,
  "showcase.reviews": ({ data }) =>
    data.reviews.length > 0 ? (
      <WidgetCard title="Reviews" icon={<MessageSquareQuote className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.slice(0, 6).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </WidgetCard>
    ) : null,
  "showcase.discussions": ({ data }) =>
    data.discussions.length > 0 ? (
      <WidgetCard title="Discussions" icon={<MessagesSquare className="h-4 w-4" />}>
        <ul className="space-y-1">
          {data.discussions.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link
                href={c.href}
                prefetch={false}
                className="group -mx-2 flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
              >
                <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                  {c.posterPath && (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w92${c.posterPath}`}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="truncate text-foreground transition-colors group-hover:text-brand">
                      {c.titleName}
                    </span>
                    {c.seasonNumber !== null && c.episodeNumber !== null && (
                      <span className="flex-shrink-0">· {episodeCode(c.seasonNumber, c.episodeNumber)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-foreground/90">{c.snippet}</p>
                  <p className="mt-1 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                    <span>
                      {new Date(c.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {c.likeCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {c.likeCount}
                      </span>
                    )}
                    {c.replyCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {c.replyCount}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </WidgetCard>
    ) : null,

  "text.note": ({ config }) => {
    const text = typeof config?.text === "string" ? config.text.trim() : "";
    if (!text) return null;
    return (
      <WidgetCard>
        <div className="flex h-full items-center gap-3">
          <Quote className="h-5 w-5 flex-shrink-0 text-brand" />
          <p className="text-sm leading-relaxed text-foreground">{text}</p>
        </div>
      </WidgetCard>
    );
  },
};
