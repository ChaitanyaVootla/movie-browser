import { Metadata } from "next";
import { BrowseClient } from "./client";
import { discover } from "@/server/actions/discover";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { browseParamsFromSearch } from "@/lib/discover";
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

/**
 * /browse is a filter-AGNOSTIC ISR shell (Oct 2026). It used to await
 * `searchParams`, which made every view a dynamic origin render that Cloudflare
 * bypasses (~102k/day, ~4.6 CPU-h/day, mostly crawlers following the
 * breadcrumb/footer links to plain /browse). Now:
 *  - the HTML always renders the default list (popular movies) and is cached at
 *    the origin (ISR) and the edge (s-maxage) — `?query` variants are served
 *    the same cached shell;
 *  - the client reads the URL filters after mount and fetches filtered pages
 *    from the edge-cacheable GET /browse/results (see lib/discover-results.ts).
 * Filter URLs canonicalise to /browse (metadata above), so serving them the
 * default list in HTML is the intended crawler view.
 * Do NOT reintroduce `searchParams`/headers()/cookies() here — any dynamic API
 * turns the route dynamic again.
 */
export const revalidate = 1800;

export default async function BrowsePage() {
  const initialParams = browseParamsFromSearch(new URLSearchParams());
  const initialResult = await discover({ ...initialParams, page: 1 });

  const breadcrumbs = breadcrumbList([{ name: "Home", path: "/" }, { name: "Browse" }]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <BrowseClient
        initialParams={initialParams}
        initialResults={initialResult.results}
        totalPages={initialResult.totalPages}
        totalResults={initialResult.totalResults}
      />
    </>
  );
}
