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
    WHERE to_tsvector('english',
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
    WHERE to_tsvector('english',
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
    .sort(
      (a, b) =>
        b.title_rank - a.title_rank || (b.popularity ?? 0) - (a.popularity ?? 0)
    )
    .slice(0, limit)
    .map(({ title_rank: _rank, ...r }) => r);
}

/** FTS search across people (name + biography), popularity-ranked. */
export async function ftsSearchPeople(query: string, limit = 2): Promise<FtsResult[]> {
  const q = query.trim();
  if (!q) return [];

  const sql = `
    SELECT p.tmdb_id AS id, p.name AS title, 'person'::text AS "mediaType",
           p.profile_path AS "posterPath", NULL::text AS year, p.popularity
    FROM persons p
    WHERE to_tsvector('english',
            COALESCE(p.name, '') || ' ' || COALESCE(p.biography, '')
          ) @@ websearch_to_tsquery('english', $1)
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
