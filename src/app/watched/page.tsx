import { Suspense } from "react";
import { Metadata } from "next";
import { WatchedClient } from "./client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Watched Movies - The Movie Browser",
  description: "Movies you've marked as watched.",
  openGraph: {
    title: "Watched Movies - The Movie Browser",
    description: "Movies you've marked as watched.",
  },
};

function WatchedSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-[340px]" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 md:gap-3">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WatchedPage() {
  return (
    <main className="min-h-screen pt-16 pb-12 px-4 md:px-6 lg:px-8">
      <Suspense fallback={<WatchedSkeleton />}>
        <WatchedClient />
      </Suspense>
    </main>
  );
}




