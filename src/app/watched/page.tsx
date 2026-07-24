import { Suspense } from "react";
import { Metadata } from "next";
import { WatchedClient } from "./client";
import { PageMain } from "@/components/features/layout/page-main";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  // Private user pages: robots.txt disallows these, but belt-and-braces —
  // robots.txt is advisory while the meta tag is authoritative for indexing.
  robots: { index: false, follow: false },
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "Watched Movies",
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
    <PageMain>
      <Suspense fallback={<WatchedSkeleton />}>
        <WatchedClient />
      </Suspense>
    </PageMain>
  );
}
