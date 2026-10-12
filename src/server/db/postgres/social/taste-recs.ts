/**
 * SQL for taste recommendations + taste match (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3.3, §4.3).
 *
 * Catalog vector search goes through the shared ANN primitive
 * (`vector-search.ts` → performance.md §19 shape); this file only adds the
 * filter stage (adult, exclusions, vote floor) over its candidate set. Every
 * catalog query carries `notAdult()`.
 */
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { notAdult } from "@/server/db/postgres/adult-filter";
import { TMDB_SOURCE_ID_SQL } from "@/server/db/postgres/smart-discover";
import {
  ANN_MAX_K,
  annSearch,
  candidateParams,
  candidateSetSql,
  vectorLiteral,
  type AnnHit,
  type VectorTable,
} from "@/server/db/postgres/vector-search";
import { titleKey, type TasteMediaType } from "@/lib/taste/types";
import { TASTE_ALGO_VERSION } from "@/lib/taste/constants";
import type { RecCandidate } from "@/lib/taste/recommend";

const TABLE_MEDIA: Record<VectorTable, TasteMediaType> = { movies: "movie", series: "series" };

function cols(table: VectorTable) {
  return table === "movies"
    ? { title: "title", date: "release_date", genreJoin: "movie_genres", fk: "movie_id", runtime: "t.runtime" }
    : {
        title: "name",
        date: "first_air_date",
        genreJoin: "series_genres",
        fk: "series_id",
        // Episode runtime: the smallest positive listed value (NULL or {} → unknown).
        runtime: "(SELECT min(x) FROM unnest(t.episode_run_time) x WHERE x > 0)",
      };
}

export { vectorLiteral };
export type { AnnHit };

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

export interface RecExclusions {
  movieIds: number[];
  seriesIds: number[];
}

/**
 * Everything the user already engaged with: any WATCH event, any watchlist
 * row, any title-level rating row (score / thumb incl. dislikes / heart), any
 * series progress, and every "Not for me" (rec_feedback DISMISS). NOTE entries
 * are excluded too — a title they wrote about is not a discovery. Calibration
 * SKIPs are deliberately NOT here (they only keep a title out of the deck).
 */
export async function fetchRecExclusions(userId: number): Promise<RecExclusions> {
  const rows = await prisma.$queryRaw<Array<{ movie_id: number | null; series_id: number | null }>>`
    SELECT movie_id, series_id FROM watch_events WHERE user_id = ${userId}
    UNION SELECT movie_id, series_id FROM watchlist WHERE user_id = ${userId}
    UNION SELECT movie_id, series_id FROM user_ratings WHERE user_id = ${userId}
    UNION SELECT NULL::int, series_id FROM series_progress WHERE user_id = ${userId}
    UNION SELECT movie_id, series_id FROM rec_feedback WHERE user_id = ${userId} AND kind = 'DISMISS'`;
  const movieIds = new Set<number>();
  const seriesIds = new Set<number>();
  for (const r of rows) {
    if (r.movie_id != null) movieIds.add(r.movie_id);
    if (r.series_id != null) seriesIds.add(r.series_id);
  }
  return { movieIds: [...movieIds], seriesIds: [...seriesIds] };
}

// ---------------------------------------------------------------------------
// ANN candidates
// ---------------------------------------------------------------------------

/** Hard ceiling on one HNSW scan (annSearch applies the lower per-table cap, annMaxK). */
export const ANN_MAX_LIMIT = ANN_MAX_K;

/**
 * Inner ANN LIMIT for a user. Exclusions now run INSIDE the scan (iterative
 * HNSW scan skips them, see `annCteSql`), so they no longer eat the LIMIT; the
 * remaining after-LIMIT filter is the vote floor (≈15% of embedded movies pass
 * 150 votes on prod data), which `base` must already account for. Kept as a
 * function for the cap.
 */
export function annLimitFor(base: number): number {
  return Math.min(ANN_MAX_LIMIT, Math.max(1, Math.floor(base)));
}

