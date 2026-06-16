"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Star, StarHalf } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getMediaPath } from "@/lib/utils";
import { RichTextBody } from "@/components/features/rich-text/rich-text-body";
import { ScopeBadge } from "@/components/features/discussion/scope-badge";
import { AttachmentImages } from "@/components/features/media/attachment-images";
import type { ReviewDTO } from "@/types/social";
import { scoreToStars } from "./star-rating-input";
import { ReviewLikeButton } from "./review-like-button";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

interface ReviewCardProps {
  review: ReviewDTO;
  className?: string;
}

/**
 * Read-only half-star display of a 1–10 canonical score (spec §E). Mirrors the
 * star-rating-input visuals but is non-interactive. Brand stars over a muted
 * track; semantic tokens only.
 */
function StarDisplay({ score }: { score: number }) {
  const stars = scoreToStars(score); // 0.5–5
  return (
    <div
      className="flex items-center"
      role="img"
      aria-label={`Rated ${stars} of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = stars - i; // 1 = full, 0.5 = half, ≤0 = empty
        return (
          <span key={i} className="relative inline-flex h-4 w-4 items-center justify-center">
            <Star className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
            {filled >= 1 ? (
              <Star className="absolute h-4 w-4 fill-brand text-brand" strokeWidth={1.5} />
            ) : filled >= 0.5 ? (
              <StarHalf className="absolute h-4 w-4 fill-brand text-brand" strokeWidth={1.5} />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** Expand/collapse wrapper for long review bodies (CSS line-clamp ~8 lines). */
function ReviewBody({ review }: { review: ReviewDTO }) {
  const [expanded, setExpanded] = useState(false);
  // Heuristic: only offer read-more when the body is long enough to plausibly
  // overflow the clamp. Avoids a useless toggle on short reviews.
  const canTruncate = review.body.length > 320 || review.body.split("\n").length > 8;

  return (
    <div className="space-y-1.5">
      <div className={cn(!expanded && canTruncate && "line-clamp-[8]")}>
        {/* Reviews carry no resolved entity-mention refs yet, so [[entity]]
            tokens fall back to their stored label (no thumbnail chip) — a
            documented fast-follow. @user / emoji / inline-[spoiler] render fully. */}
        <RichTextBody body={review.body} entityMentions={[]} idKey={review.id} />
      </div>
      {canTruncate && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-brand hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * Presentational review card (spec §E) — shared by the detail-page reviews
 * section and the public-profile reviews widget. The SECTION decides which
 * reviews reach the card (anon tier = NONE+PUBLISHED+public; gated reviews
 * arrive already-revealed), so there is NO whole-review spoiler shield here;
 * inline [spoiler] blocks self-gate via RichTextBody.
 */
export function ReviewCard({ review, className }: ReviewCardProps) {
  const date = new Date(review.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // On aggregate surfaces (the profile reviews widget) the review carries the
  // title it's about; lead with a clickable poster + title there, since the
  // author is already obvious. On a title's own detail page `media` is unset and
  // we keep the author header.
  const media = review.media;
  const mediaHref = media ? getMediaPath(media.mediaType, media.tmdbId, media.titleName) : null;

  return (
    <article className={cn("rounded-xl border bg-card p-4 space-y-3", className)}>
      <header className="flex items-start gap-2.5">
        {media && mediaHref ? (
          <Link
            href={mediaHref}
            prefetch={false}
            className="relative h-12 w-8 shrink-0 overflow-hidden rounded border border-border bg-muted"
          >
            {media.posterPath && (
              <Image
                src={`${TMDB_IMAGE_BASE}/w92${media.posterPath}`}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
                unoptimized
              />
            )}
          </Link>
        ) : (
          <Avatar className="size-8 shrink-0">
            {review.avatarUrl && (
              <AvatarImage src={review.avatarUrl} alt="" referrerPolicy="no-referrer" />
            )}
            <AvatarFallback className="text-xs font-medium">
              {review.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          {media && mediaHref ? (
            <Link
              href={mediaHref}
              prefetch={false}
              className="line-clamp-1 text-sm font-semibold transition-colors hover:text-brand"
            >
              {media.titleName}
            </Link>
          ) : review.username ? (
            <Link
              href={`/u/${review.username}`}
              prefetch={false}
              className="text-sm font-semibold hover:text-brand transition-colors"
            >
              {review.displayName}
            </Link>
          ) : (
            <span className="text-sm font-semibold">{review.displayName}</span>
          )}
          <p className="text-xs font-medium text-muted-foreground">
            {date}
            {review.editedAt && " · edited"}
            {review.seasonNumber !== null && ` · Season ${review.seasonNumber}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {review.score !== null && <StarDisplay score={review.score} />}
          {review.liked && (
            <Heart
              className="h-3.5 w-3.5 fill-brand text-brand"
              aria-label="Author loved this"
            />
          )}
        </div>
      </header>

      {review.spoilerScope !== "NONE" && (
        <ScopeBadge
          scope={review.spoilerScope}
          scopeSeason={review.scopeSeason}
          scopeEpisode={review.scopeEpisode}
        />
      )}

      {review.title && (
        <h3 className="text-base font-semibold leading-snug text-foreground">{review.title}</h3>
      )}

      <ReviewBody review={review} />

      {review.images.length > 0 && (
        <AttachmentImages images={review.images.slice(0, 4)} />
      )}

      <footer className="-ml-2 flex items-center">
        <ReviewLikeButton
          reviewId={review.id}
          initialLiked={review.likedByViewer}
          initialCount={review.likeCount}
        />
      </footer>
    </article>
  );
}
