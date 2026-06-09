-- =============================================================================
-- Vector (semantic) Indexes for Movie Browser — pgvector HNSW
-- =============================================================================
--
-- Separate from 02-search-indexes.sql because HNSW builds are CPU/memory heavy
-- (bounded by maintenance_work_mem) and only matter once embeddings exist. These
-- are NOT applied automatically on every deploy. Apply manually after a sizeable
-- embedding backfill:
--
--   docker compose exec -T postgres \
--     psql -U moviebrowser -d moviebrowser < postgres/init/03-vector-indexes.sql
--
-- Embedding model: Cohere Embed v4 via AWS Bedrock, 1024 dims, cosine distance.
-- =============================================================================

-- Movies embedding index (m=16 connections/node, ef_construction=64 build depth)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_embedding_hnsw
ON movies USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Series embedding index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_embedding_hnsw
ON series USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Query-time accuracy/speed knob (per session): SET hnsw.ef_search = 100;
