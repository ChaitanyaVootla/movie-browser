import { Suspense } from "react";
import { Metadata } from "next";
import { WatchlistClient } from "./client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "My Watchlist - The Movie Browser",
  description: "Your personal watchlist of movies and TV series to watch.",
  openGraph: {
    title: "My Watchlist - The Movie Browser",
    description: "Your personal watchlist of movies and TV series to watch.",
  },
};

function WatchlistSkeleton() {
  return (
    <div className="space-y-8">
      {/* Toggle skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  return (
    <main className="min-h-screen pt-16 pb-12 px-4 md:px-6 lg:px-8">
      <Suspense fallback={<WatchlistSkeleton />}>
        <WatchlistClient />
      </Suspense>
    </main>
  );
}

