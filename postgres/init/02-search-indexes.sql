-- =============================================================================
-- Fuzzy Search Indexes (run after Prisma migrations)
-- =============================================================================

-- These indexes enable fast trigram-based fuzzy search
-- Run this AFTER `npx prisma migrate dev` creates the tables

-- Movie title fuzzy search
CREATE INDEX IF NOT EXISTS idx_movies_title_trgm 
ON movies USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_movies_original_title_trgm 
ON movies USING GIN (original_title gin_trgm_ops);

-- Series name fuzzy search
CREATE INDEX IF NOT EXISTS idx_series_name_trgm 
ON series USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_series_original_name_trgm 
ON series USING GIN (original_name gin_trgm_ops);

-- =============================================================================
-- Vector Indexes (add after embeddings are populated)
-- =============================================================================

-- HNSW index for movie embeddings
-- Uncomment when embedding column is populated
-- CREATE INDEX IF NOT EXISTS idx_movies_embedding 
-- ON movies USING hnsw (embedding vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- HNSW index for series embeddings
-- CREATE INDEX IF NOT EXISTS idx_series_embedding 
-- ON series USING hnsw (embedding vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Full-text search indexes (optional, for exact word matching)
-- =============================================================================

-- Movie full-text search
CREATE INDEX IF NOT EXISTS idx_movies_fts 
ON movies USING GIN (to_tsvector('english', title || ' ' || COALESCE(overview, '')));

-- Series full-text search
CREATE INDEX IF NOT EXISTS idx_series_fts 
ON series USING GIN (to_tsvector('english', name || ' ' || COALESCE(overview, '')));

