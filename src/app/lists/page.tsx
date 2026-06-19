import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";
import { ListsClient } from "@/components/features/lists/lists-client";

export const metadata: Metadata = {
  // Private user surface — keep out of the index (mirrors /watchlist).
  robots: { index: false, follow: false },
  title: "My Lists - The Movie Browser",
  description: "Your custom lists of movies and TV series.",
};

export default function ListsPage() {
  return (
    <PageMain>
      <ListsClient />
    </PageMain>
  );
}
