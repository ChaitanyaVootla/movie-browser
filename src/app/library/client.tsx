"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { PlayCircle, Bookmark, Eye, Star, ListX } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  useUserStore,
  selectContinueWatching,
  selectIsHydrated,
} from "@/stores/user";
import { ContinueWatchingSection } from "@/components/features/home/personalized-sections";
import { UpNextSection } from "@/components/features/home/up-next-section";
import { WatchlistTab } from "@/components/features/library/watchlist-tab";
import { WatchedTab } from "@/components/features/library/watched-tab";
import { RatingsTab } from "@/components/features/library/ratings-tab";
import { useUrlState } from "@/hooks/use-url-state";
import { LIBRARY_TABS, type LibraryTab } from "@/lib/library-routes";
import { pickParam } from "@/lib/url-state";

const TAB_META: Record<LibraryTab, { label: string; icon: typeof PlayCircle }> = {
  watching: { label: "Watching", icon: PlayCircle },
  watchlist: { label: "Watchlist", icon: Bookmark },
  watched: { label: "Watched", icon: Eye },
  ratings: { label: "Ratings", icon: Star },
};

/**
 * Library — the single home for your personal collection:
 *   Watching  — in progress (Up Next episodes + Continue Watching)
 *   Watchlist — want to watch (TV / Movies)
 *   Watched   — movies you've seen
 *   Ratings   — likes / dislikes
 * These used to be four separate routes (/library, /watchlist, /watched,
 * /ratings) with overlapping nav entries; the old routes now redirect here.
 * Every bit of view state (tab, sub-tab, search, genre, sort) is in the URL
 * (`?tab=` + per-tab params), so Back from a title lands on the same view and
 * `ScrollRestoration` returns you to the same card.
 */
export function LibraryClient() {
  const { status } = useSession();
  const url = useUrlState({ tab: "watching" });
  const tab = pickParam(url.get("tab"), LIBRARY_TABS, "watching");

  const isHydrated = useUserStore(selectIsHydrated);
  const continueWatching = useUserStore(selectContinueWatching);
  const [upNextCount, setUpNextCount] = useState<number | null>(null);

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <ListX className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">Sign in to see your library</h2>
          <p className="text-muted-foreground max-w-md">
            Keep track of what you&apos;re watching, want to watch, have watched and rated, all
            in one place.
          </p>
        </div>
        <Button size="lg" onClick={() => signIn("google")}>
          Sign in with Google
        </Button>
      </div>
    );
  }

  // Both in-progress sections self-hide when empty; show a fallback when we've
  // confirmed there's nothing in progress.
  const nothingInProgress =
    status === "authenticated" &&
    isHydrated &&
    continueWatching.length === 0 &&
    upNextCount === 0;

  return (
    <Tabs
      value={tab}
      // A tab owns every other query param — switching drops the previous
      // tab's sub-tab/filters.
      onValueChange={(next) => url.set({ tab: next }, { clearOthers: true })}
      className="space-y-8"
    >
      <h1 className="sr-only">My Library</h1>
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0">
        <TabsList className="w-fit">
          {LIBRARY_TABS.map((value) => {
            const { label, icon: Icon } = TAB_META[value];
            return (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="hidden h-4 w-4 sm:block" />
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <TabsContent value="watching" className="space-y-10">
        <UpNextSection title="Up Next" onCount={setUpNextCount} />
        <ContinueWatchingSection />
        {nothingInProgress && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="p-4 rounded-full bg-muted">
              <PlayCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">Nothing in progress</h3>
              <p className="text-muted-foreground max-w-sm">
                Start watching something and it&apos;ll show up here so you can pick
                up right where you left off.
              </p>
            </div>
            <Button asChild>
              <Link href="/browse">Browse titles</Link>
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="watchlist">
        <WatchlistTab />
      </TabsContent>
      <TabsContent value="watched">
        <WatchedTab />
      </TabsContent>
      <TabsContent value="ratings">
        <RatingsTab />
      </TabsContent>
    </Tabs>
  );
}
