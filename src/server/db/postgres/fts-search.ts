/**
 * Full-Text Search (FTS) for autocomplete titles & people.
 *
 * Trigram similarity (`fuzzy-search.ts`) is great for typos but pathologically
 * slow for common multi-word queries: "the matrix" shares the very common "the"
 * trigrams with a huge slice of the catalog, so the % operator's candidate set
 * explodes and the heap recheck takes ~9s on the 500K-movie / 3M-person tables.
 *
 * Postgres FTS handles exactly this case: stop-words ("the", "of"…) are dropped,
 * remaining lexemes are matched via the existing GIN to_tsvector indexes
 * (idx_movies_fts / idx_series_fts / idx_persons_fts), and "the matrix" resolves
 * in ~90ms with correct relevance.
 *
 * Autocomplete strategy: FTS first (fast, real words), trigram only as a fallback
 * for typos (which are distinctive enough that trigram stays fast). See
 * `src/server/actions/autocomplete.ts`.
 */

import { prisma } from "./index";
import { notAdult } from "./adult-filter";

export interface FtsResult {
  id: number;
  title: string;
  mediaType: "movie" | "series" | "person";
  posterPath: string | null;
  year: string | null;
  popularity: number | null;
}

/** Per-query timeout so a degenerate query can't hang the request. */
const FTS_TIMEOUT_MS = 2500;

// Search results are a link surface, so every query here excludes adult rows.
const NON_ADULT_MOVIE = notAdult("m");
const NON_ADULT_SERIES = notAdult("s");
const NON_ADULT_PERSON = notAdult("p");

/**
 * SQL for the NORMALISED ("squashed") form of a text column: lowercased with
 * every non-alphanumeric run removed. "Shang-Chi and the Legend of the Ten
 * Rings" → "shangchiandthelegendofthetenrings".
 *
 * MUST stay byte-identical to the `*_squash` index expressions in
 * `postgres/init/02-search-indexes.sql`. If it drifts, Postgres cannot use the
 * index and silently falls back to a seq scan over ~1M movies / ~4.4M persons —
 * i.e. exactly the hang this was built to fix. `fts-search.test.ts` pins them.
 */
export const squashSql = (col: string): string =>
  `regexp_replace(lower(coalesce(${col}, '')), '[^a-z0-9]+', '', 'g')`;

/**
 * Squash a user query the same way the index squashes the column. The result is
 * `[a-z0-9]*` by construction, which is what makes it safe to INLINE into SQL
 * below (see squashedPrefixWhere).
 */
export function squashQuery(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Leading articles are the one thing a pure prefix match can't see through:
 * "darkknight" does not prefix "thedarkknight". Trying the article-prefixed
 * forms too costs one extra index scan each (measured: 4 scans, still 0.9-2ms)
 * and recovers The Dark Knight / The Godfather / The Matrix / The Lord of the
 * Rings — a large share of what people actually search for.
 */
const LEADING_ARTICLES = ["", "the", "a", "an"] as const;

/**
 * Build an index-backed prefix predicate for the squashed column.
 *
 * The pattern is INLINED rather than parameterised on purpose: Postgres can only
 * extract a prefix from a LIKE pattern it can see at plan time, so `col LIKE $1`
 * would not use the `text_pattern_ops` index. Inlining is safe here precisely
 * because `squashQuery` has already reduced the value to `[a-z0-9]` — there is no
 * quote, backslash, or wildcard left to inject. Callers MUST pass a value that
 * came from `squashQuery` (asserted below).
 */
function squashedPrefixWhere(colSql: string, squashed: string): string {
  if (!/^[a-z0-9]+$/.test(squashed)) {
    throw new Error(`squashedPrefixWhere: unsafe value ${JSON.stringify(squashed)}`);
  }
  return LEADING_ARTICLES.map((a) => `${colSql} LIKE '${a}${squashed}%'`).join(" OR ");
}

/**
 * As-you-type search for titles typed WITHOUT punctuation or spaces —
 * "shangchi", "spiderman", "starwars", "johnwick", "everythingeverywhere".
 *
 * This is the tier that FTS structurally cannot serve: `to_tsvector` splits
 * "Shang-Chi" into `shang` + `chi`, so no prefix tsquery for "shangchi" can ever
 * match. Before this existed, such queries fell through to the trigram fuzzy
 * fallback and burned its whole timeout (4,859ms measured) returning nothing.
 * Index-backed via `idx_*_squash`; measured 0.07-2ms on prod.
 */
export async function squashedPrefixSearchTitles(query: string, limit = 6): Promise<FtsResult[]> {
  const squashed = squashQuery(query);
  if (squashed.length < 3) return []; // too short to be selective

  const movieSql = `
    SELECT m.id, m.title, 'movie'::text AS "mediaType", m.poster_path AS "posterPath",
           EXTRACT(YEAR FROM m.release_date)::text AS year, m.popularity
    FROM movies m
    WHERE ${NON_ADULT_MOVIE}
      AND (${squashedPrefixWhere(squashSql("m.title"), squashed)}
        OR ${squashedPrefixWhere(squashSql("m.original_title"), squashed)})
    ORDER BY m.popularity DESC NULLS LAST
    LIMIT $1
  `;
  const seriesSql = `
    SELECT s.id, s.name AS title, 'series'::text AS "mediaType", s.poster_path AS "posterPath",
           EXTRACT(YEAR FROM s.first_air_date)::text AS year, s.popularity
    FROM series s
    WHERE ${NON_ADULT_SERIES}
      AND (${squashedPrefixWhere(squashSql("s.name"), squashed)}
        OR ${squashedPrefixWhere(squashSql("s.original_name"), squashed)})
    ORDER BY s.popularity DESC NULLS LAST
    LIMIT $1
  `;

  const [movies, series] = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return Promise.all([
      tx.$queryRawUnsafe<FtsResult[]>(movieSql, limit),
      tx.$queryRawUnsafe<FtsResult[]>(seriesSql, limit),
    ]);
  });

  return [...movies, ...series]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);
}

