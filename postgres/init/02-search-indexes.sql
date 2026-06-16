-- =============================================================================
-- Full-Text Search (FTS) Indexes for Movie Browser
-- =============================================================================
--
-- NOTE: The pg_trgm trigram indexes (fuzzy/typo search) are NOT here anymore —
-- they are declared in prisma/schema.prisma (@@index(..., type: Gin,
-- ops: raw("gin_trgm_ops"))) so `prisma db push` creates AND preserves them.
-- A raw-SQL trigram index would be dropped as drift on the next push (which is
-- exactly what broke search before).
--
-- These FTS indexes use to_tsvector() expressions that Prisma's schema cannot
-- represent, so they live here and are applied by the deploy pipeline
-- (.github/workflows/deploy-ec2.yml) after `prisma db push`. Prisma leaves
-- expression indexes alone (they don't show up as drift), so they survive pushes.
-- Re-apply manually any time:
--
--   docker compose exec -T postgres \
--     psql -U moviebrowser -d moviebrowser < postgres/init/02-search-indexes.sql
--
-- CONCURRENTLY + IF NOT EXISTS → idempotent and never locks the tables.
-- (Vector/HNSW indexes for semantic search live in 03-vector-indexes.sql.)
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

-- Name-only persons FTS — used by autocomplete person search. Matching the full
-- name+biography vector is too broad for the ~3M-person table (a common word
-- like "matrix" hits thousands of bios); name-only stays fast and relevant.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_persons_name_fts ON persons
USING GIN (to_tsvector('english', COALESCE(name, '')));

-- =============================================================================
-- Title/name-ONLY FTS — used for as-you-type PREFIX matching (to_tsquery 'inc:*')
-- =============================================================================
-- The combined idx_movies_fts / idx_series_fts above index title+overview(+tagline)
-- as one document. That is correct for relevance on a SUBMITTED query, but
-- pathological for a short single-token PREFIX: "inc:*" matches ~41k movies via
-- words in the overview (incident, increase, …) → 4s heap recheck. Matching the
-- prefix against the TITLE only is ~25x more selective (inc → ~1.6k titles) and
-- returns what autocomplete actually wants — titles that START with what you typed.
-- Same rationale as idx_persons_name_fts. See fts-search.ts (ftsPrefixSearch*).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_title_fts ON movies
USING GIN (to_tsvector('english', COALESCE(title, '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_name_fts ON series
USING GIN (to_tsvector('english', COALESCE(name, '')));
