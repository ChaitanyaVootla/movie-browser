/**
 * CRON-ONLY: rebuilds the taste-facet catalog baseline (`taste_facet_baseline`
 * + the `taste_baseline_meta` singleton). Run nightly by the `taste-baseline`
 * PM2 job (scripts/refresh-taste-baseline.ts). NEVER import this from a
 * request path — every statement here scans the catalog.
 *
 * Population B (spec §6): non-adult titles with ≥ BASELINE_MIN_VOTES TMDB
 * votes; when that is < BASELINE_MIN_SIZE (dev DB) it falls back to all
 * non-adult titles. AI facets (theme/mood) count over ai_data.
 *
 * Memory: all aggregation is server-side (INSERT … SELECT into a temp stage
 * table), so Node only ever holds per-type row counts. Writes are diff-only
 * (UPDATE only where n changed, DELETE only vanished keys) so a nightly run
 * over an unchanged catalog rewrites almost nothing.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { BASELINE_MIN_SIZE, BASELINE_MIN_VOTES, SPACE_MIN_TITLES } from "@/lib/taste/constants";
import { vectorLiteral } from "@/server/db/postgres/vector-search";
import type { FacetType } from "@/lib/taste/types";

const TMDB_SOURCE = Prisma.sql`(SELECT id FROM data_sources WHERE slug = 'tmdb')`;
/** SQL twin of normalizeTagKey() in taste.ts — change both together. */
const TAG_KEY = (col: Prisma.Sql) => Prisma.sql`lower(regexp_replace(btrim(${col}), '\\s+', ' ', 'g'))`;

type Tx = Prisma.TransactionClient;

/** Key-producing SELECTs (key text, n int) per facet type over the temp B tables. */
function sourceSql(type: FacetType): Prisma.Sql {
  switch (type) {
    case "genre":
      return Prisma.sql`
        SELECT lower(g.name) AS key, count(*)::int AS n FROM movie_genres x
          JOIN genres g ON g.id = x.genre_id JOIN tb_m b ON b.id = x.movie_id GROUP BY 1
        UNION ALL
        SELECT lower(g.name), count(*)::int FROM series_genres x
          JOIN genres g ON g.id = x.genre_id JOIN tb_s b ON b.id = x.series_id GROUP BY 1`;
    case "keyword":
      return Prisma.sql`
        SELECT k.tmdb_id::text AS key, count(*)::int AS n FROM movie_keywords x
          JOIN keywords k ON k.id = x.keyword_id JOIN tb_m b ON b.id = x.movie_id GROUP BY 1
        UNION ALL
        SELECT k.tmdb_id::text, count(*)::int FROM series_keywords x
          JOIN keywords k ON k.id = x.keyword_id JOIN tb_s b ON b.id = x.series_id GROUP BY 1`;
    case "country":
      return Prisma.sql`
        SELECT x.country_code AS key, count(DISTINCT x.movie_id)::int AS n FROM movie_countries x
          JOIN tb_m b ON b.id = x.movie_id GROUP BY 1
        UNION ALL
        SELECT x.country_code, count(DISTINCT x.series_id)::int FROM series_countries x
          JOIN tb_s b ON b.id = x.series_id GROUP BY 1`;
    case "language":
      return Prisma.sql`
        SELECT m.original_language AS key, count(*)::int AS n FROM movies m
          JOIN tb_m b ON b.id = m.id WHERE m.original_language IS NOT NULL GROUP BY 1
        UNION ALL
        SELECT s.original_language, count(*)::int FROM series s
          JOIN tb_s b ON b.id = s.id WHERE s.original_language IS NOT NULL GROUP BY 1`;
    case "decade":
      return Prisma.sql`
        SELECT ((EXTRACT(YEAR FROM m.release_date)::int / 10) * 10)::text AS key, count(*)::int AS n
          FROM movies m JOIN tb_m b ON b.id = m.id WHERE m.release_date IS NOT NULL GROUP BY 1
        UNION ALL
        SELECT ((EXTRACT(YEAR FROM s.first_air_date)::int / 10) * 10)::text, count(*)::int
          FROM series s JOIN tb_s b ON b.id = s.id WHERE s.first_air_date IS NOT NULL GROUP BY 1`;
    case "director":
      return Prisma.sql`
        SELECT p.tmdb_id::text AS key, count(DISTINCT c.movie_id)::int AS n FROM credits c
          JOIN tb_m b ON b.id = c.movie_id JOIN persons p ON p.id = c.person_id
          WHERE c.credit_type = 'CREW' AND c.job = 'Director' GROUP BY 1
        UNION ALL
        SELECT p.tmdb_id::text, count(DISTINCT x.series_id)::int FROM series_creators x
          JOIN tb_s b ON b.id = x.series_id JOIN persons p ON p.id = x.person_id GROUP BY 1`;
    case "cast":
      return Prisma.sql`
        SELECT p.tmdb_id::text AS key, count(DISTINCT c.movie_id)::int AS n FROM credits c
          JOIN tb_m b ON b.id = c.movie_id JOIN persons p ON p.id = c.person_id
          WHERE c.credit_type = 'CAST' AND c.credit_order IS NOT NULL AND c.credit_order < 5 GROUP BY 1
        UNION ALL
        SELECT p.tmdb_id::text, count(DISTINCT c.series_id)::int FROM credits c
          JOIN tb_s b ON b.id = c.series_id JOIN persons p ON p.id = c.person_id
          WHERE c.credit_type = 'CAST' AND c.is_aggregate = false
            AND c.credit_order IS NOT NULL AND c.credit_order < 5 GROUP BY 1`;
    case "theme":
      return Prisma.sql`
        SELECT ${TAG_KEY(Prisma.sql`text`)} AS key, count(DISTINCT ai_data_id)::int AS n
        FROM ai_insights
        WHERE category IN ('THEME', 'VIBE') AND spoiler_level = 'FREE' AND length(btrim(text)) BETWEEN 1 AND 60
        GROUP BY 1`;
    case "mood":
      return Prisma.sql`
        SELECT subcategory || ':' || ${TAG_KEY(Prisma.sql`text`)} AS key, count(DISTINCT ai_data_id)::int AS n
        FROM ai_insights WHERE category = 'MOOD' AND subcategory IS NOT NULL GROUP BY 1`;
  }
}

