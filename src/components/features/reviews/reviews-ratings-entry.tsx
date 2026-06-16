import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { getReviewHistogram, getPublicReviewCount } from "@/server/actions/reviews";
import { formatCompactCount } from "@/lib/tracking-format";
import type { TrackedMediaType } from "@/types/social";

interface Props {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  /** CTA target — the on-page Reviews section (#reviews) or a dedicated page. */
  href: string;
  className?: string;
}

/**
 * Cacheable detail-page REVIEWS & RATINGS entry — the peer of the discussion
 * entry strip, elevating reviews/ratings to the same prominence near the hero
 * (spec §4.3). One opinion axis: the histogram is the quantitative signal (all
 * raters), reviews the written subset. EDGE-CACHE SAFE: both reads are
 * viewer-agnostic (no auth/headers/cookies); the histogram + counts are the
 * anon-cacheable tier. Both actions degrade gracefully (empty / 0) on error.
 */
export async function ReviewsRatingsEntry({ mediaType, tmdbId, seasonNumber, href, className }: Props) {
  const [histogram, reviewCount] = await Promise.all([
    getReviewHistogram({ mediaType, tmdbId, seasonNumber }),
    getPublicReviewCount({ mediaType, tmdbId, seasonNumber }),
  ]);
  const { buckets, average, total } = histogram;

  // Threshold (avoid negative social proof): nothing to show → inviting CTA.
  if (total === 0 && reviewCount === 0) {
    return (
      <div className={className}>
        <Link
          href={href}
          className="group flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 transition-colors hover:border-brand/40 hover:bg-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Star className="h-[18px] w-[18px]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">Rate &amp; review</span>
            <span className="text-xs text-muted-foreground">Be the first to weigh in</span>
          </span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand" />
        </Link>
      </div>
    );
  }

  const max = Math.max(1, ...Object.values(buckets));

  return (
    <div className={className}>
      <Link
        href={href}
        aria-label={`${total.toLocaleString()} ratings, ${reviewCount.toLocaleString()} reviews`}
        className="group block overflow-hidden rounded-2xl border border-border bg-card/60 transition-colors hover:border-brand/40 hover:bg-card"
      >
        {/* Header: the rating distribution (the quantitative signal). */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
          <div className="flex flex-col">
            <span className="text-2xl font-bold leading-none text-foreground tabular-nums">
              {average != null ? average.toFixed(1) : "—"}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">out of 10</span>
          </div>
          {/* Mini histogram (1..10) in TRUE brand — community data viz, not --sig. */}
          <div className="flex h-9 flex-1 items-end gap-[3px]" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
              <span
                key={s}
                className="flex-1 rounded-sm bg-brand/80"
                style={{ height: `${Math.max(6, (buckets[s] / max) * 100)}%` }}
              />
            ))}
          </div>
        </div>

        {/* Footer CTA — counts (avg shown once above, not repeated). */}
        <div className="flex items-center gap-2 border-t border-border/60 bg-background/30 px-4 py-2.5 text-xs font-medium">
          <Star className="h-4 w-4 shrink-0 fill-brand text-brand" aria-hidden />
          <span className="text-foreground">{formatCompactCount(total)} ratings</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-foreground">{formatCompactCount(reviewCount)} reviews</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-brand">Read &amp; rate</span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </div>
      </Link>
    </div>
  );
}
