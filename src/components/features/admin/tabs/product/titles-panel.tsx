"use client";

/**
 * Titles panel — the six per-title conversion metrics, rendered for the first
 * time.
 *
 * `getItemAnalytics` has computed `watchlistAdds`, `watchlistRemoves`,
 * `ratingLikes`, `ratingDislikes`, `watchClicks` and `trailerPlays` since the
 * analytics module was written, and not one of them appeared anywhere in the UI.
 * This is the cross-catalog view of the same six.
 *
 * Ordered by ACTIONS, not views. Ranking by views answers "what did crawlers
 * fetch" — measured on prod, the top rows by view count are empty per-episode
 * discussion shells with zero actions against them. Ranking by actions answers
 * the question the tab exists for.
 */

import {
  Clapperboard,
  Flame,
  type LucideIcon,
  Minus,
  Play,
  Plus,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, abbreviateNumber } from "../../analytics-shared";
import type { ProductTitlesData, TitleConversion, TopTitle } from "../../analytics-types";

interface TitlesPanelProps {
  data: ProductTitlesData | undefined;
  isLoading: boolean;
}

export function TitlesPanel({ data, isLoading }: TitlesPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Flame className="h-4 w-4" />
            Per-title conversion
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.conversion && data.conversion.length > 0 ? (
            <ConversionTable rows={data.conversion} />
          ) : (
            <EmptyState
              message="No title actions in this range"
              height={140}
              icon={Clapperboard}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clapperboard className="h-4 w-4" />
            Most-viewed titles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : data?.topTitles && data.topTitles.length > 0 ? (
            <TopTitlesTable rows={data.topTitles} />
          ) : (
            <EmptyState message="No title views in this range" height={140} icon={Clapperboard} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Conversion table
// =============================================================================

/**
 * `null` means "no denominator", not "zero" — a title can carry actions with no
 * view rows at all, because `page_views` is written at the ORIGIN and a
 * CloudFront edge HIT never reaches it while the action's client beacon still
 * does. Rendering that as "0%" would assert something false.
 */
function formatRate(actingSessions: number, visitors: number): string {
  if (visitors <= 0) return "—";
  return `${((actingSessions / visitors) * 100).toFixed(0)}%`;
}

/**
 * The six metrics, in the order they matter for reading a title's funnel.
 *
 * Keyed to the NUMERIC fields only (`NumericTitleField`), not `keyof
 * TitleConversion` — the latter would also admit `title`/`mediaType`, and
 * `Number("Fight Dirty")` is `NaN` rendered as "NaN" with no type error.
 */
type NumericTitleField = {
  [K in keyof TitleConversion]: TitleConversion[K] extends number ? K : never;
}[keyof TitleConversion];

const ACTION_COLUMNS: ReadonlyArray<{
  key: NumericTitleField;
  icon: LucideIcon;
  label: string;
}> = [
  { key: "watchlistAdds", icon: Plus, label: "Watchlist adds" },
  { key: "watchClicks", icon: Play, label: "Watch clicks" },
  { key: "trailerPlays", icon: Clapperboard, label: "Trailer plays" },
  { key: "ratingLikes", icon: ThumbsUp, label: "Likes" },
  { key: "ratingDislikes", icon: ThumbsDown, label: "Dislikes" },
  { key: "watchlistRemoves", icon: Minus, label: "Watchlist removes" },
];

function ConversionTable({ rows }: { rows: TitleConversion[] }) {
  const max = Math.max(...rows.map((r) => r.totalActions), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={`${row.mediaType}-${row.itemId}`} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-foreground/90">{row.title}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.mediaType}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground">
                {row.actingSessions.toLocaleString()} of{" "}
                {row.visitors > 0 ? row.visitors.toLocaleString() : "—"} visitors
              </span>
              <span className="w-10 text-right font-medium">
                {formatRate(row.actingSessions, row.visitors)}
              </span>
            </span>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${(row.totalActions / max) * 100}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {ACTION_COLUMNS.filter((col) => row[col.key] > 0).map((col) => {
              const Icon = col.icon;
              return (
                <span
                  key={col.key}
                  title={col.label}
                  className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {row[col.key].toLocaleString()}
                </span>
              );
            })}
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {abbreviateNumber(row.views)} views
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Top titles table
// =============================================================================

function TopTitlesTable({ rows }: { rows: TopTitle[] }) {
  const max = Math.max(...rows.map((r) => r.views), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={`${row.mediaType}-${row.itemId}`} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-foreground/90">{row.title}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.mediaType}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground">
                {row.visitors.toLocaleString()} visitors
              </span>
              <span className="w-14 text-right font-medium">{row.views.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${(row.views / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
