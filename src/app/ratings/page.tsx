import { Suspense } from "react";
import { Metadata } from "next";
import { RatingsClient } from "./client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "My Ratings - The Movie Browser",
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
    <main className="min-h-screen pt-16 pb-12 px-4 md:px-6 lg:px-8">
      <Suspense fallback={<RatingsSkeleton />}>
        <RatingsClient />
      </Suspense>
    </main>
  );
}






