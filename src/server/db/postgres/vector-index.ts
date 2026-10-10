/**
 * pgvector HNSW helpers (indexes built by postgres/init/03-vector-indexes.sql).
 *
 * The indexes are halfvec EXPRESSION indexes, so a query only uses them when it
 * orders by exactly `embedding::halfvec(1024) <=> <q>::halfvec(1024)` — see
 * `annDistanceSql`. Filters must NOT sit in the same query: the planner then
 * drives from the selective filter (e.g. the TMDB vote-count EXISTS) and
 * seq-scans distances instead (measured on a restored prod dump, Oct 2026).
 * Callers take the nearest N as a MATERIALIZED candidate set, then filter and
 * re-rank in the outer query.
 */
import { prisma } from "./index";
import { dataLogger } from "@/lib/logger";

export type VectorTable = "movies" | "series";

const INDEX_NAME: Record<VectorTable, string> = {
  movies: "idx_movies_embedding_hnsw_hv",
  series: "idx_series_embedding_hnsw_hv",
};

/** Present: cache ~forever; absent: re-check every 10 min (the build runs post-deploy). */
const ABSENT_RECHECK_MS = 10 * 60 * 1000;
const state = new Map<VectorTable, { valid: boolean; checkedAt: number }>();

/**
 * Whether the HNSW index for `table` exists AND is valid. Without it an
 * ORDER-BY-distance query is a full scan of every embedding (8.2s cold / 557ms
 * warm on prod, Oct 2026) — callers must not run vector similarity on a render
 * path when this is false. Fails closed (false) on any error.
 */
export async function hasVectorIndex(table: VectorTable): Promise<boolean> {
  const cached = state.get(table);
  if (cached && (cached.valid || Date.now() - cached.checkedAt < ABSENT_RECHECK_MS)) {
    return cached.valid;
  }
  let valid = false;
  try {
    const rows = await prisma.$queryRawUnsafe<{ valid: boolean }[]>(
      `SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1`,
      INDEX_NAME[table]
    );
    valid = rows[0]?.valid === true;
  } catch (error: unknown) {
    dataLogger.warn({
      event: "vector_index_check_failed",
      table,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  state.set(table, { valid, checkedAt: Date.now() });
  return valid;
}

/** Test hook. */
export function resetVectorIndexCache(): void {
  state.clear();
}

/**
 * Distance expression that matches the halfvec expression index. `vectorLiteral`
 * is a pgvector text literal like `[0.1,0.2,...]` built from numbers only.
 */
export function annDistanceSql(column: string, vectorLiteral: string): string {
  return `${column}::halfvec(1024) <=> '${vectorLiteral}'::halfvec(1024)`;
}

/**
 * Ceiling on the tuples one iterative HNSW scan may visit. The in-scan id
 * exclusion (annCteSql) makes the walk continue past excluded rows, so an
 * enormous exclusion list near the query would otherwise walk up to pgvector's
 * default (20,000). Sized from EXPLAIN ANALYZE on the restored prod dump
 * (eval :5437, Oct 10 2026): the heaviest real user (1,405 excluded movies)
 * removes ~250-1,340 rows at k=1000; even excluding the 30,000 exact nearest
 * movies, 10,000 still returned the full 1,000 rows (35-90ms vs 65ms+ at the
 * default). ≈7× the heaviest real user's exclusions.
 */
export const ANN_MAX_SCAN_TUPLES = 10_000;

/**
 * Session settings for an ANN query, applied with SET LOCAL inside the same
 * transaction. ef_search = the candidate count, so one HNSW pass returns them
 * all (measured on the restored prod dump, warm: 200 candidates ~8ms, 400
 * ~13-20ms, movies 1000 ~18-28ms; cold first hit 15-80ms). The iterative scan
 * keeps walking past excluded/NULL/dead rows, bounded by ANN_MAX_SCAN_TUPLES.
 */
export function annSessionSql(candidates: number): string[] {
  const ef = Math.max(40, Math.min(1000, Math.floor(candidates)));
  return [
    `SET LOCAL hnsw.ef_search = ${ef}`,
    "SET LOCAL hnsw.iterative_scan = relaxed_order",
    `SET LOCAL hnsw.max_scan_tuples = ${ANN_MAX_SCAN_TUPLES}`,
  ];
}
