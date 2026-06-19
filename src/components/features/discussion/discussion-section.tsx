import type { ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { prisma, Prisma } from "@/server/db/postgres";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getLockedCommentCount, getPublicCommentPage } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentListClient } from "./comment-list-client";
import { WebReactions } from "./web-reactions";

interface DiscussionSectionProps {
  anchor: DiscussionAnchor;
  /** spoiler-free AI questions/themes for starters (from the page's cached getAIData) */
  starters: string[];
  className?: string;
  children?: ReactNode; // e.g. episode-thread links on series pages
  /** Cap rendered roots; when set, a "View all →" link appears instead of "Show more". */
  viewAllHref?: string;
  previewLimit?: number;
}

/**
 * Detail-page discussion section. EVERYTHING rendered here server-side is
 * progress-independent (anon tier + locked count + web reactions) — safe for
 * ISR + CloudFront (spec invariant 8). The gated tier hydrates client-side.
 * No dynamic APIs (headers/cookies) — keep it that way or ISR dies for the
 * whole route (performance.md recipe item 3).
 */
export async function DiscussionSection({
  anchor,
  starters,
  className,
  children,
  viewAllHref,
  previewLimit,
}: DiscussionSectionProps) {
  const [initialPage, lockedCount, topVideo] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    prisma.video.findFirst({
      where: {
        ...(anchor.type === "movie" ? { movieId: anchor.movieId } : { seriesId: anchor.seriesId }),
        topComments: { not: Prisma.DbNull },
      },
      orderBy: { viewCount: "desc" },
      select: { topComments: true },
    }),
  ]);

  return (
    <section className={className} id="discussion">
      <div className="px-4 md:px-8 lg:px-12 space-y-5">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5" />}>Discussion</SectionHeading>
        {children}
        {topVideo?.topComments != null && <WebReactions raw={topVideo.topComments} />}
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={starters}
          defaultScope="NONE"
          previewLimit={previewLimit ?? 3}
          viewAllHref={viewAllHref}
        />
      </div>
    </section>
  );
}