/**
 * Nearest neighbours for several query vectors via the shared ANN primitive
 * (`annSearch`, one batch transaction), then ONE filter statement over the
 * merged candidate set (adult, embedding present, exclusions, vote floor).
 * Returns the surviving hits per query. Empty without a valid index.
 */
export async function annCandidates(
  table: VectorTable,
  queries: readonly number[][],
  opts: { excludeIds: readonly number[]; minVotes: number; perQuery: number }
): Promise<AnnHit[]> {
  if (queries.length === 0) return [];
  const c = cols(table);
  const hits = await annSearch({ table, queries, k: annLimitFor(opts.perQuery), excludeIds: opts.excludeIds });
  if (!hits || hits.length === 0) return [];
  const { ids, dists } = candidateParams(hits);
  const survivors = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT c.cid AS id
     FROM ${candidateSetSql(1, 2)} JOIN ${table} t ON t.id = c.cid
     WHERE ${notAdult("t")}
       AND t.embedding IS NOT NULL
       AND NOT (t.id = ANY($3::int[]))
       AND EXISTS (
         SELECT 1 FROM ratings r
         WHERE r.${c.fk} = t.id AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $4
       )`,
    ids,
    dists,
    [...opts.excludeIds],
    opts.minVotes
  );
  const keep = new Set(survivors.map((r) => Number(r.id)));
  return hits.filter((h) => keep.has(h.id));
}

// ---------------------------------------------------------------------------
// Candidate details
// ---------------------------------------------------------------------------

interface DetailRow {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  date: Date | null;
  popularity: number | null;
  language: string | null;
  vote_average: number | null;
  vote_count: number | null;
  genres: string[] | null;
  runtime: number | null;
  tags: string[] | null;
  v: number[] | null;
}

function aiTagsSql(fk: string): string {
  // Same keys as the taste facets (normalizeTagKey: lower + whitespace-collapsed;
  // MOOD → "<sub>:<value>"), so lifted moods/themes match candidate tags.
  return `ARRAY(SELECT CASE WHEN ai.category = 'MOOD'
                         THEN COALESCE(ai.subcategory, '') || ':' || lower(regexp_replace(btrim(ai.text), '\\s+', ' ', 'g'))
                         ELSE lower(regexp_replace(btrim(ai.text), '\\s+', ' ', 'g')) END
                FROM ai_data ad JOIN ai_insights ai ON ai.ai_data_id = ad.id
                WHERE ad.${fk} = t.id AND ai.spoiler_level = 'FREE'
                  AND ai.category IN ('THEME', 'VIBE', 'MOOD') AND length(ai.text) <= 60)`;
}

function toneOf(raw: string | null): RecCandidate["tone"] {
  const t = raw?.trim().toLowerCase();
  return t === "light" || t === "dark" || t === "mixed" ? t : null;
}

/** Metadata + embedding for an explicit id list (bounded by the caller). */
export async function fetchCandidateDetails(
  table: VectorTable,
  ids: readonly number[],
  opts: { withEmbedding?: boolean } = {}
): Promise<RecCandidate[]> {
  if (ids.length === 0) return [];
  const c = cols(table);
  const embedding = opts.withEmbedding === false ? "NULL::real[]" : "t.embedding::real[]";
  const rows = await prisma.$queryRawUnsafe<DetailRow[]>(
    `SELECT t.id, t.${c.title} AS title, t.poster_path, t.backdrop_path, t.${c.date} AS date,
            t.popularity, t.original_language AS language,
            r.score AS vote_average, r.vote_count,
            ARRAY(SELECT g.name FROM genres g JOIN ${c.genreJoin} gj ON gj.genre_id = g.id
                  WHERE gj.${c.fk} = t.id ORDER BY g.name) AS genres,
            ${c.runtime} AS runtime,
            ${aiTagsSql(c.fk)} AS tags,
            ${embedding} AS v
     FROM ${table} t
     LEFT JOIN LATERAL (
       SELECT score, vote_count FROM ratings
       WHERE ${c.fk} = t.id AND source_id = ${TMDB_SOURCE_ID_SQL} LIMIT 1
     ) r ON true
     WHERE t.id = ANY($1::int[]) AND ${notAdult("t")}`,
    [...ids]
  );
  const mediaType = TABLE_MEDIA[table];
  return rows.map((r) => ({
    key: titleKey(mediaType, r.id),
    mediaType,
    id: r.id,
    title: r.title,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    releaseDate: r.date ? r.date.toISOString().slice(0, 10) : null,
    voteAverage: r.vote_average == null ? null : Number(r.vote_average),
    voteCount: r.vote_count == null ? null : Number(r.vote_count),
    popularity: r.popularity == null ? null : Number(r.popularity),
    genres: r.genres ?? [],
    language: r.language,
    embedding: r.v ? r.v.map(Number) : [],
    runtimeMinutes: r.runtime == null ? null : Number(r.runtime),
    year: r.date ? r.date.getUTCFullYear() : null,
    tone: toneOf((r.tags ?? []).find((t) => t.startsWith("tone:"))?.slice(5) ?? null),
    tags: r.tags ?? [],
  }));
}

/**
 * Cold-start / no-index fallback: popular titles (PG popularity), optionally
 * restricted to genres, with the same adult / vote / exclusion filters.
 * No vector work. Walks the `popularity DESC` btree (`movies_popularity_idx` /
 * `series_popularity_idx`, NULLS FIRST by default) and stops at LIMIT: the
 * ORDER BY must be exactly `popularity DESC` (NOT `DESC NULLS LAST`, which the
 * index cannot serve — that sorted all ~807k movies on every cold-start call),
 * so NULL popularity is excluded in the WHERE instead.
 */
export async function fetchPopularCandidates(
  table: VectorTable,
  opts: { genres: readonly string[] | null; excludeIds: readonly number[]; minVotes: number; limit: number }
): Promise<RecCandidate[]> {
  const c = cols(table);
  const genreFilter =
    opts.genres && opts.genres.length
      ? `AND EXISTS (SELECT 1 FROM ${c.genreJoin} gj JOIN genres g ON g.id = gj.genre_id
                     WHERE gj.${c.fk} = t.id AND g.name = ANY($3::text[]))`
      : "";
  const params: unknown[] = [[...opts.excludeIds], opts.minVotes];
  if (genreFilter) params.push([...(opts.genres ?? [])]);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT t.id FROM ${table} t
     WHERE t.popularity IS NOT NULL
       AND ${notAdult("t")}
       AND NOT (t.id = ANY($1::int[]))
       AND EXISTS (SELECT 1 FROM ratings r WHERE r.${c.fk} = t.id
                   AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $2)
       ${genreFilter}
     ORDER BY t.popularity DESC
     LIMIT ${Math.floor(opts.limit)}`,
    ...params
  );
  const details = await fetchCandidateDetails(
    table,
    rows.map((r) => r.id),
    { withEmbedding: false }
  );
  const order = new Map(rows.map((r, i) => [r.id, i]));
  return details.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** SQL-side filters for a tuned popular top-up (tone / moods are filtered by the caller). */