/** Squashed-prefix search over person names ("tomholland", "scarlettjohansson"). */
export async function squashedPrefixSearchPeople(query: string, limit = 2): Promise<FtsResult[]> {
  const squashed = squashQuery(query);
  if (squashed.length < 3) return [];

  const sql = `
    SELECT p.id, p.name AS title, 'person'::text AS "mediaType",
           p.profile_path AS "posterPath", NULL::text AS year, p.popularity
    FROM persons p
    WHERE ${NON_ADULT_PERSON}
      AND (${squashedPrefixWhere(squashSql("p.name"), squashed)})
    ORDER BY p.popularity DESC NULLS LAST
    LIMIT $1
  `;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return tx.$queryRawUnsafe<FtsResult[]>(sql, limit);
  });
}

/**
 * Build a SAFE prefix tsquery string from arbitrary user input, e.g.
 * "the inc" → "the:* & inc:*" (which `to_tsquery('english', …)` reduces to
 * "inc:*", dropping the "the" stop-word).
 *
 * Every token is reduced to `[a-z0-9]` and joined with our own ` & `/`:*`, so the
 * result can never contain a tsquery operator from the user — it is safe to pass
 * as a parameter to `to_tsquery`. Returns "" when the input has no usable token
 * (caller must skip — `to_tsquery('english','')` would error, and an all-stop-word
 * query yields an empty tsquery that matches nothing anyway).
 */
function toPrefixTsQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");
}

/**
 * As-you-type PREFIX search across movie + series TITLES (title-only index
 * `idx_movies_title_fts` / `idx_series_name_fts`).
 *
 * Why title-only + prefix: `websearch_to_tsquery` treats "inc" as a COMPLETE
 * lexeme, so it never matches "Inception" (which stems to `incept`) — autocomplete
 * for a partial word found nothing and fell through to the pathological trigram
 * scan. A prefix query (`inc:*`) against the TITLE-only vector matches "Inception"
 * and is ~25x more selective than the combined title+overview index (≈1.6k vs 41k
 * candidate rows for "inc"). Ranked by popularity — the right signal for "which of
 * the titles starting with what I typed did I mean".
 */
export async function ftsPrefixSearchTitles(query: string, limit = 6): Promise<FtsResult[]> {
  const tsq = toPrefixTsQuery(query);
  if (!tsq) return [];

  const movieSql = `
    SELECT m.id, m.title, 'movie'::text AS "mediaType", m.poster_path AS "posterPath",
           EXTRACT(YEAR FROM m.release_date)::text AS year, m.popularity
    FROM movies m
    WHERE ${NON_ADULT_MOVIE}
      AND to_tsvector('english', COALESCE(m.title, '')) @@ to_tsquery('english', $1)
    ORDER BY m.popularity DESC NULLS LAST
    LIMIT $2
  `;
  const seriesSql = `
    SELECT s.id, s.name AS title, 'series'::text AS "mediaType", s.poster_path AS "posterPath",
           EXTRACT(YEAR FROM s.first_air_date)::text AS year, s.popularity
    FROM series s
    WHERE ${NON_ADULT_SERIES}
      AND to_tsvector('english', COALESCE(s.name, '')) @@ to_tsquery('english', $1)
    ORDER BY s.popularity DESC NULLS LAST
    LIMIT $2
  `;

  const [movies, series] = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return Promise.all([
      tx.$queryRawUnsafe<FtsResult[]>(movieSql, tsq, limit),
      tx.$queryRawUnsafe<FtsResult[]>(seriesSql, tsq, limit),
    ]);
  });

  return [...movies, ...series]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);
}

