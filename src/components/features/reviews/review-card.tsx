import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewDTO } from "@/types/social";
import { SpoilerShield } from "./spoiler-shield";

interface ReviewCardProps {
  review: ReviewDTO;
  className?: string;
}

/**
 * Presentational review card — server-renderable (cache-safe: callers must
 * pass PUBLISHED + public reviews only on cached surfaces).
 */
export function ReviewCard({ review, className }: ReviewCardProps) {
  const date = new Date(review.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const body = (
    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground line-clamp-[12]">
      {review.body}
    </p>
  );

  return (
    <article className={cn("rounded-xl border bg-card p-4 space-y-3", className)}>
      <header className="flex items-center gap-2.5">
        <Avatar className="size-8">
          {review.avatarUrl && <AvatarImage src={review.avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="text-xs font-medium">
            {review.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          {review.username ? (
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
        {review.score !== null && (
          <Badge className="rounded-full bg-brand/15 text-brand border-brand/30">
            {review.score}/10
          </Badge>
        )}
      </header>
      {review.containsSpoilers ? <SpoilerShield>{body}</SpoilerShield> : body}
    </article>
  );
}
