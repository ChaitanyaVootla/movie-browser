import { MessageSquareQuote } from "lucide-react";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getPublicReviews } from "@/server/actions/reviews";
import type { TrackedMediaType } from "@/types/social";
import { ReviewCard } from "./review-card";
import { OwnReviewSlot } from "./own-review-slot";

interface ReviewsSectionProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  className?: string;
}

/**
 * Detail-page reviews. Server-rendered list contains ONLY status=PUBLISHED,
 * isPrivate=false reviews — progress-independent and safe in edge-cached anon
 * HTML (§4.1.8). The viewer's own/pending review hydrates via OwnReviewSlot.
 */
export async function ReviewsSection({ mediaType, tmdbId, title, className }: ReviewsSectionProps) {
  const reviews = await getPublicReviews({ mediaType, tmdbId, limit: 12 });

  return (
    <section className={className}>
      <div className="px-4 md:px-8 lg:px-12 space-y-4">
        <SectionHeading icon={<MessageSquareQuote className="h-5 w-5 text-brand" />}>
          Reviews
        </SectionHeading>

        <OwnReviewSlot mediaType={mediaType} tmdbId={tmdbId} title={title} />

        {reviews.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reviews yet — be the first.</p>
        )}
      </div>
    </section>
  );
}
