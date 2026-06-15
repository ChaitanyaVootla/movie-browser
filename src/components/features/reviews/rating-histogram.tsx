import { cn } from "@/lib/utils";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";

/**
 * Compact per-title rating summary: the average + a small 1→10 mini bar-chart +
 * the rating count, as an inline pill that sits BESIDE the tabs (it does NOT
 * take the full width). Server-rendered, zero JS, theme tokens only. Each bar
 * carries a `title` so the per-score breakdown is available on hover without
 * spending vertical space.
 */
export function RatingHistogram({
  histogram,
  className,
}: {
  histogram: RatingHistogramData;
  className?: string;
}) {
  const { buckets, average, total } = histogram;

  if (total === 0) {
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

  // Scores 1..10, left→right. Bar height ∝ share of the busiest bucket.
  const scores = Array.from({ length: 10 }, (_, i) => i + 1);
  const maxCount = Math.max(1, ...scores.map((s) => buckets[s] ?? 0));

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-lg border bg-card px-3 py-1.5",
        className
      )}
    >
      <div className="flex items-baseline gap-0.5">
        <span className="text-2xl font-bold leading-none tracking-tight tabular-nums">
          {average?.toFixed(1) ?? "—"}
        </span>
        <span className="text-xs font-medium text-muted-foreground">/10</span>
      </div>

      <div className="flex h-7 items-end gap-px" aria-hidden>
        {scores.map((score) => {
          const count = buckets[score] ?? 0;
          // count>0 gets a visible minimum; empty buckets show a faint baseline.
          const heightPct = count > 0 ? Math.max(14, (count / maxCount) * 100) : 6;
          return (
            <div
              key={score}
              data-testid="histogram-bar"
              title={`${score}: ${count}`}
              className={cn("w-[3px] rounded-full", count > 0 ? "bg-brand/70" : "bg-muted")}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>

      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        {total} {total === 1 ? "rating" : "ratings"}
      </span>
    </div>
  );
}
