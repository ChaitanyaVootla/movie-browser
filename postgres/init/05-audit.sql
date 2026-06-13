-- =============================================================================
-- Generic Trigger-Based Audit Log Backbone (industry-standard "if_modified")
-- =============================================================================
-- A single plpgsql trigger function (audit.if_modified) writes a row into
-- public.audit_log for every INSERT / UPDATE / DELETE on the OPT-IN set of
-- tables wired up at the bottom of this file. This is the generic backbone; it
-- coexists with typed shadow tables like `username_history` (a username change
-- records BOTH). See .claude/rules/audit-log.md for the full pattern.
--
-- OPT-IN ONLY. NEVER attach to catalog/hydration tables (movies, series,
-- seasons, episodes, images, credits, videos, external_ids, watch_options,
-- genres, people, ai_data, ai_insights). Those are delete+reinserted en masse
-- by the hydration pipeline (.claude/rules/postgres-hydration.md) and would
-- flood the audit log with millions of meaningless churn rows.
--
-- ACTOR: derived from the per-transaction GUC `audit.actor_id`, set via
-- `SET LOCAL "audit.actor_id" = '<id>'` (see src/server/db/audit.ts /
-- auditedTransaction). Absent → NULL actor (the trigger degrades gracefully;
-- it never errors on missing actor). audit_log.actor_id carries NO foreign key
-- so the trail OUTLIVES the actor's user row.
--
-- IDEMPOTENT + REAPPLY-SAFE:
--   * CREATE SCHEMA / FUNCTION use IF NOT EXISTS / OR REPLACE.
--   * Each trigger is DROP TRIGGER IF EXISTS + CREATE TRIGGER, so a
--     `prisma db push` table recreation (which silently drops triggers) heals
--     on the next apply.
--
-- Applied by the deploy pipeline gated on a COMBINED hash of this file +
-- prisma/schema.prisma (either changing re-fires the apply — mirrors the UGC
-- constraints step in .github/workflows/deploy-ec2.yml).
-- Apply manually:
--   DATABASE_URL=postgresql://... npx tsx scripts/apply-audit.ts
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS audit;

-- ---------------------------------------------------------------------------
-- audit.if_modified() — the universal trigger function.
--   TG_ARGV[0] (optional): comma-separated column names to EXCLUDE. Excluded
--   columns are stripped from old_data/new_data AND ignored when computing the
--   changed-column diff (use for noisy/sensitive columns: updated_at,
--   last_active_at, image, ...). Whitespace around names is trimmed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.if_modified()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor          int;
  v_excluded       text[];
  v_old            jsonb;
  v_new            jsonb;
  v_row_id         text;
  v_changed        text[] := ARRAY[]::text[];
  v_key            text;
BEGIN
  -- Actor from the per-tx GUC; missing/empty -> NULL (graceful degrade).
  v_actor := nullif(current_setting('audit.actor_id', true), '')::int;

  -- Excluded-column list from the trigger argument (may be NULL/absent).
  IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL AND TG_ARGV[0] <> '' THEN
    SELECT array_agg(trim(c))
      INTO v_excluded
      FROM unnest(string_to_array(TG_ARGV[0], ',')) AS c;
  ELSE
    v_excluded := ARRAY[]::text[];
  END IF;

  -- Snapshot OLD/NEW as jsonb, then redact excluded keys from the snapshots.
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) END;

  IF array_length(v_excluded, 1) IS NOT NULL THEN
    FOREACH v_key IN ARRAY v_excluded LOOP
      v_old := v_old - v_key;
      v_new := v_new - v_key;
    END LOOP;
  END IF;

  -- row_id from the surviving record's id (text-cast for the generic column).
  v_row_id := coalesce(v_new, v_old) ->> 'id';

  IF TG_OP = 'UPDATE' THEN
    -- Diff post-redaction snapshots; a changed column is one whose value
    -- differs (IS DISTINCT FROM handles NULLs). Excluded keys are already gone.
    SELECT array_agg(k ORDER BY k)
      INTO v_changed
      FROM (
        SELECT key AS k
          FROM jsonb_each(v_new)
        UNION
        SELECT key AS k
          FROM jsonb_each(v_old)
      ) keys
     WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k);

    v_changed := coalesce(v_changed, ARRAY[]::text[]);

    -- No meaningful change (only excluded columns moved, or nothing) -> no row.
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.audit_log (
    table_name, row_id, operation, changed_at, actor_id,
    old_data, new_data, changed_columns
  ) VALUES (
    TG_TABLE_NAME,
    v_row_id,
    TG_OP,
    now(),
    v_actor,
    v_old,
    v_new,
    v_changed
  );

  RETURN NULL; -- AFTER trigger; return value ignored.
END;
$$;

-- ---------------------------------------------------------------------------
-- OPT-IN trigger attachments. Add one block per newly-audited table; never
-- add catalog/hydration tables here (see header). The DROP+CREATE pair is
-- idempotent and reattaches after a table recreation.
-- ---------------------------------------------------------------------------

-- users: redact churny/sensitive columns (timestamp touch + OAuth avatar URL).
DROP TRIGGER IF EXISTS trg_audit_users ON users;
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('updated_at,last_active_at,image');

DROP TRIGGER IF EXISTS trg_audit_user_reviews ON user_reviews;
CREATE TRIGGER trg_audit_user_reviews
  AFTER INSERT OR UPDATE OR DELETE ON user_reviews
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('updated_at');

DROP TRIGGER IF EXISTS trg_audit_comments ON comments;
CREATE TRIGGER trg_audit_comments
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('updated_at');

DROP TRIGGER IF EXISTS trg_audit_user_ratings ON user_ratings;
CREATE TRIGGER trg_audit_user_ratings
  AFTER INSERT OR UPDATE OR DELETE ON user_ratings
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('updated_at');

DROP TRIGGER IF EXISTS trg_audit_blocks ON blocks;
CREATE TRIGGER trg_audit_blocks
  AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified();

DROP TRIGGER IF EXISTS trg_audit_follows ON follows;
CREATE TRIGGER trg_audit_follows
  AFTER INSERT OR UPDATE OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified();

DROP TRIGGER IF EXISTS trg_audit_lists ON lists;
CREATE TRIGGER trg_audit_lists
  AFTER INSERT OR UPDATE OR DELETE ON lists
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('updated_at');

DROP TRIGGER IF EXISTS trg_audit_watchlist ON watchlist;
CREATE TRIGGER trg_audit_watchlist
  AFTER INSERT OR UPDATE OR DELETE ON watchlist
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified();
