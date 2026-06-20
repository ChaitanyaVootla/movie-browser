"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  loadReviews,
  getReviewHistogram,
  type LoadReviewsResult,
} from "@/server/actions/reviews";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import type { ReviewDTO, TrackedMediaType } from "@/types/social";
import { RatingHistogram } from "./rating-histogram";
import { ReviewCard } from "./review-card";
import { dedupeById } from "./dedupe-reviews";

type SortTab = "popular" | "recent" | "following";

/** Sentinel for the title-level ("All") view in the season selector. */
const ALL_SEASONS = "all";

interface ReviewsClientProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  /** Anon NONE+PUBLISHED+public Popular set from SSR — seeds the Popular tab. */
  initialReviews: ReviewDTO[];
  /**
   * SSR title-level histogram — seeds the histogram so anon HTML is unchanged.
   * When the viewer switches season, the client re-fetches the per-season
   * histogram via getReviewHistogram (a POST, never edge-cached).
   */
  initialHistogram: RatingHistogramData;
  /**
   * Available season numbers for a series (e.g. [1, 2, 3]). When present and
   * non-empty, a season selector lets the viewer scope reviews to one season
   * ("All" = title-level). Omitted/empty (movies, single-season) = no selector.
   */
  seasons?: number[];
}

/** Per-tab loaded state. `seeded` Popular renders the SSR set until a fetch resolves. */
interface TabState {
  reviews: ReviewDTO[];
  nextCursorId: number | null;
  loaded: boolean;
  loading: boolean;
  /**
   * A fetch failed (e.g. a stale-action 404 on a cold page). Set so the auto-load
   * effect STOPS re-firing — without it the effect retried on every `tabs` change
   * and spammed infinite "Could not load reviews" toasts. Cleared on tab/season
   * change (state reset), so recovery can retry.
   */
  failed: boolean;
}

const EMPTY_TAB: TabState = {
  reviews: [],
  nextCursorId: null,
  loaded: false,
  loading: false,
  failed: false,
};

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
export function ReviewsClient({
  mediaType,
  tmdbId,
  seasonNumber,
  initialReviews,
  initialHistogram,
  seasons,
}: ReviewsClientProps) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const hasSeasonSelector = mediaType === "series" && (seasons?.length ?? 0) > 0;
  const [tab, setTab] = useState<SortTab>("popular");

  // Selected season unit. ALL_SEASONS = title-level (the SSR default — seeded
  // reviews + histogram render with zero fetch). A real season number scopes
  // every read to that season.
  const [selectedSeason, setSelectedSeason] = useState<string>(ALL_SEASONS);
  const activeSeason = selectedSeason === ALL_SEASONS ? seasonNumber : Number(selectedSeason);

  const [histogram, setHistogram] = useState<RatingHistogramData>(initialHistogram);
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
        result = await loadReviews({
          mediaType,
          tmdbId,
          seasonNumber: activeSeason,
          sort,
          cursorId,
          limit: 20,
        });
      } catch (error: unknown) {
        if (isStaleServerActionError(error)) recoverFromStaleAction();
        result = { ok: false, error: "Could not load reviews" };
      }
      if (!result.ok) {
        // Mark the tab FAILED so the auto-load effect stops re-firing (else it
        // loops and spams toasts). Deduped toast id = at most one toast.
        toast.error(result.error, { id: `reviews-load-${sort}` });
        setTabs((prev) => ({ ...prev, [sort]: { ...prev[sort], loading: false, failed: true } }));
        return;
      }
      const { reviews, nextCursorId } = result;
      setTabs((prev) => {
        // Pagination (cursorId set) appends; a fresh load replaces the seed/page.
        const merged = cursorId !== undefined ? [...prev[sort].reviews, ...reviews] : reviews;
        return {
          ...prev,
          [sort]: { reviews: dedupeById(merged), nextCursorId, loaded: true, loading: false, failed: false },
        };
      });
    },
    [mediaType, tmdbId, activeSeason]
  );

  // Switching season is a client interaction (POST-only — never edge-cached):
  // reset every tab to unloaded, re-fetch the active tab, and re-fetch the
  // per-season histogram. "All" returns to the SSR title-level seed.
  const handleSeasonChange = useCallback(
    (value: string) => {
      setSelectedSeason(value);
      const season = value === ALL_SEASONS ? seasonNumber : Number(value);

      if (value === ALL_SEASONS) {
        // Restore the SSR title-level seed for Popular; lazy-reload others.
        setHistogram(initialHistogram);
        setTabs({
          popular: { ...EMPTY_TAB, reviews: initialReviews },
          recent: EMPTY_TAB,
          following: EMPTY_TAB,
        });
        return;
      }

      setTabs({ popular: EMPTY_TAB, recent: EMPTY_TAB, following: EMPTY_TAB });
      void getReviewHistogram({ mediaType, tmdbId, seasonNumber: season })
        .then(setHistogram)
        .catch(() => {});
    },
    [mediaType, tmdbId, seasonNumber, initialHistogram, initialReviews]
  );

  // Load the ACTIVE tab when it needs a fetch:
  //  - Popular: upgrade its anon seed → viewer-gated tier once signed in (folds
  //    in spoiler reviews + like state; the seed stays visible until resolved),
  //    or load it for a freshly-selected season (no seed at season scope).
  //  - Recent/Following: reload after a season switch reset them to unloaded
  //    while the viewer stays on that tab (handleTabChange only fires on change).
  // The Following tab still no-ops server-side for anon/no-follows (empty page).
  useEffect(() => {
    const active = tabs[tab];
    // `failed` halts the retry loop (a failed fetch flips `tabs`, which would
    // otherwise re-trigger this effect → re-fetch → re-fail, forever).
    if (active.loaded || active.loading || active.failed) return;
    // Popular at title scope ("All") keeps its SSR seed unless signed in.
    if (tab === "popular" && selectedSeason === ALL_SEASONS && !signedIn) return;
    // Defer out of the effect body — fetchTab's first act is a synchronous
    // setState (loading flag), which cascades if called inline in an effect.
    queueMicrotask(() => void fetchTab(tab));
  }, [signedIn, selectedSeason, tab, tabs, fetchTab]);

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
    <div className="space-y-4">
      {hasSeasonSelector && (
        <div className="flex items-center gap-2">
          <Select value={selectedSeason} onValueChange={handleSeasonChange}>
            <SelectTrigger className="h-10 w-44" aria-label="Filter reviews by season">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SEASONS}>All seasons</SelectItem>
              {seasons!.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  Season {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="h-11 w-full max-w-sm sm:w-auto">
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
          {/* Compact rating summary, beside the tabs (right on sm+, wraps below on mobile). */}
          <RatingHistogram histogram={histogram} className="sm:ml-auto" />
        </div>

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
    </div>
  );
}
