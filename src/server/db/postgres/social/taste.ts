/**
 * Taste-profile SQL (spec docs/superpowers/specs/2026-10-09-taste-profile-design.md).
 * Reads a user's signals + the catalog metadata the pure math in
 * `src/lib/taste/` needs, and reads/writes the `user_taste_profiles` row.
 * Orchestration (lazy recompute, caching) lives in `server/services/taste/`.
 *
 * Every query is bounded: signal sources take the SOURCE_ROW_CAP most recent
 * rows, metadata/embedding queries take an explicit id list (≤ TITLE_CAP).
 * No AI, no embedding generation — stored `embedding` columns only.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { SOURCE_ROW_CAP } from "@/lib/taste/constants";
import {
  titleKey,
  type FacetValue,
  type PersonInfo,
  type SeriesStatusLite,
  type TasteMediaType,
  type TitleKey,
  type TitleMeta,
  type TitleSignals,
} from "@/lib/taste/types";

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

interface RatingRaw {
  movie_id: number | null;
  series_id: number | null;
  score: number | null;
  thumb: number | null;
  liked: boolean;
  rated_at: Date;
}

interface WatchRaw {
  movie_id: number | null;
  series_id: number | null;
  all_count: number;
  public_count: number;
  all_max_cycle: number;
  public_max_cycle: number;
  all_last: Date | null;
  public_last: Date | null;
}

function emptySignals(mediaType: TasteMediaType, id: number): TitleSignals {
  return {
    key: titleKey(mediaType, id),
    mediaType,
    id,
    isFavorite: false,
    rating: null,
    watches: {
      count: { public: 0, all: 0 },
      maxCycle: { public: 0, all: 0 },
      lastAt: { public: null, all: null },
    },
    progress: null,
    watchlistedAt: null,
  };
}

/**
 * Every raw taste signal for a user, keyed by title. The public/full split is
 * NOT applied here — rows carry both counts and the pure layer filters per
 * scope (so one fetch serves both projections).
 */
