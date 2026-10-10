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
import type { SpaceKind } from "@/lib/taste/space";
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

  // Titles that reached the map via ratings/progress/favorites/watchlist but
  // fell outside the 500 most-recent WATCH aggregates: fetch their WATCH counts
  // by id (bounded by the other sources' caps) so weighting isn't starved.
  const all = [...map.values()];
  const missingM = all.filter((s) => s.mediaType === "movie" && s.watches.count.all === 0).map((s) => s.id);
  const missingS = all.filter((s) => s.mediaType === "series" && s.watches.count.all === 0).map((s) => s.id);
  const movieIds = all.filter((s) => s.mediaType === "movie").map((s) => s.id);
  const seriesIds = all.filter((s) => s.mediaType === "series").map((s) => s.id);
  const [extraWatches, entries] = await Promise.all([
    missingM.length + missingS.length > 0
      ? prisma.$queryRaw<WatchRaw[]>`
          SELECT movie_id, series_id,
                 count(*)::int AS all_count,
                 (count(*) FILTER (WHERE NOT is_private))::int AS public_count,
                 COALESCE(max(cycle), 0)::int AS all_max_cycle,
                 COALESCE(max(cycle) FILTER (WHERE NOT is_private), 0)::int AS public_max_cycle,
                 max(COALESCE(watched_at, created_at)) AS all_last,
                 max(COALESCE(watched_at, created_at)) FILTER (WHERE NOT is_private) AS public_last
          FROM watch_events
          WHERE user_id = ${userId} AND kind = 'WATCH'
            AND (movie_id = ANY(${missingM}::int[]) OR series_id = ANY(${missingS}::int[]))
          GROUP BY movie_id, series_id`
      : Promise.resolve([] as WatchRaw[]),
    fetchEntryVisibility(userId, movieIds, seriesIds),
  ]);
  for (const w of extraWatches) {
    const s = get(w.movie_id, w.series_id);
    if (!s) continue;
    s.watches = {
      count: { public: Number(w.public_count), all: Number(w.all_count) },
      maxCycle: { public: Number(w.public_max_cycle), all: Number(w.all_max_cycle) },
      lastAt: { public: w.public_last, all: w.all_last },
    };
  }
  for (const e of entries) {
    const s = get(e.movie_id, e.series_id);
    if (s) {
      s.entries = {
        hasPublic: e.has_public,
        hasPrivate: e.has_private,
        publicScored: e.public_scored,
        privateScored: e.private_scored,
      };
    }
  }
  // Titles with no entry rows at all keep `entries` undefined → treated as a
  // public quick-rate (no diary/review evidence either way).
  return [...map.values()];
}

interface EntryVisibilityRaw {
  movie_id: number | null;
  series_id: number | null;
  has_public: boolean;
  has_private: boolean;
  public_scored: boolean;
  private_scored: boolean;
}

/**
 * Visibility of ALL the user's entries per title — WATCH and NOTE diary
 * entries (any kind) and reviews — computed by id with NO row cap, so the
 * public/private decision never depends on how recent an entry is. A
 * "scored" entry is one that can have written the canonical rating: a
 * watch_event with a score, or a review (the review composer upserts it).
 */
