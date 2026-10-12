/**
 * Calibration-deck candidate SQL (taste v2 spec 2026-10-12 §3.6). Popular,
 * well-known (vote floor), non-adult titles WITH an embedding (so an answer
 * moves the centroid), minus everything the user already engaged with and
 * their unexpired SKIPs. Walks the `popularity DESC` btree and stops at LIMIT
 * (same shape as `fetchPopularCandidates`).
 */
import { prisma } from "@/server/db/postgres";
import { notAdult } from "@/server/db/postgres/adult-filter";
import { TMDB_SOURCE_ID_SQL } from "@/server/db/postgres/smart-discover";
import type { VectorTable } from "@/server/db/postgres/vector-search";
import { fetchCandidateDetails } from "./taste-recs";
import type { RecCandidate } from "@/lib/taste/recommend";

export async function fetchCalibrationCandidates(
  table: VectorTable,
  opts: { excludeIds: readonly number[]; minVotes: number; limit: number }
): Promise<RecCandidate[]> {
  const fk = table === "movies" ? "movie_id" : "series_id";
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT t.id FROM ${table} t
     WHERE t.popularity IS NOT NULL
       AND ${notAdult("t")}
       AND t.embedding IS NOT NULL
       AND t.poster_path IS NOT NULL
       AND NOT (t.id = ANY($1::int[]))
       AND EXISTS (SELECT 1 FROM ratings r WHERE r.${fk} = t.id
                   AND r.source_id = ${TMDB_SOURCE_ID_SQL} AND r.vote_count >= $2)
     ORDER BY t.popularity DESC
     LIMIT ${Math.floor(opts.limit)}`,
    [...opts.excludeIds],
    opts.minVotes
  );
  const details = await fetchCandidateDetails(
    table,
    rows.map((r) => Number(r.id)),
    { withEmbedding: false }
  );
  const order = new Map(rows.map((r, i) => [Number(r.id), i]));
  return details.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
