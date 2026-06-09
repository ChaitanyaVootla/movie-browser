-- =============================================================================
-- Trigram (fuzzy) + Full-Text Search Indexes for Movie Browser
-- =============================================================================
--
-- IMPORTANT: These indexes CANNOT be created at container init time — the tables
-- don't exist until `prisma db push` runs. They are applied by the deploy
-- pipeline (.github/workflows/deploy-ec2.yml) immediately AFTER `prisma db push`,
-- and can be re-applied manually at any time:
--
--   docker compose exec -T postgres \
--     psql -U moviebrowser -d moviebrowser < postgres/init/02-search-indexes.sql
--
-- Without these indexes, fuzzySearch()/autocomplete fall back to full-table
-- similarity scans that grow unbounded with the catalog and hang the search box.
--
-- All statements use CREATE INDEX CONCURRENTLY IF NOT EXISTS so they are
-- idempotent and never lock the tables (safe to run against the live DB).
-- (Vector/HNSW indexes for semantic search live in 03-vector-indexes.sql — they
-- are heavier to build and are applied separately, not on every deploy.)
-- =============================================================================

-- Movies — title fuzzy search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_title_trgm
ON movies USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_original_title_trgm
ON movies USING GIN (original_title gin_trgm_ops);

-- Series — name fuzzy search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_name_trgm
ON series USING GIN (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_original_name_trgm
ON series USING GIN (original_name gin_trgm_ops);

-- Persons — name fuzzy search (actors, directors)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_persons_name_trgm
ON persons USING GIN (name gin_trgm_ops);

-- Person aliases — nickname/alternate name matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_person_aliases_trgm
ON person_aliases USING GIN (alias gin_trgm_ops);

-- Keywords — semantic tag matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keywords_name_trgm
ON keywords USING GIN (name gin_trgm_ops);

-- Genres — genre name matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_genres_name_trgm
ON genres USING GIN (name gin_trgm_ops);

-- =============================================================================
-- Full-Text Search Indexes (complementary to trigram)
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_fts ON movies
USING GIN (to_tsvector('english',
  COALESCE(title, '') || ' ' ||
  COALESCE(overview, '') || ' ' ||
  COALESCE(tagline, '')
));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_fts ON series
USING GIN (to_tsvector('english',
  COALESCE(name, '') || ' ' ||
  COALESCE(overview, '')
));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_persons_fts ON persons
USING GIN (to_tsvector('english',
  COALESCE(name, '') || ' ' ||
  COALESCE(biography, '')
));
