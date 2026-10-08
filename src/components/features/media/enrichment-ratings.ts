/**
 * Pure helpers turning the SSE enrich stream's PG ratings into the
 * ExternalRating[] the RatingsBar renders, and deciding when to prefer them
 * over the server-rendered (possibly stale, edge-cached) ratings.
 *
 * Mirrors buildRatingsArray in src/server/services/hydration/integration.ts —
 * same whitelist, normalization and ORDER — so a stream whose data equals the
 * HTML produces an identical list (and the UI does not swap at all).
 */

import type { ExternalRating } from "@/types";

export interface StreamRating {
  score: number;
  voteCount: number | null;
  certified: boolean | null;
  consensus: string | null;
  sentiment: string | null;
  sourceUrl: string | null;
  source: { slug: string; name: string; maxScore: number | null };
}

/** Same as integration.ts normalizeSentiment. */
function normalizeSentiment(sentiment: string | null): "POSITIVE" | "NEGATIVE" | undefined {
  if (!sentiment) return undefined;
  const s = sentiment.toLowerCase();
  if (s.includes("fresh") || s.includes("upright") || s.includes("positive")) return "POSITIVE";
  if (s.includes("rotten") || s.includes("spilled") || s.includes("negative")) return "NEGATIVE";
  return undefined;
}

const ORDER = ["TMDB", "IMDb", "Rotten Tomatoes", "Audience Score", "Google"];

export function convertStreamRatings(
  rows: StreamRating[],
  tmdbId: number,
  mediaType: "movie" | "series",
): ExternalRating[] {
  const tmdbPath = mediaType === "movie" ? "movie" : "tv";
  const bySlug = new Map(rows.map((r) => [r.source.slug.toLowerCase(), r]));
  const rtCritic = bySlug.get("rt_critic") ?? bySlug.get("rottentomatoes_critic");
  const rtAudience = bySlug.get("rt_audience") ?? bySlug.get("rottentomatoes_audience");
  const out: ExternalRating[] = [];

  const tmdb = bySlug.get("tmdb");
  if (tmdb?.score) {
    out.push({
      name: "TMDB",
      rating: Math.round(tmdb.score * 10).toString(),
      link: `https://www.themoviedb.org/${tmdbPath}/${tmdbId}`,
    });
  }
  const imdb = bySlug.get("imdb");
  if (imdb?.score) {
    out.push({
      name: "IMDb",
      rating: Math.round(imdb.score * 10).toString(),
      link: imdb.sourceUrl || "https://www.imdb.com",
    });
  }
  if (rtCritic?.score) {
    out.push({
      name: "Rotten Tomatoes",
      rating: Math.round(rtCritic.score).toString(),
      link: rtCritic.sourceUrl || "https://www.rottentomatoes.com",
      certified: rtCritic.certified ?? undefined,
      sentiment: normalizeSentiment(rtCritic.sentiment),
    });
  }
  if (rtAudience?.score) {
    out.push({
      name: "Audience Score",
      rating: Math.round(rtAudience.score).toString(),
      // integration.ts links the audience score to the critic page URL
      link: rtCritic?.sourceUrl || "https://www.rottentomatoes.com",
      certified: rtAudience.certified ?? undefined,
      sentiment: normalizeSentiment(rtAudience.sentiment),
    });
  }
  const google = bySlug.get("google");
  if (google?.score) {
    out.push({ name: "Google", rating: Math.round(google.score).toString(), link: "https://www.google.com" });
  }
  // Metacritic / Letterboxd intentionally excluded — same as integration.ts
  return out.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
}

function signature(list: ExternalRating[]): string {
  return list
    .map((r) => `${r.name}=${r.rating}|${r.certified ? 1 : 0}|${r.sentiment ?? ""}`)
    .sort()
    .join(";");
}

/**
 * Which ratings to render. PG (the stream) is the source of truth, but we
 * keep the server-rendered array object when the two are equivalent so the
 * common fresh-HTML case does not re-render or flicker.
 */
export function pickRatings(
  initial: ExternalRating[],
  streamRows: StreamRating[] | null | undefined,
  tmdbId: number,
  mediaType: "movie" | "series",
): ExternalRating[] {
  if (!streamRows?.length) return initial;
  const live = convertStreamRatings(streamRows, tmdbId, mediaType);
  if (live.length === 0) return initial;
  // The HTML's TMDB entry can come from the TMDB payload's vote_average when
  // PG has no tmdb rating row — never drop it just because the stream lacks it.
  const htmlTmdb = initial.find((r) => r.name === "TMDB");
  if (htmlTmdb && !live.some((r) => r.name === "TMDB")) live.unshift(htmlTmdb);
  return signature(live) === signature(initial) ? initial : live;
}
