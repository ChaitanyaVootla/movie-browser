-- =============================================================================
-- Search Indexes for Movie Browser
-- Phase 1: Trigram (fuzzy) + Phase 2: Vector (semantic)
-- =============================================================================
--
-- Embedding Model: Amazon Titan Text Embeddings V2
-- Dimensions: 1024 (optimal balance of quality vs. storage)
-- Model ID: amazon.titan-embed-text-v2:0
-- =============================================================================

-- =============================================================================
-- PHASE 1: Trigram Indexes for Fuzzy Search (pg_trgm)
-- =============================================================================

-- Movies - title fuzzy search
CREATE INDEX IF NOT EXISTS idx_movies_title_trgm 
ON movies USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_movies_original_title_trgm 
ON movies USING GIN (original_title gin_trgm_ops);

-- Series - name fuzzy search
CREATE INDEX IF NOT EXISTS idx_series_name_trgm 
ON series USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_series_original_name_trgm 
ON series USING GIN (original_name gin_trgm_ops);

-- Persons - name fuzzy search (actors, directors)
CREATE INDEX IF NOT EXISTS idx_persons_name_trgm 
ON persons USING GIN (name gin_trgm_ops);

-- Person aliases - for nickname/alternate name matching
CREATE INDEX IF NOT EXISTS idx_person_aliases_trgm 
ON person_aliases USING GIN (alias gin_trgm_ops);

-- Keywords - for semantic tag matching
CREATE INDEX IF NOT EXISTS idx_keywords_name_trgm 
ON keywords USING GIN (name gin_trgm_ops);

-- Genres - for genre name matching
CREATE INDEX IF NOT EXISTS idx_genres_name_trgm 
ON genres USING GIN (name gin_trgm_ops);

-- =============================================================================
-- Full-Text Search Indexes (complementary to trigram)
-- =============================================================================

-- Movies - weighted full-text search
CREATE INDEX IF NOT EXISTS idx_movies_fts ON movies 
USING GIN (to_tsvector('english', 
  COALESCE(title, '') || ' ' || 
  COALESCE(overview, '') || ' ' || 
  COALESCE(tagline, '')
));

-- Series - full-text search
CREATE INDEX IF NOT EXISTS idx_series_fts ON series 
USING GIN (to_tsvector('english', 
  COALESCE(name, '') || ' ' || 
  COALESCE(overview, '')
));

-- Persons - full-text search on biography
CREATE INDEX IF NOT EXISTS idx_persons_fts ON persons 
USING GIN (to_tsvector('english', 
  COALESCE(name, '') || ' ' || 
  COALESCE(biography, '')
));

-- =============================================================================
-- PHASE 2: Vector Indexes for Semantic Search (pgvector)
-- =============================================================================

-- HNSW (Hierarchical Navigable Small World) indexes for approximate nearest neighbor
-- Use cosine distance (best for text embeddings)

-- Movies embedding index
-- Parameters:
--   m = 16: max connections per node (default, good balance)
--   ef_construction = 64: build-time search depth (higher = better recall, slower build)
CREATE INDEX IF NOT EXISTS idx_movies_embedding_hnsw 
ON movies USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Series embedding index
CREATE INDEX IF NOT EXISTS idx_series_embedding_hnsw 
ON series USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Query-time settings (set per connection or globally)
-- =============================================================================

-- ef_search: controls accuracy/speed tradeoff at query time
-- Higher = more accurate but slower
-- Default: 40, Recommended: 100 for production, 200 for high accuracy

-- Example session setting:
-- SET hnsw.ef_search = 100;

-- =============================================================================
-- Utility queries for monitoring
-- =============================================================================

-- Check embedding coverage
-- SELECT 
--   COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
--   COUNT(*) as total,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / COUNT(*), 2) as coverage_pct
-- FROM movies;

-- Check index usage
-- SELECT 
--   schemaname, tablename, indexname, idx_scan, idx_tup_read
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE '%embedding%' OR indexname LIKE '%trgm%';

-- Test trigram similarity
-- SELECT title, similarity(title, 'Incepton') as sim
-- FROM movies
-- WHERE title % 'Incepton'
-- ORDER BY sim DESC
-- LIMIT 10;

-- Log completion (works in psql)
DO $$ BEGIN RAISE NOTICE 'Search indexes created successfully'; END $$;
