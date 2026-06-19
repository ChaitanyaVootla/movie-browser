import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getPublicReviews, getReviewHistogram } from "@/server/actions/reviews";
import type { TrackedMediaType } from "@/types/social";
import { OwnReviewSlot } from "./own-review-slot";
import { ReviewsClient } from "./reviews-client";

interface ReviewsSectionProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  seasonNumber?: number;
  /**
   * Available season numbers (series only) — enables the client season
   * selector so a viewer can scope reviews to one season. Title-level
   * ("All") stays the SSR default. Omit for movies / single-season series.
   */
  seasons?: number[];
  className?: string;
}

/**
 * Detail-page reviews (spec §E). EDGE-CACHE SAFE: this server tree contains NO
 * viewer data — none of Next's dynamic request APIs (auth, headers, cookies)
 * are called anywhere in it or its children.
 *
 * The SSR HTML carries only the anon-cacheable tier:
 *  - the rating histogram (aggregate over user_ratings, no viewer state), and
 *  - the anon Popular page from getPublicReviews (hard-filtered to spoilerScope
 *    NONE + status PUBLISHED + public — §4.1.8).
 *
 * All viewer-specific tiers (Following tab, progress-gated spoiler reviews,
 * per-viewer like state) and the viewer's own/pending/private review hydrate
 * CLIENT-SIDE via server actions (POSTs, never edge-cached): ReviewsClient owns
 * the tabs/gated/likes; OwnReviewSlot owns the viewer's own review.
 */
export async function ReviewsSection({
  mediaType,
  tmdbId,
  title,
  seasonNumber,
  seasons,
  className,
}: ReviewsSectionProps) {
  // No auth / headers / cookies — both reads are viewer-agnostic.
  const [histogram, anonPopular] = await Promise.all([
    getReviewHistogram({ mediaType, tmdbId, seasonNumber }),
    getPublicReviews({ mediaType, tmdbId, seasonNumber, limit: 12 }),
  ]);

  return (
    <section id="reviews" className={cn("scroll-mt-20", className)}>
      <div className="px-4 md:px-8 lg:px-12 space-y-4">
        <SectionHeading icon={<MessageSquareQuote className="h-5 w-5 text-brand" />}>
          Reviews
        </SectionHeading>

        {/* Viewer's own review — client island, never in cacheable HTML. */}
        <OwnReviewSlot
          mediaType={mediaType}
          tmdbId={tmdbId}
          title={title}
          seasonNumber={seasonNumber}
        />

        {/* Histogram + season selector + tabs + gated/spoiler/Following/likes —
            client island seeded with the SSR title-level histogram and anon
            Popular set (SEO + instant paint, edge-cache safe). The season
            selector and viewer tiers re-fetch via server-action POSTs. */}
        <ReviewsClient
          mediaType={mediaType}
          tmdbId={tmdbId}
          seasonNumber={seasonNumber}
          initialReviews={anonPopular}
          initialHistogram={histogram}
          seasons={seasons}
        />
      </div>
    </section>
  );
}
