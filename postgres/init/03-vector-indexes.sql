-- =============================================================================
-- Vector (semantic) Indexes for Movie Browser — pgvector HNSW (halfvec)
-- =============================================================================
--
-- Applied by the deploy pipeline, hash-gated (step [3.7/5] in
-- .github/workflows/deploy-ec2.yml): md5(this file) must differ from
-- `.last-vector-hash` on the box. Safe to re-run: IF NOT EXISTS + CONCURRENTLY.
--
-- WHY halfvec EXPRESSION indexes (not `ON movies USING hnsw (embedding ...)`):
--   1. `prisma db push` DROPS a plain index on the `embedding` column as schema
--      drift (verified with `prisma migrate diff` Oct 2026), but leaves
--      expression indexes alone — so these survive schema deploys and this file
--      does not need the schema hash in its gate (unlike 04/05).
--   2. halfvec (2 bytes/dim) halves the index: ~2KB/vector instead of ~4KB, so
--      the movies graph (~120k vectors, ~300MB) builds IN maintenance_work_mem.
--      Cosine ranking at fp16 is indistinguishable for top-k similarity.
--   Queries MUST order by the same expression to use the index:
--     ORDER BY m.embedding::halfvec(1024) <=> $1::halfvec(1024)
--   (see src/server/db/postgres/smart-discover.ts).
--
-- BUILD COST on prod (m8g.large, 2 vCPU / 8GB shared with Next + ClickHouse):
--   measured locally on a restored prod dump — see the PR/report for numbers.
--   One worker only (max_parallel_maintenance_workers = 0) so the build never
--   takes both cores from Next; CONCURRENTLY so reads/writes keep flowing.
--   maintenance_work_mem 512MB: fits the movies graph; the box has ~4GB
--   available (Next ~1-2GB RSS, ClickHouse capped 2.2GB, PG shared_buffers 1GB).
--
-- If a CONCURRENTLY build is interrupted it leaves an INVALID index that
-- IF NOT EXISTS would then skip forever — so drop invalid leftovers first.
-- =============================================================================

SET maintenance_work_mem = '512MB';
SET max_parallel_maintenance_workers = 0;
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- Legacy definitions from the never-applied earlier version of this file
-- (plain vector column indexes, which db push would drop anyway).
DROP INDEX CONCURRENTLY IF EXISTS idx_movies_embedding_hnsw;
DROP INDEX CONCURRENTLY IF EXISTS idx_series_embedding_hnsw;

-- Drop an INVALID leftover from an interrupted build (no-op normally).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE NOT i.indisvalid AND c.relname IN ('idx_movies_embedding_hnsw_hv', 'idx_series_embedding_hnsw_hv')
  LOOP
    EXECUTE format('DROP INDEX %I', r.relname);
  END LOOP;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_embedding_hnsw_hv
ON series USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_embedding_hnsw_hv
ON movies USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

ANALYZE movies;
ANALYZE series;
