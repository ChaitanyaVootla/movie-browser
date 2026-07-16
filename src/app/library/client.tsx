"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { PlayCircle, Bookmark, ListX } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  useUserStore,
  selectContinueWatching,
  selectIsHydrated,
} from "@/stores/user";
import { ContinueWatchingSection } from "@/components/features/home/personalized-sections";
import { UpNextSection } from "@/components/features/home/up-next-section";
import { WatchlistClient } from "../watchlist/client";

type LibraryTab = "watching" | "watchlist";

/**
 * Library — one place for everything you're tracking: things in progress
 * (Continue Watching + Up Next) and your Watchlist (want to watch). The home
 * page keeps its own copies of these as discovery surfaces; this is the full
 * dedicated view. Tabs are URL-driven (?tab=) so they're linkable and
 * back-button friendly.
 */
export function LibraryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const initialTab: LibraryTab =
    searchParams.get("tab") === "watchlist" ? "watchlist" : "watching";
  const [tab, setTab] = useState<LibraryTab>(initialTab);

  const isHydrated = useUserStore(selectIsHydrated);
  const continueWatching = useUserStore(selectContinueWatching);
  const [upNextCount, setUpNextCount] = useState<number | null>(null);

  const handleTabChange = (value: string) => {
    const next = value === "watchlist" ? "watchlist" : "watching";
    setTab(next);
    router.replace(next === "watching" ? "/library" : "/library?tab=watchlist", {
      scroll: false,
    });
  };

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="text-center space-y-2">
          <ListX className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold">Sign in to see your library</h2>
          <p className="text-muted-foreground max-w-md">
            Keep track of what you&apos;re watching and what you want to watch, all in
            one place.
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
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-8">
      <TabsList className="w-fit">
        <TabsTrigger value="watching" className="gap-2">
          <PlayCircle className="h-4 w-4" />
          Watching
        </TabsTrigger>
        <TabsTrigger value="watchlist" className="gap-2">
          <Bookmark className="h-4 w-4" />
          Watchlist
        </TabsTrigger>
      </TabsList>

      <TabsContent value="watching" className="space-y-10">
        <ContinueWatchingSection />
        <UpNextSection title="Up Next" onCount={setUpNextCount} />
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
        {/* Embedded: Up Next lives in the Watching tab, and the TV/Movies sub-tab
            must not write /library's ?tab= param. */}
        <WatchlistClient showUpNext={false} syncTabToUrl={false} />
      </TabsContent>
    </Tabs>
  );
}
