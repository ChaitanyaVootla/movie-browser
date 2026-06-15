import { cn } from "@/lib/utils";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";

/**
 * Per-title rating distribution: a prominent average + a compact 1→10 bar
 * breakdown. Server-rendered, zero JS, theme-token colors. Purely
 * presentational — no interactivity.
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
      <div className={cn("rounded-xl border bg-card p-4", className)}>
        <p className="text-sm text-muted-foreground">No ratings yet</p>
      </div>
    );
  }

  // Scores 1..10, descending so the top of the chart is the highest score.
  const scores = Array.from({ length: 10 }, (_, i) => 10 - i);
  const maxCount = Math.max(1, ...scores.map((s) => buckets[s] ?? 0));

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight tabular-nums">
          {average?.toFixed(1) ?? "—"}
        </span>
        <span className="text-sm font-medium text-muted-foreground">/10</span>
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {total} {total === 1 ? "rating" : "ratings"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {scores.map((score) => {
          const count = buckets[score] ?? 0;
          return (
            <div key={score} className="flex items-center gap-2">
              <span className="w-5 flex-shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {score}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  data-testid="histogram-bar"
                  className="h-full rounded-full bg-brand/70"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-7 flex-shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
