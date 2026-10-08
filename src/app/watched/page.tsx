import { permanentRedirect } from "next/navigation";
import { legacyLibraryUrl } from "@/lib/library-routes";

/**
 * /watched is consolidated into /library (Watched tab — see
 * src/lib/library-routes.ts). Kept as a permanent redirect so bookmarks and old
 * links still resolve.
 */
export default async function WatchedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(legacyLibraryUrl("watched", await searchParams));
}
