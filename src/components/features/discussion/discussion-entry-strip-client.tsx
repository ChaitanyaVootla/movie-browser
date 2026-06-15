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
 *
 * Layout note: the "jump to #discussion" affordance is a <button> (NOT an
 * anchor) so the dedicated-page <Link> can sit beside it as a SIBLING — nesting
 * one anchor inside another is invalid HTML (broken tap target + hydration
 * warning).
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

  const jumpToDiscussion = () => {
    const id = anchorJumpHref.replace(/^#/, "");
    const target = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Reflect the anchor in the URL without a full navigation.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", anchorJumpHref);
    }
  };

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 transition-colors hover:border-brand/40 hover:bg-card min-h-12">
      {/* Primary affordance: open the full thread on the dedicated page. */}
      <Link
        href={dedicatedHref}
        className="flex flex-1 items-center gap-3 min-h-10"
        data-discussion-strip
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessagesSquare className="h-[18px] w-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">Spoiler-safe discussion</span>
        </span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand" />
      </Link>
      {/* Secondary: jump to the inline thread further down the page. */}
      <button
        type="button"
        onClick={jumpToDiscussion}
        className="hidden shrink-0 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex min-h-9"
      >
        On this page
      </button>
    </div>
  );
}
