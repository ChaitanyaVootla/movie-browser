"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadReviews, type LoadReviewsResult } from "@/server/actions/reviews";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import type { ReviewDTO, TrackedMediaType } from "@/types/social";
import { ReviewCard } from "./review-card";
import { dedupeById } from "./dedupe-reviews";

type SortTab = "popular" | "recent" | "following";

interface ReviewsClientProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  /** Anon NONE+PUBLISHED+public Popular set from SSR — seeds the Popular tab. */
  initialReviews: ReviewDTO[];
}

/** Per-tab loaded state. `seeded` Popular renders the SSR set until a fetch resolves. */
interface TabState {
  reviews: ReviewDTO[];
  nextCursorId: number | null;
  loaded: boolean;
  loading: boolean;
}

const EMPTY_TAB: TabState = { reviews: [], nextCursorId: null, loaded: false, loading: false };

function ReviewCardList({ reviews }: { reviews: ReviewDTO[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

/**
 * Viewer-specific review tiers (spec §D/§E). EDGE-CACHE SAFE: this whole tree is
 * client-only — every read here is a server-action POST (never edge-cached) that
 * applies the viewer's spoiler-gate + per-viewer like state.
 *
 * - Popular tab is SEEDED with the SSR anon set (NONE-only) so it paints
 *   instantly with zero fetch. Once a session is detected, Popular RE-LOADS via
 *   loadReviews(popular) to fold in spoiler-tier reviews the viewer may see plus
 *   their like state — the SSR seed stays visible until the fetch resolves (no
 *   flash).
 * - Recent / Following load on first visit. Following with no session or no
 *   follows → friendly empty state (loadReviews already returns []).
 */
export function ReviewsClient({ mediaType, tmdbId, seasonNumber, initialReviews }: ReviewsClientProps) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [tab, setTab] = useState<SortTab>("popular");
  const [tabs, setTabs] = useState<Record<SortTab, TabState>>({
    popular: { ...EMPTY_TAB, reviews: initialReviews },
    recent: EMPTY_TAB,
    following: EMPTY_TAB,
  });

  const fetchTab = useCallback(
    async (sort: SortTab, cursorId?: number) => {
      setTabs((prev) => ({ ...prev, [sort]: { ...prev[sort], loading: true } }));
      let result: LoadReviewsResult;
      try {
        result = await loadReviews({ mediaType, tmdbId, seasonNumber, sort, cursorId, limit: 20 });
      } catch (error: unknown) {
        if (isStaleServerActionError(error)) recoverFromStaleAction();
        result = { ok: false, error: "Could not load reviews" };
      }
      if (!result.ok) {
        toast.error(result.error);
        setTabs((prev) => ({ ...prev, [sort]: { ...prev[sort], loading: false } }));
        return;
      }
      const { reviews, nextCursorId } = result;
      setTabs((prev) => {
        // Pagination (cursorId set) appends; a fresh load replaces the seed/page.
        const merged = cursorId !== undefined ? [...prev[sort].reviews, ...reviews] : reviews;
        return {
          ...prev,
          [sort]: { reviews: dedupeById(merged), nextCursorId, loaded: true, loading: false },
        };
      });
    },
    [mediaType, tmdbId, seasonNumber]
  );

  // Upgrade Popular's anon seed → viewer-gated tier once signed in (folds in
  // spoiler reviews + like state). Keeps the seed visible until it resolves.
  useEffect(() => {
    if (signedIn && !tabs.popular.loaded && !tabs.popular.loading) {
      // Defer out of the effect body — fetchTab's first act is a synchronous
      // setState (loading flag), which cascades if called inline in an effect.
      queueMicrotask(() => void fetchTab("popular"));
    }
  }, [signedIn, tabs.popular.loaded, tabs.popular.loading, fetchTab]);

  // Load Recent/Following lazily on first visit.
  const handleTabChange = useCallback(
    (value: string) => {
      const next = value as SortTab;
      setTab(next);
      setTabs((prev) => {
        if (next !== "popular" && !prev[next].loaded && !prev[next].loading) {
          // Schedule the fetch after state settles (avoids setState-in-render).
          queueMicrotask(() => void fetchTab(next));
        }
        return prev;
      });
    },
    [fetchTab]
  );

  const loadMore = (sort: SortTab) => {
    const state = tabs[sort];
    if (state.nextCursorId !== null && !state.loading) {
      void fetchTab(sort, state.nextCursorId);
    }
  };

  const emptyMessageFor = (sort: SortTab) =>
    sort === "following"
      ? signedIn
        ? "No reviews yet from people you follow."
        : "Sign in and follow reviewers to see their reviews here."
      : "No reviews yet — be the first.";

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="gap-4">
      <TabsList className="h-11 w-full max-w-sm">
        <TabsTrigger value="popular" className="min-h-10">
          Popular
        </TabsTrigger>
        <TabsTrigger value="recent" className="min-h-10">
          Recent
        </TabsTrigger>
        <TabsTrigger value="following" className="min-h-10">
          Following
        </TabsTrigger>
      </TabsList>

      {(["popular", "recent", "following"] as const).map((sort) => {
        const state = tabs[sort];
        // Popular always has a seed to show; recent/following show a skeleton
        // until their first load resolves.
        const showSkeleton = state.loading && state.reviews.length === 0;
        const showEmpty = state.loaded && state.reviews.length === 0;
        return (
          <TabsContent key={sort} value={sort} className="space-y-4">
            {showSkeleton ? (
              <SkeletonCards />
            ) : showEmpty ? (
              <p className="text-sm text-muted-foreground">{emptyMessageFor(sort)}</p>
            ) : (
              <>
                <ReviewCardList reviews={state.reviews} />
                {state.nextCursorId !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-h-10"
                    disabled={state.loading}
                    onClick={() => loadMore(sort)}
                  >
                    {state.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Show more reviews"
                    )}
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