export interface PopularTuneFilters {
  /** Slugged genre names (`tuneValue`), OR. */
  genreSlugs?: readonly string[];
  /** ISO 639-1, OR. */
  languages?: readonly string[];
  /** Strictly below (movies: runtime; series: smallest episode runtime). */
  maxRuntime?: number;
  yearBefore?: number;
  yearFrom?: number;
}

/** Bound on one tuned top-up scan: a selective filter combo can walk far down the popularity btree. */
const TUNED_TOPUP_TIMEOUT_MS = 1500;

/**
 * Tune-bar top-up (spec §3.5): popular titles passing the tune's SQL-expressible
 * filters, same adult / vote / exclusion rules and the same `popularity DESC`
 * btree walk as `fetchPopularCandidates`. Runs under a statement timeout and
 * returns [] on timeout — a top-up is a nicety, never worth a slow response.
 */
export async function fetchPopularTuned(
  table: VectorTable,
  opts: { filters: PopularTuneFilters; excludeIds: readonly number[]; minVotes: number; limit: number }
): Promise<RecCandidate[]> {
  const c = cols(table);
  const f = opts.filters;
  const params: unknown[] = [[...opts.excludeIds], opts.minVotes];
  const where: string[] = [];
  const bind = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.genreSlugs?.length) {
    where.push(`EXISTS (SELECT 1 FROM ${c.genreJoin} gj JOIN genres g ON g.id = gj.genre_id
                 WHERE gj.${c.fk} = t.id
                   AND btrim(regexp_replace(lower(g.name), '[^a-z0-9]+', '-', 'g'), '-') = ANY(${bind([...f.genreSlugs])}::text[]))`);
  }
  if (f.languages?.length) where.push(`t.original_language = ANY(${bind([...f.languages])}::text[])`);
  if (f.maxRuntime != null) where.push(`${c.runtime} < ${bind(f.maxRuntime)}::int`);
  if (f.yearBefore != null) where.push(`t.${c.date} < make_date(${bind(f.yearBefore)}::int, 1, 1)`);
  if (f.yearFrom != null) where.push(`t.${c.date} >= make_date(${bind(f.yearFrom)}::int, 1, 1)`);
  const sql = `SELECT t.id FROM ${table} t
     WHERE t.popularity IS NOT NULL
       AND ${notAdult("t")}
       AND NOT (t.id = ANY($1::int[]))
       AND EXISTS (SELECT 1 FROM ratings r WHERE r.${c.fk} = t.id
                   AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $2)
       ${where.map((w) => `AND ${w}`).join("\n       ")}
     ORDER BY t.popularity DESC
     LIMIT ${Math.floor(opts.limit)}`;
  let rows: Array<{ id: number }> = [];
  try {
    const [, result] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${TUNED_TOPUP_TIMEOUT_MS}`),
      prisma.$queryRawUnsafe<Array<{ id: number }>>(sql, ...params),
    ]);
    rows = result;
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.tune_topup_failed",
      table,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
  const details = await fetchCandidateDetails(
    table,
    rows.map((r) => Number(r.id)),
    { withEmbedding: false }
  );
  const order = new Map(rows.map((r, i) => [Number(r.id), i]));
  return details.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Titles + genres for the user's anchors (no embeddings; those come from taste.ts). */
export async function fetchAnchorInfo(
  movieIds: readonly number[],
  seriesIds: readonly number[]
): Promise<Map<string, { title: string; genres: string[]; posterPath: string | null }>> {
  const out = new Map<string, { title: string; genres: string[]; posterPath: string | null }>();
  const [m, s] = await Promise.all([
    fetchCandidateDetails("movies", movieIds, { withEmbedding: false }),
    fetchCandidateDetails("series", seriesIds, { withEmbedding: false }),
  ]);
  for (const d of [...m, ...s]) out.set(d.key, { title: d.title, genres: d.genres, posterPath: d.posterPath });
  return out;
}

// ---------------------------------------------------------------------------
// Taste match / twins
// ---------------------------------------------------------------------------

export interface MatchUserInfo {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
  isPublic: boolean;
  showTaste: boolean;
  avatarImagePath: string | null;
}

interface UserInfoRow {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
  is_public: boolean;
  show_taste: boolean;
  avatar: string | null;
}

const toUserInfo = (r: UserInfoRow): MatchUserInfo => ({
  id: r.id,
  username: r.username,
  name: r.name,
  image: r.image,
  isPublic: r.is_public,
  showTaste: r.show_taste,
  avatarImagePath: r.avatar,
});

export async function fetchUserByUsername(username: string): Promise<MatchUserInfo | null> {
  const rows = await prisma.$queryRaw<UserInfoRow[]>`
    SELECT id, username, name, image, is_public,
           COALESCE((metadata->'profile'->>'showTaste')::boolean, true) AS show_taste,
           metadata->'profile'->>'avatarImagePath' AS avatar
    FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
  return rows[0] ? toUserInfo(rows[0]) : null;
}

