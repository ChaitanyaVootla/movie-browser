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

  // Parse ALL filters from the URL. (Previously only a subset was forwarded,
  // so a direct load / reload of e.g. ?providers=8&year=2020 server-rendered
  // the unfiltered popular list under a filtered URL.)
  const initialParams = browseParamsFromSearch(urlSearchParams);
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