/** As-you-type PREFIX search across people by NAME (idx_persons_name_fts). */
export async function ftsPrefixSearchPeople(query: string, limit = 2): Promise<FtsResult[]> {
  const tsq = toPrefixTsQuery(query);
  if (!tsq) return [];

  const sql = `
    SELECT p.tmdb_id AS id, p.name AS title, 'person'::text AS "mediaType",
           p.profile_path AS "posterPath", NULL::text AS year, p.popularity
    FROM persons p
    WHERE ${NON_ADULT_PERSON}
      AND to_tsvector('english', COALESCE(p.name, '')) @@ to_tsquery('english', $1)
    ORDER BY p.popularity DESC NULLS LAST
    LIMIT $2
  `;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return tx.$queryRawUnsafe<FtsResult[]>(sql, tsq, limit);
  });
}

/**
 * FTS search across movie + series titles. Ranks title-relevance first, then
 * popularity, so exact title matches ("The Matrix") beat overview-only mentions.
 */
export async function ftsSearchTitles(query: string, limit = 6): Promise<FtsResult[]> {
  const q = query.trim();
  if (!q) return [];

  // websearch_to_tsquery safely parses arbitrary user input (no injection, no
  // syntax errors) and applies stop-word removal.
  const movieSql = `
    SELECT m.id, m.title, 'movie'::text AS "mediaType", m.poster_path AS "posterPath",
           EXTRACT(YEAR FROM m.release_date)::text AS year, m.popularity,
           ts_rank(to_tsvector('english', COALESCE(m.title, '')), websearch_to_tsquery('english', $1)) AS title_rank
    FROM movies m
    WHERE ${NON_ADULT_MOVIE}
      AND to_tsvector('english',
            COALESCE(m.title, '') || ' ' || COALESCE(m.overview, '') || ' ' || COALESCE(m.tagline, '')
          ) @@ websearch_to_tsquery('english', $1)
    ORDER BY title_rank DESC, m.popularity DESC NULLS LAST
    LIMIT $2
  `;
  const seriesSql = `
    SELECT s.id, s.name AS title, 'series'::text AS "mediaType", s.poster_path AS "posterPath",
           EXTRACT(YEAR FROM s.first_air_date)::text AS year, s.popularity,
           ts_rank(to_tsvector('english', COALESCE(s.name, '')), websearch_to_tsquery('english', $1)) AS title_rank
    FROM series s
    WHERE ${NON_ADULT_SERIES}
      AND to_tsvector('english',
            COALESCE(s.name, '') || ' ' || COALESCE(s.overview, '')
          ) @@ websearch_to_tsquery('english', $1)
    ORDER BY title_rank DESC, s.popularity DESC NULLS LAST
    LIMIT $2
  `;

  const [movies, series] = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return Promise.all([
      tx.$queryRawUnsafe<(FtsResult & { title_rank: number })[]>(movieSql, q, limit),
      tx.$queryRawUnsafe<(FtsResult & { title_rank: number })[]>(seriesSql, q, limit),
    ]);
  });

  // Interleave by (title relevance, popularity) and cap at `limit`.
  return [...movies, ...series]
    .sort((a, b) => b.title_rank - a.title_rank || (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit)
    .map(({ title_rank: _rank, ...r }) => r);
}

/** FTS search across people (name + biography), popularity-ranked. */
export async function ftsSearchPeople(query: string, limit = 2): Promise<FtsResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Match the NAME only (not biography). Matching biography would, for a common
  // word like "matrix", hit thousands of bios across the ~3M-person table and
  // blow the timeout. Name-only uses idx_persons_name_fts and returns people who
  // are actually NAMED that — relevant and fast.
  const sql = `
    SELECT p.tmdb_id AS id, p.name AS title, 'person'::text AS "mediaType",
           p.profile_path AS "posterPath", NULL::text AS year, p.popularity
    FROM persons p
    WHERE ${NON_ADULT_PERSON}
      AND to_tsvector('english', COALESCE(p.name, '')) @@ websearch_to_tsquery('english', $1)
    ORDER BY
      ts_rank(to_tsvector('english', COALESCE(p.name, '')), websearch_to_tsquery('english', $1)) DESC,
      p.popularity DESC NULLS LAST
    LIMIT $2
  `;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FTS_TIMEOUT_MS}`);
    return tx.$queryRawUnsafe<FtsResult[]>(sql, q, limit);
  });
}