const TYPES: FacetType[] = ["genre", "keyword", "theme", "mood", "director", "cast", "country", "language", "decade"];

export interface BaselineRefreshReport {
  mode: "votes" | "all";
  catalogSize: number;
  enrichedSize: number;
  /** Embedded titles the mean/std came from (0 = below SPACE_MIN_TITLES → raw space). */
  embeddingCount: number;
  embeddingMs: number;
  perType: Record<string, { keys: number; inserted: number; updated: number; deleted: number; ms: number }>;
  quantilesMs: number;
  totalMs: number;
}

async function refreshType(tx: Tx, type: FacetType) {
  const t0 = Date.now();
  await tx.$executeRaw`DROP TABLE IF EXISTS tfb_stage`;
  await tx.$executeRaw`CREATE TEMP TABLE tfb_stage (key text PRIMARY KEY, n int NOT NULL) ON COMMIT DROP`;
  await tx.$executeRaw`
    INSERT INTO tfb_stage (key, n)
    SELECT key, sum(n)::int FROM (${sourceSql(type)}) src WHERE key IS NOT NULL GROUP BY key`;
  const deleted = await tx.$executeRaw`
    DELETE FROM taste_facet_baseline b
    WHERE b.type = ${type} AND NOT EXISTS (SELECT 1 FROM tfb_stage s WHERE s.key = b.key)`;
  const inserted = await tx.$executeRaw`
    INSERT INTO taste_facet_baseline (type, key, n)
    SELECT ${type}, s.key, s.n FROM tfb_stage s
    WHERE NOT EXISTS (SELECT 1 FROM taste_facet_baseline b WHERE b.type = ${type} AND b.key = s.key)`;
  const updated = await tx.$executeRaw`
    UPDATE taste_facet_baseline b SET n = s.n FROM tfb_stage s
    WHERE b.type = ${type} AND b.key = s.key AND b.n <> s.n`;
  const keys = await tx.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int AS c FROM tfb_stage`;
  await tx.$executeRaw`DROP TABLE tfb_stage`;
  return { keys: Number(keys[0]?.c ?? 0), inserted, updated, deleted, ms: Date.now() - t0 };
}

/**
 * Catalog mean μ and per-dimension std σ of the L2-normalised embeddings over
 * population B (spec 2026-10-10-taste-vector-upgrades.md §2). One aggregate
 * pass in Postgres (pgvector `avg` + elementwise `*`); Node only receives the
 * two 1024-d results. Below SPACE_MIN_TITLES embedded titles (dev DBs) the
 * columns are cleared → the request path stays in raw space.
 */
async function refreshEmbeddingStats(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ mean: number[] | null; sq: number[] | null; n: number }>>`
    WITH e AS (
      SELECT l2_normalize(m.embedding) AS v FROM movies m JOIN tb_m t ON t.id = m.id WHERE m.embedding IS NOT NULL
      UNION ALL
      SELECT l2_normalize(s.embedding) FROM series s JOIN tb_s t ON t.id = s.id WHERE s.embedding IS NOT NULL
    )
    SELECT avg(v)::real[] AS mean, avg(v * v)::real[] AS sq, count(*)::int AS n FROM e`;
  const r = rows[0];
  const n = Number(r?.n ?? 0);
  if (!r?.mean || !r.sq || n < SPACE_MIN_TITLES) {
    await tx.$executeRaw`
      UPDATE taste_baseline_meta SET embedding_mean = NULL, embedding_std = '{}', embedding_count = ${n} WHERE id = 1`;
    return 0;
  }
  const mean = r.mean.map(Number);
  const std = embeddingStd(mean, r.sq.map(Number));
  await tx.$executeRaw`
    UPDATE taste_baseline_meta
    SET embedding_mean = ${vectorLiteral(mean)}::vector, embedding_std = ${std}::float8[], embedding_count = ${n}
    WHERE id = 1`;
  return n;
}

/** σ_i = √max(0, E[x_i²] − μ_i²). */
export function embeddingStd(mean: readonly number[], meanSquares: readonly number[]): number[] {
  return mean.map((m, i) => Math.sqrt(Math.max(0, (meanSquares[i] ?? 0) - m * m)));
}

export async function refreshTasteBaseline(): Promise<BaselineRefreshReport> {
  const t0 = Date.now();
  return prisma.$transaction(
    async (tx) => {
      // Materialise B once per run (temp tables live for this transaction).
      await tx.$executeRaw`DROP TABLE IF EXISTS tb_m`;
      await tx.$executeRaw`DROP TABLE IF EXISTS tb_s`;
      // DDL can't take bind params → create empty, then INSERT … SELECT.
      await tx.$executeRaw`CREATE TEMP TABLE tb_m (id int NOT NULL) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE tb_s (id int NOT NULL) ON COMMIT DROP`;
      await tx.$executeRaw`
        INSERT INTO tb_m SELECT DISTINCT r.movie_id FROM ratings r JOIN movies m ON m.id = r.movie_id
        WHERE r.source_id = ${TMDB_SOURCE} AND r.vote_count >= ${BASELINE_MIN_VOTES} AND m.adult = false`;
      await tx.$executeRaw`
        INSERT INTO tb_s SELECT DISTINCT r.series_id FROM ratings r JOIN series s ON s.id = r.series_id
        WHERE r.source_id = ${TMDB_SOURCE} AND r.vote_count >= ${BASELINE_MIN_VOTES} AND s.adult = false`;
      const sizeRows = await tx.$queryRaw<Array<{ n: number }>>`
        SELECT ((SELECT count(*) FROM tb_m) + (SELECT count(*) FROM tb_s))::int AS n`;
      let catalogSize = Number(sizeRows[0]?.n ?? 0);
      let mode: "votes" | "all" = "votes";
      if (catalogSize < BASELINE_MIN_SIZE) {
        mode = "all";
        await tx.$executeRaw`TRUNCATE tb_m`;
        await tx.$executeRaw`TRUNCATE tb_s`;
        await tx.$executeRaw`INSERT INTO tb_m SELECT id FROM movies WHERE adult = false`;
        await tx.$executeRaw`INSERT INTO tb_s SELECT id FROM series WHERE adult = false`;
        const all = await tx.$queryRaw<Array<{ n: number }>>`
          SELECT ((SELECT count(*) FROM tb_m) + (SELECT count(*) FROM tb_s))::int AS n`;
        catalogSize = Number(all[0]?.n ?? 0);
      }
      await tx.$executeRaw`CREATE UNIQUE INDEX ON tb_m (id)`;
      await tx.$executeRaw`CREATE UNIQUE INDEX ON tb_s (id)`;
      await tx.$executeRaw`ANALYZE tb_m`;
      await tx.$executeRaw`ANALYZE tb_s`;
      const enriched = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM ai_data`;
      const enrichedSize = Number(enriched[0]?.n ?? 0);

      const perType: BaselineRefreshReport["perType"] = {};
      for (const type of TYPES) perType[type] = await refreshType(tx, type);

      const q0 = Date.now();
      const steps = Array.from({ length: 101 }, (_, i) => i / 100);
      const q = await tx.$queryRaw<Array<{ pop: number[] | null; yr: number[] | null }>>`
        WITH b AS (
          SELECT m.popularity AS pop, EXTRACT(YEAR FROM m.release_date)::float8 AS yr FROM movies m JOIN tb_m t ON t.id = m.id
          UNION ALL
          SELECT s.popularity, EXTRACT(YEAR FROM s.first_air_date)::float8 FROM series s JOIN tb_s t ON t.id = s.id
        )
        SELECT percentile_cont(${steps}::float8[]) WITHIN GROUP (ORDER BY pop) FILTER (WHERE pop IS NOT NULL) AS pop,
               percentile_cont(${steps}::float8[]) WITHIN GROUP (ORDER BY yr) FILTER (WHERE yr IS NOT NULL) AS yr
        FROM b`;
      const quantilesMs = Date.now() - q0;
      const totalMs = Date.now() - t0;
      const meta = {
        mode,
        catalogSize,
        enrichedSize,
        popularityQuantiles: (q[0]?.pop ?? []).map(Number),
        yearQuantiles: (q[0]?.yr ?? []).map(Number),
        computedAt: new Date(),
        durationMs: totalMs,
      };
      await tx.tasteBaselineMeta.upsert({ where: { id: 1 }, create: { id: 1, ...meta }, update: meta });
      const e0 = Date.now();
      const embeddingCount = await refreshEmbeddingStats(tx);
      const embeddingMs = Date.now() - e0;
      return { mode, catalogSize, enrichedSize, embeddingCount, embeddingMs, perType, quantilesMs, totalMs: Date.now() - t0 };
    },
    { timeout: 30 * 60 * 1000, maxWait: 30_000 }
  );
}
