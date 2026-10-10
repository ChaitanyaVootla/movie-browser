/**
 * THE catalog ANN entry point (spec
 * docs/superpowers/specs/2026-10-10-taste-vector-upgrades.md §3). Every
 * nearest-neighbour query over `movies`/`series` embeddings goes through here;
 * do not hand-roll another HNSW query.
 *
 * Contract (performance.md §19):
 *  - gated on `hasVectorIndex(table)` → returns null without a valid index
 *    (callers pick their own fallback; never a full distance scan);
 *  - per query an UNFILTERED `MATERIALIZED` CTE ordered by exactly the halfvec
 *    expression the index is built on, LIMIT k;
 *  - `SET LOCAL hnsw.ef_search = k` + iterative scan + max_scan_tuples in the
 *    SAME batch transaction (one connection); k capped per table (annMaxK);
 *  - returns raw ids + cosine distances. Filters (adult, votes, exclusions,
 *    structured filters) and re-ranking stay with the caller, which joins its
 *    table to `candidateSetSql(...)` — the shared filter stage.
 *
 * Raw-space only: the index is over raw Cohere vectors. Callers that work in a
 * centered taste space pass their centered unit query (raw-index order then
 * equals the centered numerator's order — see the spec) and re-rank exactly.
 */
import { prisma } from "./index";
import { annDistanceSql, annSessionSql, hasVectorIndex, type VectorTable } from "./vector-index";

export type { VectorTable };

export interface AnnHit {
  id: number;
  /** Cosine distance (1 − cos) on the raw (halfvec) embedding. */
  dist: number;
  /** Index of the query vector that produced the hit. */
  query: number;
}

/** Hard ceiling on one HNSW scan (matches annSessionSql's ef_search cap). */
export const ANN_MAX_K = 1000;

/**
 * Per-table k / ef_search ceiling. `series` is ~5× smaller than `movies`, and
 * at a large LIMIT the planner prefers a parallel SEQ SCAN + top-N sort over
 * the HNSW index: EXPLAIN ANALYZE on the restored prod dump (eval :5437,
 * 24k embedded series, Oct 10 2026) kept the index up to k=650 and flipped at
 * 700-1000. 500 keeps a margin (warm 11-12ms, cold 25ms). Movies keep the
 * index at 1000 (warm 18-28ms, cold 82ms). ~18% of embedded series pass the
 * 75-vote rec floor, so 500 still leaves ~90 eligible per query. Re-check the
 * crossover with EXPLAIN on prod before raising it.
 */
const ANN_MAX_K_BY_TABLE: Record<VectorTable, number> = { movies: ANN_MAX_K, series: 500 };

export function annMaxK(table: VectorTable): number {
  return ANN_MAX_K_BY_TABLE[table];
}

/** pgvector text literal from numbers only (never user text). */
export function vectorLiteral(v: readonly number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}

/**
 * The nearest-k CTE body for one query literal. The ONLY predicate ever allowed
 * inside is an id exclusion (`excludeParam` = the bind index of an int[]): it is
 * non-selective, so the planner keeps the HNSW index scan and pgvector's
 * iterative scan keeps walking until k NON-excluded rows are found (EXPLAIN
 * ANALYZE on the restored prod dump, a 1,405-title diary: Index Scan + Filter,
 * 300 rows, 31ms cold / 12ms warm). Selective filters (vote EXISTS, genres,
 * adult) must stay OUTSIDE — they flip the plan to a full distance scan.
 */
export function annCteSql(table: VectorTable, literal: string, k: number, excludeParam?: number): string {
  return `SELECT id AS cid, ${annDistanceSql("embedding", literal)} AS dist
        FROM ${table}
        ${excludeParam ? `WHERE NOT (id = ANY($${excludeParam}::int[]))` : ""}
        ORDER BY ${annDistanceSql("embedding", literal)}
        LIMIT ${Math.floor(k)}`;
}

/**
 * Nearest neighbours for one or more query vectors in ONE batch transaction.
 * Null when the table has no valid HNSW index. Hits are per query, ascending.
 */
export async function annSearch(opts: {
  table: VectorTable;
  queries: readonly (readonly number[])[];
  k: number;
  /** Ids to skip INSIDE the scan (the user's own titles) — see annCteSql. */
  excludeIds?: readonly number[];
}): Promise<AnnHit[] | null> {
  if (!(await hasVectorIndex(opts.table))) return null;
  if (opts.queries.length === 0) return [];
  const k = Math.max(1, Math.min(annMaxK(opts.table), Math.floor(opts.k)));
  // Session settings first: SET LOCAL must precede the scans on the same connection.
  const session = annSessionSql(k).map((s) => prisma.$executeRawUnsafe(s));
  const exclude = opts.excludeIds && opts.excludeIds.length ? [...opts.excludeIds] : null;
  const selects = opts.queries.map((q, qi) => {
    const sql = `WITH c AS MATERIALIZED (
        ${annCteSql(opts.table, vectorLiteral(q), k, exclude ? 1 : undefined)}
      )
      SELECT c.cid AS id, c.dist::float8 AS dist, ${qi}::int AS query FROM c ORDER BY c.dist`;
    return exclude ? prisma.$queryRawUnsafe<AnnHit[]>(sql, exclude) : prisma.$queryRawUnsafe<AnnHit[]>(sql);
  });
  const results = await prisma.$transaction([...session, ...selects]);
  return (results.slice(session.length) as AnnHit[][]).flat().map((h) => ({
    id: Number(h.id),
    dist: Number(h.dist),
    query: Number(h.query),
  }));
}

/** The stored embedding of one title (raw), or null. */
export async function fetchEmbedding(table: VectorTable, id: number): Promise<number[] | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ v: number[] | null }>>(
    `SELECT embedding::real[] AS v FROM ${table} WHERE id = $1`,
    id
  );
  const v = rows[0]?.v;
  return v && v.length ? v.map(Number) : null;
}

/**
 * The shared filter stage: a row source `c(cid, dist)` built from ANN hits,
 * to JOIN the caller's table against (`FROM ${candidateSetSql(1, 2)} JOIN movies m
 * ON m.id = c.cid WHERE …`). Bind `ids` at `$idsParam` and `dists` at `$distsParam`.
 */
export function candidateSetSql(idsParam: number, distsParam: number): string {
  return `unnest($${idsParam}::int[], $${distsParam}::float8[]) AS c(cid, dist)`;
}

/** Split hits into the two bind arrays for `candidateSetSql` (best distance per id). */
export function candidateParams(hits: readonly AnnHit[]): { ids: number[]; dists: number[] } {
  const best = new Map<number, number>();
  for (const h of hits) {
    const cur = best.get(h.id);
    if (cur === undefined || h.dist < cur) best.set(h.id, h.dist);
  }
  return { ids: [...best.keys()], dists: [...best.values()] };
}
