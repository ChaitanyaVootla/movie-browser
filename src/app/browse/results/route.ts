/**
 * GET /browse/results?<canonical query> — one page of /browse discover results.
 *
 * Edge-cacheable on purpose: it lives OUTSIDE /api/ because the Cloudflare anon
 * cache rule excludes /api/*, and it emits `s-maxage`. Results are viewer-
 * agnostic (TMDB discover only; library filters like hideWatched are applied
 * client-side), so one cached object serves everyone.
 *
 * Only the canonical query form is answered (see `src/lib/discover-results.ts`)
 * so the edge key space stays bounded and junk permutations cost a 400, not a
 * TMDB call.
 */
import { NextRequest, NextResponse } from "next/server";
import { discover } from "@/server/actions/discover";
import { parseDiscoverResultsQuery } from "@/lib/discover-results";

export const runtime = "nodejs";

/** Results: 10 min at the edge, then serve stale while one request refreshes. */
const OK_CACHE = "public, max-age=60, s-maxage=600, stale-while-revalidate=3600";
/** Empty results may be a transient TMDB failure (the action swallows errors). */
const EMPTY_CACHE = "public, max-age=0, s-maxage=60";
/** Non-canonical queries: cheap and cacheable so a cache-buster loop stays cheap. */
const BAD_CACHE = "public, max-age=300, s-maxage=3600";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseDiscoverResultsQuery(request.nextUrl.search);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "non-canonical query", canonical: parsed.canonical },
      { status: 400, headers: { "Cache-Control": BAD_CACHE } }
    );
  }
  const result = await discover({ ...parsed.params, page: parsed.page });
  return NextResponse.json(result, {
    headers: { "Cache-Control": result.totalResults > 0 ? OK_CACHE : EMPTY_CACHE },
  });
}
