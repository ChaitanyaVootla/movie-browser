import { cn } from "@/lib/utils";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";

/**
 * Letterboxd-style rating distribution. Our canonical score 1–10 maps exactly to
 * half-star buckets ½★…5★, so this is 10 bars. Each bar sits in a full-height
 * track, so the chart keeps a clear rectangular footprint and reads as a
 * distribution even at low rating counts (a bare set of bars looks like random
 * ticks when sparse — the track is the fix). Scale endpoints (½ / 5★) + per-bar
 * hover counts + the average called out beside it. Compact (not full-width on
 * desktop); server-rendered, zero JS, theme tokens only.
 */
export function RatingHistogram({
  histogram,
  className,
}: {
  histogram: RatingHistogramData;
  className?: string;
}) {
  const { buckets, average, total } = histogram;

  if (total === 0 || average === null) {
    return (
      <div className={cn("rounded-xl border bg-card px-3 py-2", className)}>
        <p className="text-xs text-muted-foreground">No ratings yet</p>
      </div>
    );
  }

  const scores = Array.from({ length: 10 }, (_, i) => i + 1); // ½★ … 5★
  const maxCount = Math.max(1, ...scores.map((s) => buckets[s] ?? 0));

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 rounded-xl border bg-card px-3 py-2",
        "w-full sm:w-auto",
        className
      )}
    >
      <div className="flex min-w-[8rem] flex-1 flex-col justify-center sm:min-w-[10rem]">
        <div className="flex h-10 items-end gap-[3px]">
          {scores.map((s) => {
            const count = buckets[s] ?? 0;
            const stars = s / 2;
            return (
              <div
                key={s}
                title={`${count} ${count === 1 ? "rating" : "ratings"} · ${stars}★`}
                data-testid="histogram-bar"
                className="relative h-full flex-1 overflow-hidden rounded-[1px] bg-muted/45"
              >
                {count > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-[1px] bg-brand"
                    style={{ height: `${Math.max(10, (count / maxCount) * 100)}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs leading-none text-muted-foreground">
          <span>½</span>
          <span>5★</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center border-l pl-3">
        <span className="text-2xl font-bold leading-none tracking-tight tabular-nums text-brand">
          {average.toFixed(1)}
        </span>
        <span className="mt-1 whitespace-nowrap text-xs font-medium text-muted-foreground">
          {total} {total === 1 ? "rating" : "ratings"}
        </span>
      </div>
    </div>
  );
}
