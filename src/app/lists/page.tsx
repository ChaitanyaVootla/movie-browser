import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";
import { ListsClient } from "@/components/features/lists/lists-client";

// Bound edge staleness after deploys (static default is a 1-year s-maxage) — see library/page.tsx.
export const revalidate = 3600;

export const metadata: Metadata = {
  // Private user surface — keep out of the index (mirrors /watchlist).
  robots: { index: false, follow: false },
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "My Lists",
  description: "Your custom lists of movies and TV series.",
};

export default function ListsPage() {
  return (
    <PageMain>
      <ListsClient />
    </PageMain>
  );
}
