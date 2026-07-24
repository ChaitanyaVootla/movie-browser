import { Suspense } from "react";
import { Metadata } from "next";
import { RatingsClient } from "./client";
import { PageMain } from "@/components/features/layout/page-main";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  // Private user pages: robots.txt disallows these, but belt-and-braces —
  // robots.txt is advisory while the meta tag is authoritative for indexing.
  robots: { index: false, follow: false },
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "My Ratings",
  description: "Movies and TV shows you've liked and disliked.",
  openGraph: {
    title: "My Ratings - The Movie Browser",
    description: "Movies and TV shows you've liked and disliked.",
  },
};

function RatingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Toggle skeleton */}
      <div className="flex flex-wrap justify-center gap-3">
        <Skeleton className="h-10 w-48 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
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

export default function RatingsPage() {
  return (
    <PageMain>
      <Suspense fallback={<RatingsSkeleton />}>
        <RatingsClient />
      </Suspense>
    </PageMain>
  );
}
