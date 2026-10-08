import { extractJsonLd, fetchText, isRecord, toNumber } from "../lib/http";
import { SourceError, type SourceStatus } from "../lib/result";
import { slugify, yearsMatch } from "../lib/text";
import type { MediaType, SimpleRating } from "../lib/types";

interface LdTitle {
  rating: number | null;
  count: number | null;
  year: number | null;
}

/** Find the Movie/TVSeries node in a page's JSON-LD and read its aggregateRating. */
export function readLdTitle(html: string): LdTitle | null {
  for (const node of extractJsonLd(html)) {
    const candidates = isRecord(node) && Array.isArray(node["@graph"]) ? node["@graph"] : [node];
    for (const c of candidates) {
      if (!isRecord(c)) continue;
      const type = c["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((t) => t === "Movie" || t === "TVSeries" || t === "TVSeason")) continue;
      const agg = isRecord(c.aggregateRating) ? c.aggregateRating : null;
      const date =
        typeof c.datePublished === "string"
          ? c.datePublished
          : typeof c.startDate === "string"
            ? c.startDate
            : isRecord(c.releasedEvent) && typeof c.releasedEvent.startDate === "string"
              ? c.releasedEvent.startDate
              : null;
      return {
        rating: agg ? toNumber(agg.ratingValue) : null,
        count: agg ? (toNumber(agg.ratingCount) ?? toNumber(agg.reviewCount)) : null,
        year: date ? Number(date.slice(0, 4)) || null : null,
      };
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Metacritic
// -----------------------------------------------------------------------------

export async function scrapeMetacritic(input: {
  metacriticId?: string;
  mediaType: MediaType;
  title: string;
  year?: number;
}): Promise<{ status: SourceStatus; data?: SimpleRating & { metacriticId: string }; url?: string; detail?: string }> {
  const kind = input.mediaType === "tv" ? "tv" : "movie";
  let id = input.metacriticId?.replace(/^\/+|\/+$/g, "");
  let guessed = false;
  if (!id) {
    // No Wikidata id: Metacritic slugs are the slugified title — guess, then
    // REQUIRE the page's year to match so a same-named older film can't leak in.
    if (!input.year) return { status: "no_id" };
    id = `${kind}/${slugify(input.title)}`;
    guessed = true;
  }
  const url = `https://www.metacritic.com/${id}/`;
  const page = await fetchText(url);
  const ld = readLdTitle(page.body);
  if (!ld) throw new SourceError("parse_error", "no Movie/TVSeries JSON-LD", 200, page.url);
  if (guessed && !yearsMatch(ld.year, input.year)) {
    return { status: "not_found", detail: `slug guess year mismatch (${ld.year} vs ${input.year})`, url };
  }
  if (ld.rating === null) return { status: "empty", url: page.url, detail: guessed ? "slug-guess" : "wikidata-id" };
  return {
    status: "ok",
    data: { score: ld.rating, voteCount: ld.count, sourceUrl: page.url, metacriticId: id },
    url: page.url,
    detail: guessed ? "slug-guess" : "wikidata-id",
  };
}

// -----------------------------------------------------------------------------
// Letterboxd (films only)
// -----------------------------------------------------------------------------

export function letterboxdIdFromUrl(url: string): string | null {
  return url.match(/letterboxd\.com\/film\/([^/?#]+)/)?.[1] ?? null;
}

export async function scrapeLetterboxd(input: {
  letterboxdId?: string;
  tmdbId: number;
  mediaType: MediaType;
}): Promise<{ status: SourceStatus; data?: SimpleRating & { letterboxdId: string }; url?: string; detail?: string }> {
  if (input.mediaType !== "movie") return { status: "skipped", detail: "letterboxd has no tv" };
  // /tmdb/{id}/ redirects to the film page — an authoritative TMDB→Letterboxd mapping.
  const url = input.letterboxdId
    ? `https://letterboxd.com/film/${input.letterboxdId}/`
    : `https://letterboxd.com/tmdb/${input.tmdbId}/`;
  const page = await fetchText(url);
  const letterboxdId = letterboxdIdFromUrl(page.url) ?? input.letterboxdId ?? "";
  // An unknown TMDB id does not redirect: Letterboxd answers 200 on /tmdb/{id}/
  // itself. That is "not in Letterboxd", not selector rot.
  if (!letterboxdId) return { status: "not_found", detail: "no tmdb→film redirect", url: page.url };
  const ld = readLdTitle(page.body);
  if (!ld) throw new SourceError("parse_error", "no Movie JSON-LD", 200, page.url);
  if (ld.rating === null) return { status: "empty", url: page.url };
  return {
    status: "ok",
    data: { score: ld.rating, voteCount: ld.count, sourceUrl: page.url, letterboxdId },
    url: page.url,
  };
}