export async function fetchUserById(id: number): Promise<MatchUserInfo | null> {
  const rows = await prisma.$queryRaw<UserInfoRow[]>`
    SELECT id, username, name, image, is_public,
           COALESCE((metadata->'profile'->>'showTaste')::boolean, true) AS show_taste,
           metadata->'profile'->>'avatarImagePath' AS avatar
    FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ? toUserInfo(rows[0]) : null;
}

/** A follows B AND B follows A. */
export async function isMutualFollow(a: number, b: number): Promise<boolean> {
  const n = await prisma.follow.count({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
  });
  return n === 2;
}

export interface TwinRow extends MatchUserInfo {
  cos: number;
}

/**
 * Nearest PUBLIC centroids among public, taste-visible, non-bot users with a
 * username. Exact scan of user_taste_profiles (one row per user — hundreds
 * today); add a halfvec HNSW index on public_centroid at ~50k profiles or when
 * this exceeds ~20ms. Exclusions (self / hidden / followed) applied in SQL;
 * candidates must have a clean row at the current TASTE_ALGO_VERSION.
 */
export async function fetchTwinCandidates(
  viewerId: number,
  opts: { excludeIds: readonly number[]; limit: number }
): Promise<TwinRow[]> {
  const rows = await prisma.$queryRaw<Array<UserInfoRow & { cos: number }>>`
    SELECT u.id, u.username, u.name, u.image, u.is_public,
           COALESCE((u.metadata->'profile'->>'showTaste')::boolean, true) AS show_taste,
           u.metadata->'profile'->>'avatarImagePath' AS avatar,
           (1 - (t.public_centroid <=> v.public_centroid))::float8 AS cos
    FROM user_taste_profiles v
    JOIN user_taste_profiles t ON t.user_id <> v.user_id AND t.public_centroid IS NOT NULL
      -- Only current, clean public centroids: a dirty row may still encode a
      -- watch the user has since made private, and an old algo version was
      -- computed by different rules. They rejoin after their next recompute.
      AND NOT t.dirty AND t.algo_version = ${TASTE_ALGO_VERSION}
      -- Cosines are only meaningful between vectors of the same embedding space.
      AND t.space = v.space
    JOIN users u ON u.id = t.user_id
    WHERE v.user_id = ${viewerId}
      AND v.public_centroid IS NOT NULL
      AND u.is_public = true
      AND u.username IS NOT NULL
      AND COALESCE((u.metadata->'profile'->>'showTaste')::boolean, true) = true
      AND COALESCE((u.metadata->>'bot')::boolean, false) = false
      AND NOT (u.id = ANY(${[...opts.excludeIds]}::int[]))
    ORDER BY t.public_centroid <=> v.public_centroid
    LIMIT ${opts.limit}`;
  return rows.map((r) => ({ ...toUserInfo(r), cos: Number(r.cos) }));
}

export async function fetchFollowingIds(userId: number): Promise<number[]> {
  const rows = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  return rows.map((r) => r.followingId);
}

/** Display refs (title + poster) for match lists. Adult titles are dropped. */
export async function fetchTitleRefs(
  movieIds: readonly number[],
  seriesIds: readonly number[]
): Promise<Map<string, { title: string; posterPath: string | null; releaseDate: string | null }>> {
  const [m, s] = await Promise.all([
    fetchCandidateDetails("movies", movieIds, { withEmbedding: false }),
    fetchCandidateDetails("series", seriesIds, { withEmbedding: false }),
  ]);
  return new Map(
    [...m, ...s].map((d) => [d.key, { title: d.title, posterPath: d.posterPath, releaseDate: d.releaseDate }])
  );
}
