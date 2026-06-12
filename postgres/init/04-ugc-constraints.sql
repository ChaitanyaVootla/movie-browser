-- =============================================================================
-- UGC Integrity Constraints (Phase 0 — Tracking Core)
-- =============================================================================
-- Raw-SQL integrity Prisma cannot express: CHECK constraints, partial uniques,
-- expression uniques, UNIQUE NULLS NOT DISTINCT (PG 17).
--
-- IDEMPOTENT + REAPPLY-SAFE:
--   * CHECKs: DROP CONSTRAINT IF EXISTS + ADD — a `prisma db push` table
--     recreation silently drops CHECKs; reapply must heal, never skip.
--   * Unique indexes: CREATE UNIQUE INDEX IF NOT EXISTS (recreated if a push
--     recreated the table; left alone otherwise).
--
-- Applied by the deploy pipeline gated on a COMBINED hash of this file +
-- prisma/schema.prisma (either changing re-fires the apply — spec invariant 5).
-- Apply manually:
--   DATABASE_URL=postgresql://... npx tsx scripts/apply-ugc-constraints.ts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- watch_events: exactly one of movie/series; season requires series; episode
-- requires season. Series-level events (season/episode NULL) are LEGAL =
-- "watched, granularity unknown" (IMDb imports).
-- ---------------------------------------------------------------------------
ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_one_anchor;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_one_anchor
  CHECK (num_nonnulls(movie_id, series_id) = 1);

ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_season_chain;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_episode_chain;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_episode_chain
  CHECK (episode_number IS NULL OR season_number IS NOT NULL);

-- ---------------------------------------------------------------------------
-- user_ratings: a row may carry thumb, score, or both — never neither.
-- ---------------------------------------------------------------------------
ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_thumb;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_thumb
  CHECK (rating IS NULL OR rating IN (-1, 1));

ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_score_range;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_score_range
  CHECK (score IS NULL OR (score >= 1 AND score <= 10));

ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_not_empty;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_not_empty
  CHECK (rating IS NOT NULL OR score IS NOT NULL);

-- ---------------------------------------------------------------------------
-- user_reviews: exactly one anchor; season requires series; ONE series-level
-- review (NULL season) per user per series — PG17 UNIQUE NULLS NOT DISTINCT.
-- ---------------------------------------------------------------------------
ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS chk_user_reviews_one_anchor;
ALTER TABLE user_reviews ADD CONSTRAINT chk_user_reviews_one_anchor
  CHECK (num_nonnulls(movie_id, series_id) = 1);

ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS chk_user_reviews_season_chain;
ALTER TABLE user_reviews ADD CONSTRAINT chk_user_reviews_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_reviews_user_series_season
  ON user_reviews (user_id, series_id, season_number) NULLS NOT DISTINCT
  WHERE series_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- comments: <=1 of movie/series/list anchors AND at least one of (anchor,
-- circle); episode keys require series->season chain; EPISODE scope requires
-- scope_season.
-- ---------------------------------------------------------------------------
ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_anchor_count;
ALTER TABLE comments ADD CONSTRAINT chk_comments_anchor_count
  CHECK (num_nonnulls(movie_id, series_id, list_id) <= 1);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_has_target;
ALTER TABLE comments ADD CONSTRAINT chk_comments_has_target
  CHECK (num_nonnulls(movie_id, series_id, list_id, circle_id) >= 1);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_season_chain;
ALTER TABLE comments ADD CONSTRAINT chk_comments_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_episode_chain;
ALTER TABLE comments ADD CONSTRAINT chk_comments_episode_chain
  CHECK (episode_number IS NULL OR season_number IS NOT NULL);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_episode_scope;
ALTER TABLE comments ADD CONSTRAINT chk_comments_episode_scope
  CHECK (spoiler_scope <> 'EPISODE' OR scope_season IS NOT NULL);

-- ---------------------------------------------------------------------------
-- list_items: exactly one of movie/series/person.
-- ---------------------------------------------------------------------------
ALTER TABLE list_items DROP CONSTRAINT IF EXISTS chk_list_items_one_anchor;
ALTER TABLE list_items ADD CONSTRAINT chk_list_items_one_anchor
  CHECK (num_nonnulls(movie_id, series_id, person_id) = 1);

-- ---------------------------------------------------------------------------
-- lists: one FOUR_FAVORITES list per user (app enforces max 4 items).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_lists_four_favorites_per_owner
  ON lists (owner_id) WHERE kind = 'FOUR_FAVORITES';

-- ---------------------------------------------------------------------------
-- reports: exactly one target.
-- ---------------------------------------------------------------------------
ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_one_target;
ALTER TABLE reports ADD CONSTRAINT chk_reports_one_target
  CHECK (num_nonnulls(comment_id, review_id) = 1);

-- ---------------------------------------------------------------------------
-- blocks: no self-blocks.
-- ---------------------------------------------------------------------------
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS chk_blocks_not_self;
ALTER TABLE blocks ADD CONSTRAINT chk_blocks_not_self
  CHECK (blocker_id <> blocked_id);

-- ---------------------------------------------------------------------------
-- users: case-insensitive username uniqueness (routes /u/[username]).
-- Expression indexes survive `prisma db push` (FTS precedent, 02-search-indexes.sql).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON users (lower(username));
