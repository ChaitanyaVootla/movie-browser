"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadComments } from "@/server/actions/comment-reads";
import type { CommentPageDto } from "@/server/db/postgres/comments";
import type {
  CommentCursor,
  DiscussionAnchor,
  SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { CommentComposer } from "./comment-composer";
import { CommentThread } from "./comment-item";
import { DiscussionStarters } from "./discussion-starters";
import { LockedTeaser } from "./locked-teaser";

interface CommentListClientProps {
  anchor: DiscussionAnchor;
  /** Anon tier (NONE-scope only) — rendered into the cacheable HTML */
  initialPage: CommentPageDto;
  lockedCount: number;
  starters: string[];
  defaultScope?: SpoilerScopeValue;
  defaultScopeSeason?: number | null;
  defaultScopeEpisode?: number | null;
  /** Cap rendered roots + show a "View all →" link instead of "Show more". */
  previewLimit?: number;
  viewAllHref?: string;
}

/**
 * Two-tier list (spec invariant 8): the SSR pass renders ONLY the
 * progress-independent anon tier passed as props; after hydration, signed-in
 * viewers refetch the gated tier via a server action POST (never edge-cached).
 * `viewerId` is unknown until that fetch (the session carries only the OAuth
 * sub), so ownership controls only appear after the gated tier loads.
 */
export function CommentListClient({
  anchor,
  initialPage,
  lockedCount,
  starters,
  defaultScope = "NONE",
  defaultScopeSeason = null,
  defaultScopeEpisode = null,
  previewLimit,
  viewAllHref,
}: CommentListClientProps) {
  const { status } = useSession();
  const [page, setPage] = useState<CommentPageDto>(initialPage);
  const [extraPages, setExtraPages] = useState<CommentPageDto[]>([]);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [seed, setSeed] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const signedIn = status === "authenticated";

  const refresh = useCallback(() => {
    void loadComments({ anchor, cursor: null }).then((fresh) => {
      setPage({ roots: fresh.roots, nextCursor: fresh.nextCursor });
      setViewerId(fresh.viewerId);
      setExtraPages([]);
    });
  }, [anchor]);

  // Upgrade anon tier → gated tier once we know the viewer is signed in.
  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  const allRoots = [...page.roots, ...extraPages.flatMap((p) => p.roots)];
  const visibleRoots = previewLimit ? allRoots.slice(0, previewLimit) : allRoots;
  const lastCursor: CommentCursor | null =
    extraPages.length > 0 ? extraPages[extraPages.length - 1].nextCursor : page.nextCursor;

  const loadMore = async () => {
    if (!lastCursor) return;
    setLoadingMore(true);
    const next = await loadComments({ anchor, cursor: lastCursor });
    setExtraPages((prev) => [...prev, { roots: next.roots, nextCursor: next.nextCursor }]);
    setLoadingMore(false);
  };

  return (
    <div className="space-y-5">
      {signedIn ? (
        <CommentComposer
          key={seed} // re-mount to apply starter seed text
          anchor={anchor}
          seedText={seed}
          defaultScope={defaultScope}
          defaultScopeSeason={defaultScopeSeason}
          defaultScopeEpisode={defaultScopeEpisode}
          onPublished={refresh}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Sign in to join the discussion — comments are spoiler-gated to your watch progress.
        </p>
      )}

      {allRoots.length === 0 && <DiscussionStarters prompts={starters} onPick={setSeed} />}
      {!signedIn && <LockedTeaser count={lockedCount} mediaType={anchor.type} />}

      <div className="space-y-5">
        {visibleRoots.map((thread) => (
          <CommentThread
            key={thread.id}
            thread={thread}
            anchor={anchor}
            viewerId={viewerId}
            canInteract={signedIn}
            onChanged={refresh}
          />
        ))}
      </div>

      {viewAllHref ? (
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={viewAllHref}>View all comments →</a>
        </Button>
      ) : (
        lastCursor && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show more comments"}
          </Button>
        )
      )}
    </div>
  );
}
