import { Metadata } from "next";
import { BrowseClient } from "./client";
import { discover } from "@/server/actions/discover";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { parseDiscoverParams } from "@/lib/discover";
import { breadcrumbList } from "@/lib/seo/jsonld";

export const metadata: Metadata = {
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "Browse Movies & TV Shows",
  description:
    "Filter movies and TV shows by genre, year, rating, language, country, streaming service, cast and crew — then sort by popularity, rating or release date.",
  openGraph: {
    title: `Browse Movies & TV Shows | ${SITE_NAME}`,
    description:
      "Filter movies and TV shows by genre, year, rating, language, country, streaming service, cast and crew — then sort by popularity, rating or release date.",
    url: `${SITE_URL}/browse`,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Browse Movies & TV Shows | ${SITE_NAME}`,
    description:
      "Filter movies and TV shows by genre, year, rating, language, country, streaming service, cast and crew — then sort by popularity, rating or release date.",
  },
  alternates: {
    canonical: `${SITE_URL}/browse`,
  },
};

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const resolvedParams = await searchParams;

  // Convert searchParams to URLSearchParams for parsing
  const urlSearchParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlSearchParams.set(key, value);
    } else if (Array.isArray(value)) {
      urlSearchParams.set(key, value.join(","));
    }
  });

  // Parse filters from URL
  const parsedParams = parseDiscoverParams(urlSearchParams);

  // Fetch initial results with parsed params
  const initialResult = await discover({
    media_type: parsedParams.media_type || "movie",
    sort_by: parsedParams.sort_by || "popularity.desc",
    with_genres: parsedParams.with_genres,
    without_genres: parsedParams.without_genres,
    with_keywords: parsedParams.with_keywords,
    with_cast: parsedParams.with_cast,
    with_crew: parsedParams.with_crew,
    with_original_language: parsedParams.with_original_language,
    with_origin_country: parsedParams.with_origin_country,
    "vote_average.gte": parsedParams["vote_average.gte"],
    "vote_count.gte": parsedParams["vote_count.gte"],
    page: 1,
  });

  const breadcrumbs = breadcrumbList([{ name: "Home", path: "/" }, { name: "Browse" }]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <BrowseClient
        initialResults={initialResult.results}
        totalPages={initialResult.totalPages}
        totalResults={initialResult.totalResults}
      />
    </>
  );
}
