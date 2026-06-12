/**
 * IMDb ratings.csv parser. IMDb has no watch history export — a rating
 * implies "watched, date unknown" (dateless UNKNOWN watch; ratedAt is when
 * they RATED, not watched — import-honest). TV Series rows become
 * series-level granularity-unknown events (spec §4.2 watch_events).
 * TV Episode rows are unmappable for now: external_ids holds movie/series/
 * person ids only — counted, never silently dropped.
 */
import { parseCsvRecords } from "./csv";
import { emptyImport, type NormalizedImport, type TitleRef } from "./types";

const MOVIE_TYPES = new Set(["Movie", "TV Movie", "Video", "TV Special", "Short"]);
const SERIES_TYPES = new Set(["TV Series", "TV Mini Series", "TV Mini-Series"]);

export function parseImdbRatings(csvText: string): NormalizedImport {
  const out = emptyImport("IMDB");
  parseCsvRecords(csvText).forEach((rec, i) => {
    const line = i + 2;
    const imdbId = (rec.Const ?? "").trim();
    const title = (rec.Title ?? "").trim();
    const titleType = (rec["Title Type"] ?? "").trim();
    const score = Number.parseInt(rec["Your Rating"] ?? "", 10);
    const year = Number.parseInt(rec.Year ?? "", 10);
    const ratedAt = /^\d{4}-\d{2}-\d{2}$/.test((rec["Date Rated"] ?? "").trim())
      ? rec["Date Rated"].trim()
      : null;

    if (imdbId === "" || title === "" || Number.isNaN(score)) {
      out.unmappable.push({ file: "ratings.csv", line, reason: "missing const/title/rating" });
      return;
    }

    let kind: TitleRef["kind"];
    if (MOVIE_TYPES.has(titleType)) kind = "movie";
    else if (SERIES_TYPES.has(titleType)) kind = "series";
    else {
      out.unmappable.push({
        file: "ratings.csv",
        line,
        reason: `${titleType || "unknown"} not importable (TV Episode rows need episode external ids)`,
      });
      return;
    }

    const ref: TitleRef = {
      kind,
      imdbId,
      title,
      year: Number.isNaN(year) ? null : year,
    };
    out.ratings.push({ ref, score: Math.max(1, Math.min(10, score)), thumb: null, ratedAt });
    out.watches.push({
      ref,
      watchedAt: null,
      precision: "UNKNOWN",
      isRewatch: false,
      tags: [],
      note: null,
    });
  });
  return out;
}