export async function fetchTasteSignals(userId: number): Promise<TitleSignals[]> {
  const [ratings, watches, progress, favorites, watchlist] = await Promise.all([
    prisma.$queryRaw<RatingRaw[]>`
      SELECT movie_id, series_id, score, rating AS thumb, liked,
             COALESCE(rated_at, created_at) AS rated_at
      FROM user_ratings
      WHERE user_id = ${userId}
        AND (movie_id IS NOT NULL
             OR (series_id IS NOT NULL AND season_number IS NULL AND episode_number IS NULL))
      ORDER BY COALESCE(rated_at, created_at) DESC
      LIMIT ${SOURCE_ROW_CAP}
    `,
    prisma.$queryRaw<WatchRaw[]>`
      SELECT movie_id, series_id,
             count(*)::int AS all_count,
             (count(*) FILTER (WHERE NOT is_private))::int AS public_count,
             COALESCE(max(cycle), 0)::int AS all_max_cycle,
             COALESCE(max(cycle) FILTER (WHERE NOT is_private), 0)::int AS public_max_cycle,
             max(COALESCE(watched_at, created_at)) AS all_last,
             max(COALESCE(watched_at, created_at)) FILTER (WHERE NOT is_private) AS public_last
      FROM watch_events
      WHERE user_id = ${userId} AND kind = 'WATCH'
      GROUP BY movie_id, series_id
      ORDER BY all_last DESC NULLS LAST
      LIMIT ${SOURCE_ROW_CAP}
    `,
    prisma.seriesProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: SOURCE_ROW_CAP,
      select: { seriesId: true, status: true, updatedAt: true },
    }),
    prisma.listItem.findMany({
      where: { list: { ownerId: userId, kind: "FOUR_FAVORITES" } },
      select: { movieId: true, seriesId: true },
      take: 8,
    }),
    prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      take: SOURCE_ROW_CAP,
      select: { movieId: true, seriesId: true, addedAt: true },
    }),
  ]);

  const map = new Map<TitleKey, TitleSignals>();
  const get = (movieId: number | null, seriesId: number | null): TitleSignals | null => {
    const mediaType: TasteMediaType | null =
      movieId !== null ? "movie" : seriesId !== null ? "series" : null;
    const id = movieId ?? seriesId;
    if (!mediaType || id === null) return null;
    const key = titleKey(mediaType, id);
    let s = map.get(key);
    if (!s) {
      s = emptySignals(mediaType, id);
      map.set(key, s);
    }
    return s;
  };

  for (const r of ratings) {
    const s = get(r.movie_id, r.series_id);
    if (!s) continue;
    s.rating = {
      score: r.score === null ? null : Number(r.score),
      thumb: r.thumb === null ? null : Number(r.thumb),
      liked: r.liked,
      ratedAt: r.rated_at,
    };
  }
  for (const w of watches) {
    const s = get(w.movie_id, w.series_id);
    if (!s) continue;
    s.watches = {
      count: { public: Number(w.public_count), all: Number(w.all_count) },
      maxCycle: { public: Number(w.public_max_cycle), all: Number(w.all_max_cycle) },
      lastAt: { public: w.public_last, all: w.all_last },
    };
  }
  for (const p of progress) {
    const s = get(null, p.seriesId);
    if (s) s.progress = { status: p.status as SeriesStatusLite, updatedAt: p.updatedAt };
  }
  for (const f of favorites) {
    const s = get(f.movieId, f.seriesId);
    if (s) s.isFavorite = true;
  }
  for (const w of watchlist) {
    const s = get(w.movieId, w.seriesId);
    if (s) s.watchlistedAt = w.addedAt;
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

/** Stored Cohere embeddings for the given titles (`::real[]`, no text parsing). */
export async function fetchTitleEmbeddings(
  movieIds: number[],
  seriesIds: number[]
): Promise<Map<TitleKey, number[]>> {
  const out = new Map<TitleKey, number[]>();
  const [movies, series] = await Promise.all([
    movieIds.length
      ? prisma.$queryRaw<Array<{ id: number; v: number[] }>>`
          SELECT id, embedding::real[] AS v FROM movies
          WHERE id = ANY(${movieIds}::int[]) AND embedding IS NOT NULL`
      : Promise.resolve([]),
    seriesIds.length
      ? prisma.$queryRaw<Array<{ id: number; v: number[] }>>`
          SELECT id, embedding::real[] AS v FROM series
          WHERE id = ANY(${seriesIds}::int[]) AND embedding IS NOT NULL`
      : Promise.resolve([]),
  ]);
  for (const r of movies) out.set(titleKey("movie", r.id), r.v.map(Number));
  for (const r of series) out.set(titleKey("series", r.id), r.v.map(Number));
  return out;
}

// ---------------------------------------------------------------------------
// Title metadata (facets + axis inputs)
// ---------------------------------------------------------------------------

/** Lower-cased, whitespace-collapsed key for free-text AI tags ("Mind-Bending " → "mind-bending"). */
export function normalizeTagKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

const MOOD_LABELS: Record<string, string> = {
  "pacing:fast": "Fast-paced",
  "pacing:steady": "Steady pacing",
  "pacing:slow": "Slow-burn",
  "intensity:high": "High intensity",
  "intensity:medium": "Medium intensity",
  "intensity:low": "Low intensity",
  "tone:dark": "Dark tone",
  "tone:light": "Light tone",
  "tone:mixed": "Mixed tone",
  "emotional:heavy": "Emotionally heavy",
  "emotional:medium": "Emotionally balanced",
  "emotional:light": "Emotionally light",
};

export function moodLabel(key: string): string | null {
  return MOOD_LABELS[key] ?? null;
}

/** Title-case a free-text tag for display without rewriting its words. */
function displayTag(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface CoreRaw {
  id: number;
  title: string;
  poster_path: string | null;
  year: number | null;
  popularity: number | null;
  language: string | null;
  language_name: string | null;
  tmdb_avg: number | null;
}

interface PairRaw {
  id: number;
  key: string;
  label: string;
}

interface PersonRaw {
  id: number;
  tmdb_id: number;
  name: string;
  profile_path: string | null;
  role: "director" | "cast";
}

interface AiRaw {
  id: number;
  category: "THEME" | "VIBE" | "MOOD";
  subcategory: string | null;
  text: string;
}

const TMDB_SOURCE = Prisma.sql`(SELECT id FROM data_sources WHERE slug = 'tmdb')`;

async function fetchMetaFor(mediaType: TasteMediaType, ids: number[]) {
  if (ids.length === 0) {
    return { core: [] as CoreRaw[], pairs: [] as (PairRaw & { type: FacetValue["type"] })[], persons: [] as PersonRaw[], ai: [] as AiRaw[] };
  }
  const isMovie = mediaType === "movie";
  const core = isMovie
    ? prisma.$queryRaw<CoreRaw[]>`
        SELECT m.id, m.title, m.poster_path, EXTRACT(YEAR FROM m.release_date)::int AS year,
               m.popularity, m.original_language AS language, l.english_name AS language_name,
               r.score AS tmdb_avg
        FROM movies m
        LEFT JOIN languages l ON l.code = m.original_language
        LEFT JOIN ratings r ON r.movie_id = m.id AND r.source_id = ${TMDB_SOURCE}
        WHERE m.id = ANY(${ids}::int[])`
    : prisma.$queryRaw<CoreRaw[]>`
        SELECT s.id, s.name AS title, s.poster_path, EXTRACT(YEAR FROM s.first_air_date)::int AS year,
               s.popularity, s.original_language AS language, l.english_name AS language_name,
               r.score AS tmdb_avg
        FROM series s
        LEFT JOIN languages l ON l.code = s.original_language
        LEFT JOIN ratings r ON r.series_id = s.id AND r.source_id = ${TMDB_SOURCE}
        WHERE s.id = ANY(${ids}::int[])`;
  const genres = isMovie
    ? prisma.$queryRaw<PairRaw[]>`
        SELECT mg.movie_id AS id, lower(g.name) AS key, g.name AS label
        FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
        WHERE mg.movie_id = ANY(${ids}::int[])`
    : prisma.$queryRaw<PairRaw[]>`
        SELECT sg.series_id AS id, lower(g.name) AS key, g.name AS label
        FROM series_genres sg JOIN genres g ON g.id = sg.genre_id
        WHERE sg.series_id = ANY(${ids}::int[])`;
  const keywords = isMovie
    ? prisma.$queryRaw<PairRaw[]>`
        SELECT mk.movie_id AS id, k.tmdb_id::text AS key, k.name AS label
        FROM movie_keywords mk JOIN keywords k ON k.id = mk.keyword_id
        WHERE mk.movie_id = ANY(${ids}::int[])`
    : prisma.$queryRaw<PairRaw[]>`
        SELECT sk.series_id AS id, k.tmdb_id::text AS key, k.name AS label
        FROM series_keywords sk JOIN keywords k ON k.id = sk.keyword_id
        WHERE sk.series_id = ANY(${ids}::int[])`;
  const countries = isMovie
    ? prisma.$queryRaw<PairRaw[]>`
        SELECT DISTINCT mc.movie_id AS id, mc.country_code AS key, c.name AS label
        FROM movie_countries mc JOIN countries c ON c.code = mc.country_code
        WHERE mc.movie_id = ANY(${ids}::int[])`
    : prisma.$queryRaw<PairRaw[]>`
        SELECT DISTINCT sc.series_id AS id, sc.country_code AS key, c.name AS label
        FROM series_countries sc JOIN countries c ON c.code = sc.country_code
        WHERE sc.series_id = ANY(${ids}::int[])`;
  const persons = isMovie
    ? prisma.$queryRaw<PersonRaw[]>`
        SELECT c.movie_id AS id, p.tmdb_id, p.name, p.profile_path,
               CASE WHEN c.credit_type = 'CAST' THEN 'cast' ELSE 'director' END AS role
        FROM credits c JOIN persons p ON p.id = c.person_id
        WHERE c.movie_id = ANY(${ids}::int[]) AND p.adult = false
          AND ((c.credit_type = 'CAST' AND c.credit_order IS NOT NULL AND c.credit_order < 5)
               OR (c.credit_type = 'CREW' AND c.job = 'Director'))`
    : prisma.$queryRaw<PersonRaw[]>`
        SELECT c.series_id AS id, p.tmdb_id, p.name, p.profile_path, 'cast' AS role
        FROM credits c JOIN persons p ON p.id = c.person_id
        WHERE c.series_id = ANY(${ids}::int[]) AND c.is_aggregate = false AND p.adult = false
          AND c.credit_type = 'CAST' AND c.credit_order IS NOT NULL AND c.credit_order < 5
        UNION ALL
        SELECT sc.series_id AS id, p.tmdb_id, p.name, p.profile_path, 'director' AS role
        FROM series_creators sc JOIN persons p ON p.id = sc.person_id
        WHERE sc.series_id = ANY(${ids}::int[]) AND p.adult = false`;
  const ai = isMovie
    ? prisma.$queryRaw<AiRaw[]>`
        SELECT ad.movie_id AS id, ai.category::text AS category, ai.subcategory, ai.text
        FROM ai_data ad JOIN ai_insights ai ON ai.ai_data_id = ad.id
        WHERE ad.movie_id = ANY(${ids}::int[]) AND ai.spoiler_level = 'FREE'
          AND ai.category IN ('THEME', 'VIBE', 'MOOD')`
    : prisma.$queryRaw<AiRaw[]>`
        SELECT ad.series_id AS id, ai.category::text AS category, ai.subcategory, ai.text
        FROM ai_data ad JOIN ai_insights ai ON ai.ai_data_id = ad.id
        WHERE ad.series_id = ANY(${ids}::int[]) AND ai.spoiler_level = 'FREE'
          AND ai.category IN ('THEME', 'VIBE', 'MOOD')`;

  const [c, g, k, co, p, a] = await Promise.all([core, genres, keywords, countries, persons, ai]);
  return {
    core: c,
    pairs: [
      ...g.map((x) => ({ ...x, type: "genre" as const })),
      ...k.map((x) => ({ ...x, type: "keyword" as const })),
      ...co.map((x) => ({ ...x, type: "country" as const })),
    ],
    persons: p,
    ai: a,
  };
}

/**
 * Catalog metadata for a set of titles: display ref, axis inputs and every
 * facet value (genre, keyword, AI theme/mood, director, cast, country,
 * language, decade). Also returns person display info keyed by tmdb id.
 */
export async function fetchTitleMeta(
  movieIds: number[],
  seriesIds: number[]
): Promise<{ meta: Map<TitleKey, TitleMeta>; people: Map<string, PersonInfo> }> {
  const [m, s] = await Promise.all([fetchMetaFor("movie", movieIds), fetchMetaFor("series", seriesIds)]);
  const meta = new Map<TitleKey, TitleMeta>();
  const people = new Map<string, PersonInfo>();

  const build = (mediaType: TasteMediaType, data: Awaited<ReturnType<typeof fetchMetaFor>>) => {
    for (const r of data.core) {
      const facets: FacetValue[] = [];
      if (r.year !== null) {
        const decade = Math.floor(Number(r.year) / 10) * 10;
        facets.push({ type: "decade", key: String(decade), label: `${decade}s` });
      }
      if (r.language) {
        facets.push({ type: "language", key: r.language, label: r.language_name ?? r.language.toUpperCase() });
      }
      meta.set(titleKey(mediaType, r.id), {
        key: titleKey(mediaType, r.id),
        ref: { mediaType, tmdbId: r.id, title: r.title, posterPath: r.poster_path },
        year: r.year === null ? null : Number(r.year),
        popularity: r.popularity === null ? null : Number(r.popularity),
        tmdbAvg: r.tmdb_avg === null ? null : Number(r.tmdb_avg),
        facets,
        mood: { emotional: null, tone: null },
      });
    }
    for (const pr of data.pairs) {
      // TMDB keywords are lower-case ("time travel") — sentence-case them for display.
      const label = pr.type === "keyword" ? displayTag(pr.label) : pr.label;
      meta.get(titleKey(mediaType, pr.id))?.facets.push({ type: pr.type, key: pr.key, label });
    }
    for (const p of data.persons) {
      const t = meta.get(titleKey(mediaType, p.id));
      if (!t) continue;
      const key = String(p.tmdb_id);
      t.facets.push({ type: p.role, key, label: p.name });
      if (!people.has(key)) people.set(key, { tmdbId: Number(p.tmdb_id), name: p.name, profilePath: p.profile_path });
    }
    for (const a of data.ai) {
      const t = meta.get(titleKey(mediaType, a.id));
      if (!t || !a.text) continue;
      if (a.category === "MOOD") {
        const value = normalizeTagKey(a.text);
        const sub = a.subcategory ?? "";
        if (sub === "emotional") t.mood.emotional = value;
        if (sub === "tone") t.mood.tone = value;
        const key = `${sub}:${value}`;
        const label = moodLabel(key);
        if (label) t.facets.push({ type: "mood", key, label });
      } else {
        const key = normalizeTagKey(a.text);
        if (key.length > 0 && key.length <= 60) t.facets.push({ type: "theme", key, label: displayTag(a.text) });
      }
    }
  };
  build("movie", m);
  build("series", s);
  return { meta, people };
}

// ---------------------------------------------------------------------------
// Baseline (catalog) counts — cached by the service layer.
// ---------------------------------------------------------------------------

export type BaselineMode = "votes" | "all";

/** Size of the vote-gated baseline (movies + series). */
export async function countVoteBaseline(minVotes: number): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT (
      (SELECT count(*) FROM ratings r JOIN movies m ON m.id = r.movie_id
        WHERE r.source_id = ${TMDB_SOURCE} AND r.vote_count >= ${minVotes} AND m.adult = false)
      +
      (SELECT count(*) FROM ratings r JOIN series s ON s.id = r.series_id
        WHERE r.source_id = ${TMDB_SOURCE} AND r.vote_count >= ${minVotes} AND s.adult = false)
    )::int AS n`;
  return Number(rows[0]?.n ?? 0);
}

export async function countAllBaseline(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT ((SELECT count(*) FROM movies WHERE adult = false)
          + (SELECT count(*) FROM series WHERE adult = false))::int AS n`;
  return Number(rows[0]?.n ?? 0);
}

export async function countEnrichedBaseline(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM ai_data`;
  return Number(rows[0]?.n ?? 0);
}

/** Membership predicate for a catalog row in the baseline population. */
function inBaseline(mode: BaselineMode, table: "m" | "s", minVotes: number): Prisma.Sql {
  const col = table === "m" ? Prisma.sql`r.movie_id = m.id` : Prisma.sql`r.series_id = s.id`;
  const adult = table === "m" ? Prisma.sql`m.adult = false` : Prisma.sql`s.adult = false`;
  if (mode === "all") return adult;
  return Prisma.sql`${adult} AND EXISTS (
    SELECT 1 FROM ratings r WHERE ${col} AND r.source_id = ${TMDB_SOURCE} AND r.vote_count >= ${minVotes})`;
}

type CountRow = { key: string; n: number };
const toMap = (rows: CountRow[]) => {
  const out = new Map<string, number>();
  for (const r of rows) out.set(String(r.key), (out.get(String(r.key)) ?? 0) + Number(r.n));
  return out;
};

/** Baseline counts for specific facet keys (keys must be non-empty). */
export async function fetchBaselineCounts(
  type: FacetValue["type"],
  keys: string[],
  mode: BaselineMode,
  minVotes: number
): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const bm = inBaseline(mode, "m", minVotes);
  const bs = inBaseline(mode, "s", minVotes);
  switch (type) {
    case "genre":
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT lower(g.name) AS key, count(*)::int AS n FROM movie_genres x
          JOIN genres g ON g.id = x.genre_id JOIN movies m ON m.id = x.movie_id
          WHERE lower(g.name) = ANY(${keys}::text[]) AND ${bm} GROUP BY 1
        UNION ALL
        SELECT lower(g.name) AS key, count(*)::int AS n FROM series_genres x
          JOIN genres g ON g.id = x.genre_id JOIN series s ON s.id = x.series_id
          WHERE lower(g.name) = ANY(${keys}::text[]) AND ${bs} GROUP BY 1`);
    case "keyword": {
      const ids = keys.map(Number).filter(Number.isFinite);
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT k.tmdb_id::text AS key, count(*)::int AS n FROM movie_keywords x
          JOIN keywords k ON k.id = x.keyword_id JOIN movies m ON m.id = x.movie_id
          WHERE k.tmdb_id = ANY(${ids}::int[]) AND ${bm} GROUP BY 1
        UNION ALL
        SELECT k.tmdb_id::text AS key, count(*)::int AS n FROM series_keywords x
          JOIN keywords k ON k.id = x.keyword_id JOIN series s ON s.id = x.series_id
          WHERE k.tmdb_id = ANY(${ids}::int[]) AND ${bs} GROUP BY 1`);
    }
    case "country":
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT x.country_code AS key, count(DISTINCT x.movie_id)::int AS n FROM movie_countries x
          JOIN movies m ON m.id = x.movie_id
          WHERE x.country_code = ANY(${keys}::text[]) AND ${bm} GROUP BY 1
        UNION ALL
        SELECT x.country_code AS key, count(DISTINCT x.series_id)::int AS n FROM series_countries x
          JOIN series s ON s.id = x.series_id
          WHERE x.country_code = ANY(${keys}::text[]) AND ${bs} GROUP BY 1`);
    case "language":
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT m.original_language AS key, count(*)::int AS n FROM movies m
          WHERE m.original_language = ANY(${keys}::text[]) AND ${bm} GROUP BY 1
        UNION ALL
        SELECT s.original_language AS key, count(*)::int AS n FROM series s
          WHERE s.original_language = ANY(${keys}::text[]) AND ${bs} GROUP BY 1`);
    case "decade": {
      const decades = keys.map(Number).filter(Number.isFinite);
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT ((EXTRACT(YEAR FROM m.release_date)::int / 10) * 10)::text AS key, count(*)::int AS n
          FROM movies m WHERE m.release_date IS NOT NULL AND ${bm}
          AND ((EXTRACT(YEAR FROM m.release_date)::int / 10) * 10) = ANY(${decades}::int[]) GROUP BY 1
        UNION ALL
        SELECT ((EXTRACT(YEAR FROM s.first_air_date)::int / 10) * 10)::text AS key, count(*)::int AS n
          FROM series s WHERE s.first_air_date IS NOT NULL AND ${bs}
          AND ((EXTRACT(YEAR FROM s.first_air_date)::int / 10) * 10) = ANY(${decades}::int[]) GROUP BY 1`);
    }
    case "director": {
      const ids = keys.map(Number).filter(Number.isFinite);
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT p.tmdb_id::text AS key, count(DISTINCT c.movie_id)::int AS n FROM persons p
          JOIN credits c ON c.person_id = p.id JOIN movies m ON m.id = c.movie_id
          WHERE p.tmdb_id = ANY(${ids}::int[]) AND c.credit_type = 'CREW' AND c.job = 'Director' AND ${bm}
          GROUP BY 1
        UNION ALL
        SELECT p.tmdb_id::text AS key, count(DISTINCT x.series_id)::int AS n FROM persons p
          JOIN series_creators x ON x.person_id = p.id JOIN series s ON s.id = x.series_id
          WHERE p.tmdb_id = ANY(${ids}::int[]) AND ${bs} GROUP BY 1`);
    }
    case "cast": {
      const ids = keys.map(Number).filter(Number.isFinite);
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT p.tmdb_id::text AS key, count(DISTINCT c.movie_id)::int AS n FROM persons p
          JOIN credits c ON c.person_id = p.id JOIN movies m ON m.id = c.movie_id
          WHERE p.tmdb_id = ANY(${ids}::int[]) AND c.credit_type = 'CAST'
            AND c.credit_order IS NOT NULL AND c.credit_order < 5 AND ${bm}
          GROUP BY 1
        UNION ALL
        SELECT p.tmdb_id::text AS key, count(DISTINCT c.series_id)::int AS n FROM persons p
          JOIN credits c ON c.person_id = p.id JOIN series s ON s.id = c.series_id
          WHERE p.tmdb_id = ANY(${ids}::int[]) AND c.credit_type = 'CAST' AND c.is_aggregate = false
            AND c.credit_order IS NOT NULL AND c.credit_order < 5 AND ${bs}
          GROUP BY 1`);
    }
    case "theme":
      // Population = the enriched catalog (only ai_data titles can carry a tag).
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT lower(regexp_replace(btrim(text), '\\s+', ' ', 'g')) AS key,
               count(DISTINCT ai_data_id)::int AS n
        FROM ai_insights
        WHERE category IN ('THEME', 'VIBE') AND spoiler_level = 'FREE'
          AND lower(regexp_replace(btrim(text), '\\s+', ' ', 'g')) = ANY(${keys}::text[])
        GROUP BY 1`);
    case "mood":
      return toMap(await prisma.$queryRaw<CountRow[]>`
        SELECT subcategory || ':' || lower(btrim(text)) AS key, count(DISTINCT ai_data_id)::int AS n
        FROM ai_insights
        WHERE category = 'MOOD' AND subcategory || ':' || lower(btrim(text)) = ANY(${keys}::text[])
        GROUP BY 1`);
  }
}

/** 101 catalog quantiles of popularity and release year over the baseline. */
export async function fetchCatalogQuantiles(
  mode: BaselineMode,
  minVotes: number
): Promise<{ popularity: number[]; year: number[] }> {
  const bm = inBaseline(mode, "m", minVotes);
  const bs = inBaseline(mode, "s", minVotes);
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);
  const rows = await prisma.$queryRaw<Array<{ pop: number[] | null; yr: number[] | null }>>`
    WITH b AS (
      SELECT m.popularity AS pop, EXTRACT(YEAR FROM m.release_date)::float8 AS yr FROM movies m WHERE ${bm}
      UNION ALL
      SELECT s.popularity AS pop, EXTRACT(YEAR FROM s.first_air_date)::float8 AS yr FROM series s WHERE ${bs}
    )
    SELECT percentile_cont(${steps}::float8[]) WITHIN GROUP (ORDER BY pop) FILTER (WHERE pop IS NOT NULL) AS pop,
           percentile_cont(${steps}::float8[]) WITHIN GROUP (ORDER BY yr) FILTER (WHERE yr IS NOT NULL) AS yr
    FROM b`;
  const r = rows[0];
  return {
    popularity: (r?.pop ?? []).map(Number),
    year: (r?.yr ?? []).map(Number),
  };
}

// ---------------------------------------------------------------------------
// The profile row
// ---------------------------------------------------------------------------

export interface TasteRow {
  dirty: boolean;
  updatedAt: Date;
  computedAt: Date | null;
  algoVersion: number;
  publicSnapshot: unknown;
  facets: unknown;
  axes: unknown;
  clusters: unknown;
  signalCount: number;
  positiveCount: number;
}

export async function readTasteRow(userId: number): Promise<TasteRow | null> {
  return prisma.userTasteProfile.findUnique({
    where: { userId },
    select: {
      dirty: true,
      updatedAt: true,
      computedAt: true,
      algoVersion: true,
      publicSnapshot: true,
      facets: true,
      axes: true,
      clusters: true,
      signalCount: true,
      positiveCount: true,
    },
  });
}

const vecLiteral = (v: number[] | null): string | null =>
  v ? `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]` : null;

export interface TasteWrite {
  centroid: number[] | null;
  negCentroid: number[] | null;
  publicCentroid: number[] | null;
  clusters: unknown;
  facets: unknown;
  axes: unknown;
  publicSnapshot: unknown;
  signalCount: number;
  positiveCount: number;
  algoVersion: number;
  computedAt: Date;
}

/**
 * Upsert the computed profile and clear `dirty`. Vectors go through
 * `::vector` casts (Prisma can't bind pgvector). A dirty mark that lands
 * WHILE we computed is preserved: the markers bump `updated_at`, so `dirty`
 * is only cleared when the row's `updated_at` is unchanged since we read it
 * (`observedUpdatedAt`, DB clock — no app/DB skew).
 */
export async function writeTasteRow(
  userId: number,
  w: TasteWrite,
  observedUpdatedAt: Date | null
): Promise<void> {
  const observed = observedUpdatedAt ?? new Date(0);
  const json = (x: unknown) => JSON.stringify(x ?? null);
  await prisma.$executeRaw`
    INSERT INTO user_taste_profiles (
      user_id, centroid, neg_centroid, public_centroid, clusters, facets, axes,
      signal_count, positive_count, public_snapshot, algo_version, dirty, computed_at, updated_at)
    VALUES (
      ${userId}, ${vecLiteral(w.centroid)}::vector, ${vecLiteral(w.negCentroid)}::vector,
      ${vecLiteral(w.publicCentroid)}::vector, ${json(w.clusters)}::jsonb, ${json(w.facets)}::jsonb,
      ${json(w.axes)}::jsonb, ${w.signalCount}, ${w.positiveCount}, ${json(w.publicSnapshot)}::jsonb,
      ${w.algoVersion}, false, ${w.computedAt}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      centroid = EXCLUDED.centroid,
      neg_centroid = EXCLUDED.neg_centroid,
      public_centroid = EXCLUDED.public_centroid,
      clusters = EXCLUDED.clusters,
      facets = EXCLUDED.facets,
      axes = EXCLUDED.axes,
      signal_count = EXCLUDED.signal_count,
      positive_count = EXCLUDED.positive_count,
      public_snapshot = EXCLUDED.public_snapshot,
      algo_version = EXCLUDED.algo_version,
      computed_at = EXCLUDED.computed_at,
      dirty = CASE WHEN user_taste_profiles.updated_at > ${observed} AND user_taste_profiles.dirty
                   THEN true ELSE false END,
      updated_at = now()
  `;
}

export type TasteVectorColumn = "centroid" | "neg_centroid" | "public_centroid";

export async function readTasteVectors(
  userId: number
): Promise<{ centroid: number[] | null; negCentroid: number[] | null; publicCentroid: number[] | null }> {
  const rows = await prisma.$queryRaw<
    Array<{ c: number[] | null; n: number[] | null; p: number[] | null }>
  >`
    SELECT centroid::real[] AS c, neg_centroid::real[] AS n, public_centroid::real[] AS p
    FROM user_taste_profiles WHERE user_id = ${userId}`;
  const r = rows[0];
  const conv = (v: number[] | null | undefined) => (v ? v.map(Number) : null);
  return { centroid: conv(r?.c), negCentroid: conv(r?.n), publicCentroid: conv(r?.p) };
}
