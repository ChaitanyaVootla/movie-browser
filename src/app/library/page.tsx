import { Suspense } from "react";
import { Metadata } from "next";
import { LibraryClient } from "./client";
import { PageMain } from "@/components/features/layout/page-main";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  // Private user page: robots.txt disallows these, but belt-and-braces —
  // robots.txt is advisory while the meta tag is authoritative for indexing.
  robots: { index: false, follow: false },
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "My Library",
  description: "Everything you're watching and want to watch, in one place.",
  openGraph: {
    title: "My Library - The Movie Browser",
    description: "Everything you're watching and want to watch, in one place.",
  },
};

function LibrarySkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-56 rounded-lg" />
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

export default function LibraryPage() {
  return (
    <PageMain>
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryClient />
      </Suspense>
    </PageMain>
  );
}