export async function fetchEntryVisibility(
  userId: number,
  movieIds: number[],
  seriesIds: number[]
): Promise<EntryVisibilityRaw[]> {
  if (movieIds.length + seriesIds.length === 0) return [];
  return prisma.$queryRaw<EntryVisibilityRaw[]>`
    SELECT movie_id, series_id,
           bool_or(NOT is_private) AS has_public,
           bool_or(is_private) AS has_private,
           bool_or(NOT is_private AND scored) AS public_scored,
           bool_or(is_private AND scored) AS private_scored
    FROM (
      SELECT movie_id, series_id, is_private, (score IS NOT NULL) AS scored
      FROM watch_events
      WHERE user_id = ${userId}
        AND (movie_id = ANY(${movieIds}::int[]) OR series_id = ANY(${seriesIds}::int[]))
      UNION ALL
      SELECT movie_id, series_id, is_private, true AS scored
      FROM user_reviews
      WHERE user_id = ${userId}
        AND (movie_id = ANY(${movieIds}::int[]) OR series_id = ANY(${seriesIds}::int[]))
    ) e
    GROUP BY movie_id, series_id`;
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

/**
 * Keyword names that must never surface as a public facet/cluster label on the
 * indexable /u/* pages (seo-search-console.md: adult content stays out of
 * search surfaces). Adult-flagged TITLES are already excluded from metadata;
 * this catches adult-adjacent keywords on mainstream titles. Display hygiene,
 * NOT classification — broad on purpose.
 */
const ADULT_KEYWORD_RE =
  /\b(softcore|porn\w*|xxx|erotic\w*|sex\w*|nudity|nude|naked|fetish\w*|bdsm|orgy|orgies|striptease|stripper\w*|prostitut\w*|hentai|incest|masturbat\w*|voyeur\w*)\b/i;

export function isAdultKeyword(name: string): boolean {
  return ADULT_KEYWORD_RE.test(name);
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
        WHERE m.id = ANY(${ids}::int[]) AND m.adult = false`
    : prisma.$queryRaw<CoreRaw[]>`
        SELECT s.id, s.name AS title, s.poster_path, EXTRACT(YEAR FROM s.first_air_date)::int AS year,
               s.popularity, s.original_language AS language, l.english_name AS language_name,
               r.score AS tmdb_avg
        FROM series s
        LEFT JOIN languages l ON l.code = s.original_language
        LEFT JOIN ratings r ON r.series_id = s.id AND r.source_id = ${TMDB_SOURCE}
        WHERE s.id = ANY(${ids}::int[]) AND s.adult = false`;
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
      if (pr.type === "keyword" && isAdultKeyword(pr.label)) continue;
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
        if (key.length > 0 && key.length <= 60 && !isAdultKeyword(key)) t.facets.push({ type: "theme", key, label: displayTag(a.text) });
      }
    }
  };
  build("movie", m);
  build("series", s);
  return { meta, people };
}

// ---------------------------------------------------------------------------
// Baseline — REQUEST PATH: primary-key lookups only. The catalog scans that
// fill these tables live in taste-baseline.ts and run in the nightly
// `taste-baseline` cron, never on a render.
// ---------------------------------------------------------------------------

export interface BaselineMeta {
  mode: string;
  catalogSize: number;
  enrichedSize: number;
  popularityQuantiles: number[];
  yearQuantiles: number[];
  computedAt: Date | null;
}

/** The singleton baseline meta row (null on a fresh env before the first cron run). */
export async function readBaselineMeta(): Promise<BaselineMeta | null> {
  const row = await prisma.tasteBaselineMeta.findUnique({
    where: { id: 1 },
    select: {
      mode: true,
      catalogSize: true,
      enrichedSize: true,
      popularityQuantiles: true,
      yearQuantiles: true,
      computedAt: true,
    },
  });
  return row && row.computedAt ? row : null;
}

export interface EmbeddingStats {
  mean: number[];
  std: number[];
  count: number;
  /** When the cron computed μ (the meta row's computed_at; same transaction). */
  computedAt: Date | null;
}

/**
 * The catalog embedding mean/std written by the baseline cron (PK lookup).
 * Null when absent (fresh env / below SPACE_MIN_TITLES) → raw space. Raw SQL:
 * Prisma can't read pgvector columns.
 */
export async function readEmbeddingStats(): Promise<EmbeddingStats | null> {
  const rows = await prisma.$queryRaw<
    Array<{ mean: number[] | null; std: number[] | null; n: number; at: Date | null }>
  >`
    SELECT embedding_mean::real[] AS mean, embedding_std AS std, embedding_count AS n, computed_at AS at
    FROM taste_baseline_meta WHERE id = 1 AND embedding_mean IS NOT NULL`;
  const r = rows[0];
  if (!r?.mean || r.mean.length === 0) return null;
  return {
    mean: r.mean.map(Number),
    std: (r.std ?? []).map(Number),
    count: Number(r.n),
    computedAt: r.at instanceof Date ? r.at : null,
  };
}

/** Stored catalog counts for specific facet keys of one type (PK index scan). */
export async function readBaselineCounts(type: FacetValue["type"], keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (keys.length === 0) return out;
  const rows = await prisma.tasteFacetBaseline.findMany({
    where: { type, key: { in: keys } },
    select: { key: true, n: true },
  });
  for (const r of rows) out.set(r.key, r.n);
  return out;
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
  /** Embedding space the stored vectors live in. */
  space: SpaceKind;
}

const asSpace = (v: unknown): SpaceKind => (v === "centered" || v === "whitened" ? v : "raw");

/** Raw SQL: `space` is read without depending on a regenerated Prisma client. */
export async function readTasteRow(userId: number): Promise<TasteRow | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      dirty: boolean;
      updated_at: Date;
      computed_at: Date | null;
      algo_version: number;
      public_snapshot: unknown;
      facets: unknown;
      axes: unknown;
      clusters: unknown;
      signal_count: number;
      positive_count: number;
      space: string | null;
    }>
  >`
    SELECT dirty, updated_at, computed_at, algo_version, public_snapshot, facets, axes, clusters,
           signal_count, positive_count, space
    FROM user_taste_profiles WHERE user_id = ${userId}`;
  const r = rows[0];
  if (!r) return null;
  return {
    dirty: r.dirty,
    updatedAt: r.updated_at,
    computedAt: r.computed_at,
    algoVersion: Number(r.algo_version),
    publicSnapshot: r.public_snapshot,
    facets: r.facets,
    axes: r.axes,
    clusters: r.clusters,
    signalCount: Number(r.signal_count),
    positiveCount: Number(r.positive_count),
    space: asSpace(r.space),
  };
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
  space: SpaceKind;
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
      signal_count, positive_count, public_snapshot, algo_version, space, dirty, computed_at, updated_at)
    VALUES (
      ${userId}, ${vecLiteral(w.centroid)}::vector, ${vecLiteral(w.negCentroid)}::vector,
      ${vecLiteral(w.publicCentroid)}::vector, ${json(w.clusters)}::jsonb, ${json(w.facets)}::jsonb,
      ${json(w.axes)}::jsonb, ${w.signalCount}, ${w.positiveCount}, ${json(w.publicSnapshot)}::jsonb,
      ${w.algoVersion}, ${w.space}, false, ${w.computedAt}, now())
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
      space = EXCLUDED.space,
      computed_at = EXCLUDED.computed_at,
      dirty = CASE WHEN user_taste_profiles.updated_at > ${observed} AND user_taste_profiles.dirty
                   THEN true ELSE false END,
      updated_at = now()
  `;
}

export type TasteVectorColumn = "centroid" | "neg_centroid" | "public_centroid";

/** Stored user vectors + the space they were computed in (never compare across spaces). */
export interface TasteVectors {
  centroid: number[] | null;
  negCentroid: number[] | null;
  publicCentroid: number[] | null;
  space: SpaceKind;
}

export async function readTasteVectors(
  userId: number
): Promise<TasteVectors> {
  const rows = await prisma.$queryRaw<
    Array<{ c: number[] | null; n: number[] | null; p: number[] | null; space: string | null }>
  >`
    SELECT centroid::real[] AS c, neg_centroid::real[] AS n, public_centroid::real[] AS p, space
    FROM user_taste_profiles WHERE user_id = ${userId}`;
  const r = rows[0];
  const conv = (v: number[] | null | undefined) => (v ? v.map(Number) : null);
  return { centroid: conv(r?.c), negCentroid: conv(r?.n), publicCentroid: conv(r?.p), space: asSpace(r?.space) };
}
