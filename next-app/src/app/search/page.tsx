import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchClient } from "./client";
import { search } from "@/server/actions/search";
import { SITE_NAME } from "@/lib/constants";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    type?: string;
  }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() || "";

  if (!query) {
    return {
      title: `Search | ${SITE_NAME}`,
      description: "Search for movies, TV shows, and people.",
    };
  }

  return {
    title: `"${query}" - Search Results | ${SITE_NAME}`,
    description: `Search results for "${query}" - Find movies, TV shows, and people.`,
    robots: { index: false }, // Don't index search pages
  };
}

function SearchSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-28 w-20 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2 py-2">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const page = parseInt(params.page || "1", 10);
  const type = params.type as "all" | "movie" | "tv" | "person" | undefined;

  // Fetch initial results if query exists
  let initialResults = null;
  if (query) {
    try {
      initialResults = await search({ query, page });
    } catch (error) {
      console.error("Search error:", error);
    }
  }

  return (
    <main className="min-h-screen pt-20 pb-16">
      <div className="px-4 md:px-8 lg:px-12 max-w-7xl mx-auto">
        <Suspense fallback={<SearchSkeleton />}>
          <SearchClient
            initialQuery={query}
            initialResults={initialResults}
            initialPage={page}
            initialType={type || "all"}
          />
        </Suspense>
      </div>
    </main>
  );
}

