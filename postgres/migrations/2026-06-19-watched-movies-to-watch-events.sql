-- Backfill watch_events from the pre-migration watched_movies snapshot.
--
-- Part of the watched_movies → watch_events expand/contract migration (the
-- social Phase-0 schema dropped the watched_movies model). The deploy snapshots
-- public.watched_movies into migration_backup.watched_movies BEFORE `prisma db
-- push` drops it (db push only syncs the `public` schema, so the backup in a
-- separate schema survives the push — verified Jun 19 2026). This script then
-- moves that snapshot into watch_events AFTER the push has created the table.
--
-- IDEMPOTENT + self-gating: no-op when the snapshot is absent (not a migration
-- deploy) or when every legacy row already has a BACKFILL watch_event. Safe to
-- run on every deploy.
--
-- media_type is REQUIRED (NOT NULL, no default) on watch_events and watched_movies
-- was movies-only, so every backfilled row is 'MOVIE'. (A rehearsal against a
-- restored prod-shaped DB caught the original migrate-watched-movies.ts omitting
-- media_type → it would have failed the prod backfill with a NOT NULL violation.)
DO $$
BEGIN
  IF to_regclass('migration_backup.watched_movies') IS NULL THEN
    RAISE NOTICE '[backfill] migration_backup.watched_movies absent — nothing to backfill';
    RETURN;
  END IF;
  IF to_regclass('public.watch_events') IS NULL THEN
    RAISE EXCEPTION '[backfill] watch_events does not exist yet — run prisma db push first';
  END IF;

  -- Old rows: source=BACKFILL, watched_at=NULL/UNKNOWN (the old created_at is
  -- when the user MARKED, not when they watched), preserved as created_at for
  -- ordering. kind=WATCH, cycle=1 are also DB defaults — set explicitly for clarity.
  INSERT INTO public.watch_events
    (user_id, movie_id, media_type, watched_at, watched_at_precision, source,
     is_rewatch, is_private, tags, kind, cycle, created_at)
  SELECT wm.user_id, wm.movie_id, 'MOVIE', NULL, 'UNKNOWN', 'BACKFILL',
         false, false, '{}', 'WATCH', 1, wm.created_at
  FROM migration_backup.watched_movies wm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.watch_events we
    WHERE we.user_id = wm.user_id
      AND we.movie_id = wm.movie_id
      AND we.source = 'BACKFILL'
  );

  -- Verify every legacy row is represented before anyone drops the snapshot.
  IF EXISTS (
    SELECT 1 FROM migration_backup.watched_movies wm
    WHERE NOT EXISTS (
      SELECT 1 FROM public.watch_events we
      WHERE we.user_id = wm.user_id AND we.movie_id = wm.movie_id
    )
  ) THEN
    RAISE EXCEPTION '[backfill] incomplete — some watched_movies rows have no watch_event';
  END IF;

  -- Recompute lifetime stats (hours/counts) that derive from watch_events.
  UPDATE public.user_stats SET dirty = true;

  RAISE NOTICE '[backfill] watched_movies → watch_events complete (migration_backup retained as a safety copy)';
END $$;
