import { getAnchorPublicSummary } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { discussionsHref } from "./discussion-entry-strip-href";
import { DiscussionEntryStripClient } from "./discussion-entry-strip-client";

interface Props {
  anchor: DiscussionAnchor;
  title: string | null;
  className?: string;
}

/**
 * Cacheable entry-point strip (spec §2/§4). Server-renders the adaptive baseline
 * (no viewer data — safe in ISR HTML); the client island upgrades it to
 * "N new since you watched" after hydration.
 */
export async function DiscussionEntryStrip({ anchor, title, className }: Props) {
  const baseline = await getAnchorPublicSummary(anchor);
  return (
    <div className={className}>
      <DiscussionEntryStripClient
        anchor={anchor}
        baselineLabel={baseline.label}
        anchorJumpHref="#discussion"
        dedicatedHref={discussionsHref(anchor, title)}
      />
    </div>
  );
}
