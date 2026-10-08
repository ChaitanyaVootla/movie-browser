import { permanentRedirect } from "next/navigation";
import { legacyLibraryUrl } from "@/lib/library-routes";

/**
 * /ratings is consolidated into /library (Ratings tab — see
 * src/lib/library-routes.ts). Kept as a permanent redirect so bookmarks and old
 * links still resolve; `?type=` / `?rating=` carry over.
 */
export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(legacyLibraryUrl("ratings", await searchParams));
}
