"use client";

import { useEffect, useState } from "react";
import { MessagesSquare, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getAnchorActivity } from "@/server/actions/discussion-reads";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

interface Props {
  anchor: DiscussionAnchor;
  /** Cacheable baseline label rendered first (SSR); upgraded after hydration. */
  baselineLabel: string;
  anchorJumpHref: string; // "#discussion"
  dedicatedHref: string;
}

/**
 * Viewer upgrade (spec §4): after hydration, replace the cacheable baseline with
 * "N new since you watched" when the signed-in viewer has unread visible comments.
 * Fetched via a server-action POST — never edge-cached.
 */
export function DiscussionEntryStripClient({ anchor, baselineLabel, anchorJumpHref, dedicatedHref }: Props) {
  const [label, setLabel] = useState(baselineLabel);

  useEffect(() => {
    let active = true;
    void getAnchorActivity({ anchor }).then((res) => {
      if (!active || !res.signedIn) return;
      if (res.newSinceLastSeen > 0) {
        setLabel(`${res.newSinceLastSeen} new since you watched`);
      } else if (res.publishedCount > 0) {
        setLabel(`${res.publishedCount} ${res.publishedCount === 1 ? "comment" : "comments"}`);
      }
    });
    return () => {
      active = false;
    };
  }, [anchor]);

  return (
    <Link
      href={anchorJumpHref}
      className="group flex items-center gap-2 rounded-full border border-border bg-card/40 px-4 py-2 text-sm transition-colors hover:bg-card/70 min-h-10"
      data-discussion-strip
    >
      <MessagesSquare className="h-4 w-4 text-brand shrink-0" />
      <span className="font-medium text-foreground">{label}</span>
      <Link
        href={dedicatedHref}
        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        View all <ArrowRight className="h-3 w-3" />
      </Link>
    </Link>
  );
}
