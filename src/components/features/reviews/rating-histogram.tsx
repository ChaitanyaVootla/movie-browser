import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";

/**
 * Compact per-title rating summary: read-only stars (from the average) + the
 * numeric average + the rating count, as an inline pill beside the tabs. A
 * per-score bar chart reads as noise at low rating counts, so we show the
 * at-a-glance star summary instead (a full distribution belongs on a richer
 * surface). Server-rendered, zero JS, theme tokens only.
 */
export function RatingHistogram({
  histogram,
  className,
}: {
  histogram: RatingHistogramData;
  className?: string;
}) {
  const { average, total } = histogram;

  if (total === 0 || average === null) {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-lg border bg-card px-3 py-1.5",
          className
        )}
      >
        <span className="text-xs text-muted-foreground">No ratings yet</span>
      </div>
    );
  }

  const stars = average / 2; // canonical 1–10 → 0–5 stars

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5",
        className
      )}
    >
      <div
        className="flex items-center gap-px"
        role="img"
        aria-label={`Average rating ${average.toFixed(1)} out of 10`}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = stars - i; // 1 = full, 0.5 = half, ≤0 = empty
          return (
            <span key={i} className="relative inline-flex h-3.5 w-3.5">
              <Star className="h-3.5 w-3.5 text-muted-foreground/30" strokeWidth={1.5} />
              {fill >= 1 ? (
                <Star className="absolute h-3.5 w-3.5 fill-brand text-brand" strokeWidth={1.5} />
              ) : fill >= 0.5 ? (
                <StarHalf className="absolute h-3.5 w-3.5 fill-brand text-brand" strokeWidth={1.5} />
              ) : null}
            </span>
          );
        })}
      </div>
      <span className="text-sm font-semibold tabular-nums">{average.toFixed(1)}</span>
      <span className="text-xs font-medium text-muted-foreground">/10</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        {total} {total === 1 ? "rating" : "ratings"}
      </span>
    </div>
  );
}
