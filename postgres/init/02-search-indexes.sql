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

-- ============================================================================
-- SQUASHED-PREFIX indexes (added Aug 18 2026)
-- ============================================================================
-- WHY: users type titles without punctuation or spaces — "shangchi",
-- "spiderman", "starwars", "johnwick". Postgres FTS tokenises "Shang-Chi" as
-- `shang` + `chi`, so a prefix tsquery for "shangchi" matches NOTHING. The
-- autocomplete path then fell through to the trigram fuzzy fallback, which spent
-- its ENTIRE 4s timeout and returned nothing — measured 4,859ms end-to-end for
-- "shangchi" vs 317ms for "interstellar". That was the chronic "search hangs".
--
-- The fix is to index a NORMALISED ("squashed") form — lowercased with every
-- non-alphanumeric removed — so "Shang-Chi and the Legend of the Ten Rings"
-- indexes as "shangchiandthelegendofthetenrings" and prefix-matches "shangchi".
-- `text_pattern_ops` is what makes `LIKE 'x%'` index-backed.
--
-- The expression MUST stay byte-identical to SQUASH_SQL in
-- `src/server/db/postgres/fts-search.ts`, or Postgres cannot use the index and
-- silently seq-scans. A test pins the two together.
--
-- regexp_replace(lower(...)) is IMMUTABLE (verified), hence indexable. Measured
-- on prod: builds are cheap (movies 4.7s/35MB, series 0.8s/4.7MB, persons
-- 11.9s/127MB) and lookups are 0.07-2ms, all Index Scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_title_squash ON movies
((regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '', 'g')) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movies_orig_title_squash ON movies
((regexp_replace(lower(coalesce(original_title, '')), '[^a-z0-9]+', '', 'g')) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_name_squash ON series
((regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '', 'g')) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_series_orig_name_squash ON series
((regexp_replace(lower(coalesce(original_name, '')), '[^a-z0-9]+', '', 'g')) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_persons_name_squash ON persons
((regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '', 'g')) text_pattern_ops);
