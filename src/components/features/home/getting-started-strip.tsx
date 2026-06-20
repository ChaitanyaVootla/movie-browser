"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Compass, Sparkles, X } from "lucide-react";
import { useSafeSession } from "@/hooks/use-safe-session";
import { useUserStore, selectIsHydrated } from "@/stores/user";
import { buildBrowseUrl } from "@/lib/discover";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "mb:getting-started-dismissed";

/**
 * A one-time, dismissible welcome strip for brand-new signed-in users — those
 * with no watchlist, no tracking, and no recent visits yet. The home page is
 * otherwise full of trending content, so returning users never see this; it
 * exists purely to give a first-time user a clear next action instead of a
 * personal section that silently renders nothing. Dismissal persists locally.
 */
export function GettingStartedStrip() {
  const { status } = useSafeSession();
  const isHydrated = useUserStore(selectIsHydrated);
  const isEmpty = useUserStore(
    (s) =>
      s.recents.length === 0 &&
      s.continueWatching.length === 0 &&
      s.watchlistMovies.size === 0 &&
      s.watchlistSeries.size === 0 &&
      s.watchedMovies.size === 0 &&
      s.seriesProgress.size === 0
  );
  // Safe as a lazy initializer: the strip only renders after client-only gates
  // (authenticated session + store hydration), so there is no SSR output to
  // mismatch against.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1"
  );

  if (status !== "authenticated" || !isHydrated || !isEmpty || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode / storage disabled — fine, it just won't persist.
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-background to-background p-5 md:p-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-2 text-brand">
        <Sparkles className="size-5" />
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Welcome — let&apos;s build your library
        </h2>
      </div>
      <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
        Save titles to your watchlist, rate what you&apos;ve seen, and track your
        progress through a series. We&apos;ll line up what to watch next and surface
        it right here.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <StartLink
          href={buildBrowseUrl({ media_type: "movie", sort_by: "popularity.desc" })}
          icon={<Compass className="size-4" />}
          label="Browse movies"
          primary
        />
        <StartLink
          href={buildBrowseUrl({ media_type: "tv", sort_by: "popularity.desc" })}
          icon={<Compass className="size-4" />}
          label="Browse TV shows"
        />
        <StartLink
          href="/watchlist"
          icon={<Bookmark className="size-4" />}
          label="Your watchlist"
        />
      </div>
    </section>
  );
}

function StartLink({
  href,
  icon,
  label,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        primary
          ? "bg-brand text-brand-foreground hover:bg-brand/90"
          : "border border-border bg-background/60 text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
