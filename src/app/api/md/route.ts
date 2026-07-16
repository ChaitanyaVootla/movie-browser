/**
 * Markdown twin endpoint — the LLM-friendly `.md` layer.
 *
 * GET /api/md?p=/movie/27205/inception[&q=...] — proxy-rewritten target of any
 * `.md` URL (see src/proxy.ts). Returns a clean `text/markdown` view of a page
 * built READ-ONLY from Postgres.
 *
 * HARD INVARIANTS (docs/superpowers/specs/2026-07-16-llm-friendly-site-design.md):
 *  1. COST-SAFETY: reads ONLY from PG via the getters in `@/lib/llm/data`. NEVER
 *     triggers hydration / TMDB / enrichment / Lambda / SSE. Row absent → 404.
 *  2. Served as a route handler with CloudFront `s-maxage` cache — NOT ISR, no
 *     `.next` disk-cache growth.
 *  5. Type-safe: Zod at the boundary, `catch (e: unknown)`, no `any`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiLogger } from "@/lib/logger";
import { parseLlmPath } from "@/lib/llm/paths";
import {
  getMovieFromPostgres,
  getSeriesFromPostgres,
  getPersonFromPostgres,
  getAIData,
  getPopularBrowse,
  getPopularForTopic,
} from "@/lib/llm/data";
import {
  movieToMarkdown,
  seriesToMarkdown,
  personToMarkdown,
  listToMarkdown,
  searchToMarkdown,
  staticToMarkdown,
  homeToMarkdown,
} from "@/lib/llm/markdown";
import { hybridQuickSearchLexical } from "@/lib/search";
import { getTopicDisplayName } from "@/lib/topics";

export const runtime = "nodejs";

// Long edge cache: the .md twin is derived from PG and safe to serve stale.
const SUCCESS_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";
// Short cache for "not found" so a mistaken id doesn't hammer the origin, but
// recovers quickly once the row exists in PG.
const NOT_FOUND_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

const BROWSE_LIMIT = 50;
const TOPIC_LIMIT = 50;
const SEARCH_LIMIT = 25;

const QuerySchema = z.object({
  p: z.string().startsWith("/", "p must be an absolute path"),
  q: z.string().max(200, "q too long").optional(),
});

/** Build a `text/markdown` response with the noindex header. */
function markdownResponse(body: string, status = 200, cacheControl = SUCCESS_CACHE): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": cacheControl,
      // The .md twin is noindex; the canonical HTML page is what search engines index.
      "X-Robots-Tag": "noindex",
    },
  });
}

function notFoundResponse(what: string): NextResponse {
  return markdownResponse(
    `# Not found\n\nNo markdown view is available for ${what}.\n`,
    404,
    NOT_FOUND_CACHE
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let path = "";

  try {
    const searchParams = request.nextUrl.searchParams;
    const params = QuerySchema.parse({
      p: searchParams.get("p"),
      q: searchParams.get("q") ?? undefined,
    });
    path = params.p;

    const target = parseLlmPath(params.p);
    if (!target) {
      return notFoundResponse(`\`${params.p}\``);
    }

    switch (target.kind) {
      case "movie": {
        const [movie, aiData] = await Promise.all([
          getMovieFromPostgres(target.id),
          getAIData(target.id, "movie"),
        ]);
        if (!movie) return notFoundResponse(`movie ${target.id}`);
        return markdownResponse(movieToMarkdown(movie, aiData));
      }

      case "series": {
        const [series, aiData] = await Promise.all([
          getSeriesFromPostgres(target.id),
          getAIData(target.id, "series"),
        ]);
        if (!series) return notFoundResponse(`series ${target.id}`);
        return markdownResponse(seriesToMarkdown(series, aiData));
      }

      case "person": {
        const person = await getPersonFromPostgres(target.id);
        if (!person) return notFoundResponse(`person ${target.id}`);
        return markdownResponse(personToMarkdown(person));
      }

      case "browse": {
        const items = await getPopularBrowse(BROWSE_LIMIT);
        return markdownResponse(
          listToMarkdown(
            "Browse popular titles",
            "The most popular movies and series on The Movie Browser.",
            items
          )
        );
      }

      case "topic": {
        const items = await getPopularForTopic(target.topicKey, TOPIC_LIMIT);
        const title = getTopicDisplayName(target.topicKey) ?? "Topic";
        return markdownResponse(
          listToMarkdown(title, `Popular ${title} on The Movie Browser.`, items)
        );
      }

      case "home":
        return markdownResponse(homeToMarkdown());

      case "static":
        return markdownResponse(staticToMarkdown(target.slug));

      case "search": {
        const q = params.q?.trim() ?? "";
        if (!q) {
          return markdownResponse(
            "# Search\n\nProvide a query with `?q=...` (e.g. `/search.md?q=inception`).\n",
            400,
            "no-store"
          );
        }
        // hybridQuickSearchLexical, NOT hybridQuickSearch: the latter delegates
        // to hybridSearch for >=5-char non-title queries, which runs paid Bedrock
        // (Cohere) intent-embedding classification. This endpoint is unauthenticated
        // and shed-exempt, so that would reopen the AI-crawler cost hole. Strictly
        // pure-PG lexical only here. See the lexical helper's doc + cdn.md.
        const results = await hybridQuickSearchLexical(q, SEARCH_LIMIT);
        return markdownResponse(searchToMarkdown(q, results));
      }
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return markdownResponse(
        `# Bad request\n\n${error.issues.map((i) => `- ${i.path.join(".") || "query"}: ${i.message}`).join("\n")}\n`,
        400,
        "no-store"
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error({ event: "md_error", path, error: message });

    return markdownResponse(
      "# Error\n\nSomething went wrong generating this page. Please try again later.\n",
      500,
      "no-store"
    );
  }
}
