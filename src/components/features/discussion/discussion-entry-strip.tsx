import { getTopPublicComments, getPublishedCommentCount } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { discussionsHref } from "./discussion-entry-strip-href";
import { CommentPeek } from "./comment-peek";

interface Props {
  anchor: DiscussionAnchor;
  title: string | null;
  className?: string;
}

/**
 * Cacheable detail-page discussion entry point (spec §2/§4). Server-renders a
 * COMMENT PEEK: the top 1–3 PUBLIC comments (anon tier — PUBLISHED + NONE-scope +
 * circle-NULL) as plain-text teasers, plus the published count. All data is
 * viewer-agnostic, so this is safe in ISR/edge-cached HTML (no viewer state, no
 * `auth()`/`headers()`). The client `CommentPeek` island only auto-cycles
 * between the pre-rendered peeks and links to the dedicated discussions page.
 *
 * Replaces the old "N new since you watched" read-cursor surfacing — that infra
 * (`getAnchorActivity` / `CommentRead`) stays in place but is no longer used here.
 */
export async function DiscussionEntryStrip({ anchor, title, className }: Props) {
  const [peeks, publishedCount] = await Promise.all([
    getTopPublicComments(anchor, 3),
    getPublishedCommentCount(anchor),
  ]);
  return (
    <div className={className}>
      <CommentPeek
        peeks={peeks}
        publishedCount={publishedCount}
        dedicatedHref={discussionsHref(anchor, title)}
      />
    </div>
  );
}
