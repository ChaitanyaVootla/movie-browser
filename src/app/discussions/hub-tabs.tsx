"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { mergeSearch, pickParam, withSearch } from "@/lib/url-state";
import { useScrollRestorationGate } from "@/components/features/layout/scroll-restoration";
import { HubThreadCard } from "./hub-thread-card";
import { AudienceFilterSlot } from "@/components/features/discussion/audience-filter-slot";
import { getHubFollowing, type HubTab } from "@/server/actions/discussions-hub";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";
import type { CommentCursor } from "@/server/services/discussion/comment-schemas";

const TABS: { id: HubTab; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "following", label: "Following" },
];
const TAB_IDS: readonly HubTab[] = ["hot", "new", "following"];

/** The hub tab encoded in a query string (`?tab=`), defaulting to Hot. */
export function hubTabFromSearch(search: string): HubTab {
  return pickParam(new URLSearchParams(search).get("tab"), TAB_IDS, "hot");
}

/**
 * Hot / New / Following tabs for the ISR-cached `/discussions` hub.
 *
 * The tab lives in the URL (`?tab=new|following`, Hot = bare) so Back from a
 * thread returns to it. EDGE-CACHE INVARIANT: the page is `force-static`, so
 * the server HTML is always the anon Hot tab — the URL tab is read on the
 * CLIENT after mount (no `useSearchParams`, which would bail the static page
 * out of prerendering), and Following (viewer data) is only ever fetched
 * client-side via the `getHubFollowing` server action, kept in the query cache
 * so a Back restores every page you loaded.
 */
export function HubTabs({ initialHot, initialNew }: { initialHot: Card[]; initialNew: Card[] }) {
  const [tab, setTab] = useState<HubTab>("hot");

  // Adopt the URL's tab after hydration (and whenever Back/Forward lands here).
  useEffect(() => {
    const sync = () => setTab(hubTabFromSearch(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const following = useInfiniteQuery({
    queryKey: ["discussions-hub-following"],
    queryFn: ({ pageParam }: { pageParam: CommentCursor | null }) =>
      getHubFollowing({ cursor: pageParam }),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: tab === "following",
    staleTime: 2 * 60 * 1000,
  });
  useScrollRestorationGate(!(tab === "following" && following.isPending));

  const selectTab = (next: HubTab) => {
    setTab(next);
    const search = mergeSearch(window.location.search, { tab: next }, { tab: "hot" });
    window.history.replaceState(null, "", withSearch(window.location.pathname, search));
  };

  const followingCards = following.data?.pages.flatMap((p) => p.cards) ?? [];
  const cards = tab === "hot" ? initialHot : tab === "new" ? initialNew : followingCards;
  const loading = tab === "following" && following.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                "min-h-[40px] rounded-md px-3 text-sm font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AudienceFilterSlot />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "following" ? "Follow people or track shows to see their discussions here." : "No discussions yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <HubThreadCard key={c.id} card={c} />
          ))}
        </div>
      )}

      {tab === "following" && following.hasNextPage ? (
        <div className="text-center">
          <button
            className="min-h-[40px] rounded-md border border-border px-4 text-sm"
            disabled={following.isFetchingNextPage}
            onClick={() => void following.fetchNextPage()}
          >
            {following.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
