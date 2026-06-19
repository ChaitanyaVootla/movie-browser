/**
 * Letterboxd export parser. Input: Map<path, csvText> (zip already extracted
 * by the runner — keeps this module pure and unit-testable).
 *
 * Mapping decisions (spec §4.2):
 *  - diary.csv "Watched Date" -> DATE precision (stored at 12:00 UTC later).
 *  - watched.csv films not in the diary -> DATELESS watches (UNKNOWN).
 *  - stars (0.5-5) -> score = stars*2; likes/films.csv -> thumb up.
 *  - reviews.csv bodies preserved verbatim incl. newlines.
 */
import { parseCsv, parseCsvRecords } from "./csv";
import {
  emptyImport,
  type NormalizedImport,
  type TitleRef,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function movieRef(rec: Record<string, string>): TitleRef | null {
  const title = (rec.Name ?? "").trim();
  if (title === "") return null;
  const year = Number.parseInt(rec.Year ?? "", 10);
  return { kind: "movie", title, year: Number.isNaN(year) ? null : year };
}

function starsToScore(raw: string): number | null {
  const stars = Number.parseFloat(raw);
  if (Number.isNaN(stars) || stars <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(stars * 2)));
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function dateOrNull(raw: string | undefined): string | null {
  return raw !== undefined && DATE_RE.test(raw.trim()) ? raw.trim() : null;
}

export function parseLetterboxdExport(files: Map<string, string>): NormalizedImport {
  const out = emptyImport("LETTERBOXD");
  const diaryTitleKeys = new Set<string>();
  const titleKey = (ref: TitleRef) => `${(ref.title ?? "").toLowerCase()}|${ref.year ?? ""}`;

  const diary = files.get("diary.csv");
  if (diary !== undefined) {
    parseCsvRecords(diary).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "diary.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      diaryTitleKeys.add(titleKey(ref));
      const watchedAt = dateOrNull(rec["Watched Date"]);
      out.watches.push({
        ref,
        watchedAt,
        precision: watchedAt !== null ? "DATE" : "UNKNOWN",
        isRewatch: (rec.Rewatch ?? "").trim().toLowerCase() === "yes",
        tags: parseTags(rec.Tags ?? ""),
        note: null,
      });
    });
  }

  const watched = files.get("watched.csv");
  if (watched !== undefined) {
    parseCsvRecords(watched).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "watched.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      if (diaryTitleKeys.has(titleKey(ref))) return; // diary already covers it
      out.watches.push({
        ref,
        watchedAt: null,
        precision: "UNKNOWN",
        isRewatch: false,
        tags: [],
        note: null,
      });
    });
  }

  const ratings = files.get("ratings.csv");
  if (ratings !== undefined) {
    parseCsvRecords(ratings).forEach((rec, i) => {
      const ref = movieRef(rec);
      const score = starsToScore(rec.Rating ?? "");
      if (!ref || score === null) {
        out.unmappable.push({ file: "ratings.csv", line: i + 2, reason: "missing name or rating" });
        return;
      }
      out.ratings.push({ ref, score, thumb: null, ratedAt: dateOrNull(rec.Date) });
    });
  }

  const likes = files.get("likes/films.csv");
  if (likes !== undefined) {
    parseCsvRecords(likes).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "likes/films.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      out.ratings.push({ ref, score: null, thumb: 1, ratedAt: dateOrNull(rec.Date) });
    });
  }

  const reviews = files.get("reviews.csv");
  if (reviews !== undefined) {
    parseCsvRecords(reviews).forEach((rec, i) => {
      const ref = movieRef(rec);
      const body = rec.Review ?? "";
      if (!ref || body.trim() === "") {
        out.unmappable.push({ file: "reviews.csv", line: i + 2, reason: "missing name or body" });
        return;
      }
      out.reviews.push({
        ref,
        body,
        containsSpoilers: false, // Letterboxd exports no spoiler flag
        watchedAt: dateOrNull(rec["Watched Date"]),
      });
    });
  }

  const watchlist = files.get("watchlist.csv");
  if (watchlist !== undefined) {
    parseCsvRecords(watchlist).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "watchlist.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      out.watchlist.push({ ref, addedAt: dateOrNull(rec.Date), note: null });
    });
  }

  for (const [path, content] of files) {
    if (!path.startsWith("lists/") || !path.endsWith(".csv")) continue;
    const list = parseLetterboxdList(path, content, out);
    if (list) out.lists.push(list);
  }

  return out;
}

/** lists/*.csv: metadata block, blank line, then the item table. */
function parseLetterboxdList(
  path: string,
  content: string,
  out: NormalizedImport
): NormalizedImport["lists"][number] | null {
  const rows = parseCsv(content);
  const headerIdx = rows.findIndex((r) => r[0] === "Position" && r[1] === "Name");
  if (headerIdx === -1) {
    out.unmappable.push({ file: path, line: 1, reason: "unrecognized list format" });
    return null;
  }
  // Metadata: a "Date,Name,..." header row followed by one value row.
  const metaHeaderIdx = rows.findIndex((r) => r[0] === "Date" && r[1] === "Name");
  const meta =
    metaHeaderIdx !== -1 && metaHeaderIdx + 1 < headerIdx ? rows[metaHeaderIdx + 1] : null;
  const fallbackName = path.replace(/^lists\//, "").replace(/\.csv$/, "").replace(/-/g, " ");
  const name = meta?.[1]?.trim() || fallbackName;
  const description = meta?.[4]?.trim() || null;

  const header = rows[headerIdx];
  const items: Array<{ ref: TitleRef; position: number }> = [];
  rows.slice(headerIdx + 1).forEach((r, i) => {
    if (r.length < 2 || r.every((c) => c.trim() === "")) return;
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = r[idx] ?? "";
    });
    const ref = movieRef(rec);
    if (!ref) {
      out.unmappable.push({ file: path, line: headerIdx + i + 2, reason: "missing film name" });
      return;
    }
    const position = Number.parseInt(rec.Position ?? "", 10);
    items.push({ ref, position: Number.isNaN(position) ? items.length + 1 : position });
  });
  return { name, description, items };
}
