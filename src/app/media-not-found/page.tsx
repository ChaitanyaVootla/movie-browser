import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * 404 passthrough for the proxy's pre-render media resolution.
 *
 * The movie/series detail routes carry loading.tsx, which streams a 200 shell
 * before any page code can set a status. When the proxy determines a detail
 * URL definitively doesn't exist (LRU/PG/TMDB — see
 * src/server/proxy/media-resolver.ts), it REWRITES the request here: a route
 * outside the detail segments (no loading.tsx applies), so notFound() throws
 * pre-flush and the branded not-found UI renders with a REAL 404 status.
 */

export const metadata: Metadata = {
  title: "Not Found",
  robots: { index: false, follow: false },
};

// Without this, the fully-static route inherits Next's max s-maxage (1y) and
// CloudFront pins the 404 forever (deploys don't invalidate) — a transient
// miss (e.g. a new release not yet in PG during a TMDB hiccup) would
// permanently kill the URL at the edge. 1h matches the detail pages' TTL.
export const revalidate = 3600;

export default function MediaNotFoundPage(): never {
  notFound();
}
