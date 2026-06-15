"use client";

import { useState } from "react";
import { Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommentDto, CommentPageDto } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentThread } from "./comment-item";
import { CommentListClient } from "./comment-list-client";

type SortTab = "trending" | "latest";

interface Props {
  anchor: DiscussionAnchor;
  /** Anon-tier roots, server-fetched per sort (spec invariant 1: cacheable). */
  trending: CommentDto[];
  latest: CommentDto[];
  /**
   * When both lists are empty, render the full posting experience (composer +
   * inviting empty state with starter chips + web reactions) via CommentListClient
   * instead of a bare "be the first" line. Provided by the dedicated page.
   */
  emptyState?: {
    initialPage: CommentPageDto;
    lockedCount: number;
    starters: string[];
    webReactionsRaw?: unknown;
  };
}

/**
 * Activity-first list for the series/movie dedicated page (spec §2/§3). Tabs swap
 * between two PRE-COMPUTED anon-tier lists (no viewer data in cacheable HTML).
 * Gated comments + scope filters that need the viewer hydrate via the existing
 * CommentListClient on the inline section — this list is the SEO/anon surface.
 *
 * When the public tier is empty we hand off to CommentListClient so a cold thread
 * still gets a composer + inviting starter prompts (which seed it) + web reactions,
 * rather than reading as a dead end.
 */
export function TrendingCommentList({ anchor, trending, latest, emptyState }: Props) {
  const [tab, setTab] = useState<SortTab>("trending");
  const list = tab === "trending" ? trending : latest;

  // Cold thread: no public comments in either sort. Surface the full posting +
  // inviting empty experience instead of the tab strip.
  if (trending.length === 0 && latest.length === 0 && emptyState) {
    return (
      <CommentListClient
        anchor={anchor}
        initialPage={emptyState.initialPage}
        lockedCount={emptyState.lockedCount}
        starters={emptyState.starters}
        defaultScope="NONE"
        richEmptyState
        webReactionsRaw={emptyState.webReactionsRaw}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-full border border-border p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("trending")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm min-h-10",
            tab === "trending" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
          )}
        >
          <Flame className="h-4 w-4" /> Trending
        </button>
        <button
          type="button"
          onClick={() => setTab("latest")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm min-h-10",
            tab === "latest" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
          )}
        >
          <Clock className="h-4 w-4" /> Latest
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public discussion yet — be the first.</p>
      ) : (
        <div className="space-y-5">
          {list.map((c) => (
            <CommentThread
              key={c.id}
              thread={{ ...c, replies: [], replyCount: 0 }}
              anchor={anchor}
              viewerId={null}
              canInteract={false}
              onChanged={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
