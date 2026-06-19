/**
 * Trakt export parser (JSON files from the official data export / trakt-tools
 * dumps: history.json, ratings.json, watchlist.json).
 *
 * Episodes resolve tmdbEpisodeId-FIRST (invariant 2). Per-episode ratings are
 * COUNTED as unmappable for now (future user_episode_ratings table) — never
 * silently dropped.
 */
import { z } from "zod";
import {
  emptyImport,
  type NormalizedImport,
  type TitleRef,
} from "./types";

const TraktIds = z.object({
  tmdb: z.number().int().nullable().optional(),
  imdb: z.string().nullable().optional(),
});

const TraktTitle = z.object({
  title: z.string().optional(),
  year: z.number().int().nullable().optional(),
  ids: TraktIds,
});

const TraktEpisode = z.object({
  season: z.number().int(),
  number: z.number().int(),
  ids: TraktIds.optional(),
});

const TraktHistoryItem = z.object({
  watched_at: z.string().optional(),
  type: z.enum(["movie", "episode", "show"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  episode: TraktEpisode.optional(),
});

const TraktRatingItem = z.object({
  rated_at: z.string().optional(),
  rating: z.number().int().min(1).max(10),
  type: z.enum(["movie", "show", "season", "episode"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  episode: TraktEpisode.optional(),
});

const TraktWatchlistItem = z.object({
  listed_at: z.string().optional(),
  type: z.enum(["movie", "show"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  notes: z.string().nullable().optional(),
});

function toRef(kind: "movie" | "series", t: z.infer<typeof TraktTitle>): TitleRef {
  return {
    kind,
    tmdbId: t.ids.tmdb ?? undefined,
    imdbId: t.ids.imdb ?? undefined,
    title: t.title,
    year: t.year ?? null,
  };
}

function parseJsonArray<T>(
  out: NormalizedImport,
  file: string,
  content: string,
  schema: z.ZodType<T>
): T[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    out.unmappable.push({ file, line: 0, reason: "invalid JSON" });
    return [];
  }
  if (!Array.isArray(raw)) {
    out.unmappable.push({ file, line: 0, reason: "expected a JSON array" });
    return [];
  }
  const items: T[] = [];
  raw.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) items.push(parsed.data);
    else out.unmappable.push({ file, line: i, reason: "row failed schema validation" });
  });
  return items;
}

export function parseTraktExport(files: Map<string, string>): NormalizedImport {
  const out = emptyImport("TRAKT");

  const history = files.get("history.json");
  if (history !== undefined) {
    for (const item of parseJsonArray(out, "history.json", history, TraktHistoryItem)) {
      if (item.movie) {
        out.watches.push({
          ref: toRef("movie", item.movie),
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false, // runner marks rewatches per-title by watch order
          tags: [],
          note: null,
        });
      } else if (item.show && item.episode) {
        out.watches.push({
          ref: toRef("series", item.show),
          episode: {
            tmdbEpisodeId: item.episode.ids?.tmdb ?? undefined,
            seasonNumber: item.episode.season,
            episodeNumber: item.episode.number,
          },
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false,
          tags: [],
          note: null,
        });
      } else if (item.show) {
        out.watches.push({
          ref: toRef("series", item.show),
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false,
          tags: [],
          note: null,
        });
      } else {
        out.unmappable.push({ file: "history.json", line: 0, reason: "row has no movie/show" });
      }
    }
  }

  const ratings = files.get("ratings.json");
  if (ratings !== undefined) {
    for (const item of parseJsonArray(out, "ratings.json", ratings, TraktRatingItem)) {
      const ratedAt = item.rated_at !== undefined ? item.rated_at.slice(0, 10) : null;
      if (item.type === "movie" && item.movie) {
        out.ratings.push({ ref: toRef("movie", item.movie), score: item.rating, thumb: null, ratedAt });
      } else if (item.type === "show" && item.show) {
        out.ratings.push({ ref: toRef("series", item.show), score: item.rating, thumb: null, ratedAt });
      } else {
        out.unmappable.push({
          file: "ratings.json",
          line: 0,
          reason: `${item.type ?? "unknown"} rating not yet importable (episode rating)`,
        });
      }
    }
  }

  const watchlist = files.get("watchlist.json");
  if (watchlist !== undefined) {
    for (const item of parseJsonArray(out, "watchlist.json", watchlist, TraktWatchlistItem)) {
      const title = item.movie ?? item.show;
      if (!title) {
        out.unmappable.push({ file: "watchlist.json", line: 0, reason: "row has no movie/show" });
        continue;
      }
      out.watchlist.push({
        ref: toRef(item.movie ? "movie" : "series", title),
        addedAt: item.listed_at !== undefined ? item.listed_at.slice(0, 10) : null,
        note: item.notes ?? null,
      });
    }
  }

  return out;
}
