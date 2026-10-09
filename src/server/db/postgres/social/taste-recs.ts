/**
 * SQL for taste recommendations + taste match (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3.3, §4.3).
 *
 * Catalog vector search follows performance.md §19 EXACTLY: the nearest N by
 * `embedding::halfvec(1024) <=> q::halfvec(1024)` inside a MATERIALIZED CTE with
 * no filters (so the HNSW expression index drives it), filters + exclusions
 * outside, and `SET LOCAL hnsw.ef_search` in the same batch transaction.
 * Callers MUST check `hasVectorIndex()` first — without the index this would be
 * a full distance scan. Every catalog query carries `notAdult()`.
 */
import { prisma } from "@/server/db/postgres";
import { notAdult } from "@/server/db/postgres/adult-filter";
import { TMDB_SOURCE_ID_SQL } from "@/server/db/postgres/smart-discover";
import { annDistanceSql, annSessionSql, type VectorTable } from "@/server/db/postgres/vector-index";
import { titleKey, type TasteMediaType } from "@/lib/taste/types";
import type { RecCandidate } from "@/lib/taste/recommend";

const TABLE_MEDIA: Record<VectorTable, TasteMediaType> = { movies: "movie", series: "series" };

function cols(table: VectorTable) {
  return table === "movies"
    ? { title: "title", date: "release_date", genreJoin: "movie_genres", fk: "movie_id" }
    : { title: "name", date: "first_air_date", genreJoin: "series_genres", fk: "series_id" };
}

/** pgvector text literal from numbers only (never user text). */
export function vectorLiteral(v: readonly number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}

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
 * series progress. NOTE entries are excluded too — a title they wrote about is
 * not a discovery.
 */
export async function fetchRecExclusions(userId: number): Promise<RecExclusions> {
  const rows = await prisma.$queryRaw<Array<{ movie_id: number | null; series_id: number | null }>>`
    SELECT movie_id, series_id FROM watch_events WHERE user_id = ${userId}
    UNION SELECT movie_id, series_id FROM watchlist WHERE user_id = ${userId}
    UNION SELECT movie_id, series_id FROM user_ratings WHERE user_id = ${userId}
    UNION SELECT NULL::int, series_id FROM series_progress WHERE user_id = ${userId}`;
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

export interface AnnHit {
  id: number;
  dist: number;
  query: number;
}

/**
 * Nearest neighbours for several query vectors in ONE batch transaction
 * (ef_search applies to every SELECT in it). Filters run on the materialised
 * candidates only. Returns hits that survived the filters, per query.
 */
export async function annCandidates(
  table: VectorTable,
  queries: readonly number[][],
  opts: { excludeIds: readonly number[]; minVotes: number; perQuery: number }
): Promise<AnnHit[]> {
  if (queries.length === 0) return [];
  const c = cols(table);
  const selects = queries.map((q, qi) => {
    const lit = vectorLiteral(q);
    const sql = `
      WITH c AS MATERIALIZED (
        SELECT id AS cid, ${annDistanceSql("embedding", lit)} AS dist
        FROM ${table}
        ORDER BY ${annDistanceSql("embedding", lit)}
        LIMIT ${Math.floor(opts.perQuery)}
      )
      SELECT c.cid AS id, c.dist::float8 AS dist, ${qi}::int AS query
      FROM c JOIN ${table} t ON t.id = c.cid
      WHERE ${notAdult("t")}
        AND t.embedding IS NOT NULL
        AND NOT (t.id = ANY($1::int[]))
        AND EXISTS (
          SELECT 1 FROM ratings r
          WHERE r.${c.fk} = t.id AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $2
        )
      ORDER BY c.dist`;
    return prisma.$queryRawUnsafe<AnnHit[]>(sql, [...opts.excludeIds], opts.minVotes);
  });
  const results = await prisma.$transaction([
    ...annSessionSql(opts.perQuery).map((s) => prisma.$executeRawUnsafe(s)),
    ...selects,
  ]);
  return (results.slice(annSessionSql(opts.perQuery).length) as AnnHit[][]).flat().map((h) => ({
    id: Number(h.id),
    dist: Number(h.dist),
    query: Number(h.query),
  }));
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
  v: number[] | null;
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
  }));
}

/**
 * Cold-start / no-index fallback: popular titles (PG popularity), optionally
 * restricted to genres, with the same adult / vote / exclusion filters.
 * Uses the popularity DESC btree — no vector work.
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
     WHERE ${notAdult("t")}
       AND NOT (t.id = ANY($1::int[]))
       AND EXISTS (SELECT 1 FROM ratings r WHERE r.${c.fk} = t.id
                   AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $2)
       ${genreFilter}
     ORDER BY t.popularity DESC NULLS LAST
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
 * this exceeds ~20ms. Exclusions (self / hidden / followed) applied in SQL.
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
