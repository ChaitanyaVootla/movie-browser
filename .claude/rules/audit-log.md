# Audit Log (generic trigger-based backbone)

Industry-standard "if_modified" audit trail: a single Postgres trigger function
writes every INSERT/UPDATE/DELETE on an **opt-in** set of low-churn tables into
`public.audit_log`. Established June 2026 (social phase 0). Triggers/functions
cannot be expressed in Prisma, so they live in raw SQL.

## The pattern: generic backbone + typed shadow tables COEXIST

- **Generic backbone** — `audit_log` (Prisma model `AuditLog`) + the
  `audit.if_modified()` trigger. One uniform shape for any audited table:
  `table_name, row_id, operation, changed_at, actor_id, old_data, new_data,
  changed_columns`. Cheap to extend (one trigger line, no migration).
- **Typed shadow tables** — purpose-built, queryable, app-facing history like
  `username_history`. Keep these where the app needs typed, indexed,
  product-facing history; they do NOT replace the backbone and the backbone does
  NOT replace them. A username change records BOTH a `username_history` row AND
  a generic `audit_log` row. Each serves a different consumer (product feature
  vs. forensic/admin trail).

## Files

| File | Role |
|------|------|
| `prisma/schema.prisma` → `model AuditLog` / `@@map("audit_log")` | Queryable table; indexes on `(table_name,row_id,changed_at desc)`, `(actor_id,changed_at desc)`, `(changed_at desc)` |
| `postgres/init/05-audit.sql` | `audit` schema, `audit.if_modified()` function, opt-in trigger attachments. Idempotent + reapply-safe |
| `scripts/apply-audit.ts` | Local apply path (`$$`-aware statement splitter; extended-protocol can't run multi-statement batches) |
| `scripts/verify-audit.ts` | End-to-end manual verification (no psql needed) |
| `src/server/db/audit.ts` | `auditedTransaction(actorId, fn)` — actor capture |
| `src/server/db/audit.test.ts` | Integration test (self-skips green without a live audited DB) |
| `.github/workflows/deploy-ec2.yml` step `[3.6/5]` | Hash-gated deploy apply |

## How to audit a NEW table (no migration)

Add ONE block to `postgres/init/05-audit.sql` (and that's it — the deploy gate
reapplies it; locally run `apply-audit.ts`):

```sql
DROP TRIGGER IF EXISTS trg_audit_<table> ON <table>;
CREATE TRIGGER trg_audit_<table>
  AFTER INSERT OR UPDATE OR DELETE ON <table>
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('col_to_exclude,other_col');
```

The excluded-columns arg (`TG_ARGV[0]`, comma-separated) is stripped from
`old_data`/`new_data` AND ignored in the change diff — use it for noise
(`updated_at`) and PII/secrets you don't want copied into the log. Omit the arg
to audit every column. An UPDATE that touches only excluded columns (or nothing)
writes NO row.

## NEVER audit catalog/hydration tables — and why

Do **not** attach triggers to: `movies, series, seasons, episodes, images,
credits, videos, external_ids, watch_options, genres, people, ai_data,
ai_insights` (or their junctions). The hydration pipeline delete+reinserts these
en masse on every freshness refresh (see `postgres-hydration.md`) — at crawler
scale that's hundreds of thousands of writes that would explode `audit_log` with
zero human-meaningful content. Audit only **low-churn, human-meaningful** tables.

**Current opt-in set:** `users` (excludes `updated_at,last_active_at,image`),
`user_reviews`, `comments`, `user_ratings`, `blocks`, `follows`, `lists`,
`watchlist`.

## Actor capture — `auditedTransaction`

The trigger reads the per-transaction GUC `audit.actor_id`. A mutation wanting
attribution runs inside `auditedTransaction(actorId, async (tx) => { ... })`
(`src/server/db/audit.ts`), which issues `set_config('audit.actor_id', $1, true)`
(`SET LOCAL`, parameterized — never interpolate the id) at the start of a
`prisma.$transaction`. `SET LOCAL` auto-resets on commit/rollback, so the actor
never leaks across pooled connections. Audited writes performed OUTSIDE the
wrapper are still audited — with a **NULL actor** (graceful degrade). Reference
wiring: `claimUsername` in `src/server/actions/profile.ts`.

## Why `actor_id` has NO foreign key

`audit_log.actor_id` is a bare `Int?` with no `@relation`/FK. The audit trail
must **outlive the actor's user row**: a deleted user's past actions must remain
attributable, and any `onDelete` rule would either erase the trail (Cascade /
SetNull) or block the user deletion (Restrict). The id is a historical fact, not
a live reference.

## Deploy gate

Step `[3.6/5]` in `deploy-ec2.yml` pipes `05-audit.sql` to psql, gated on the
**combined** md5 of `05-audit.sql` + `schema.prisma` (stored in
`.last-audit-hash`). Combined because a `prisma db push` table recreation
silently DROPS triggers, so a schema change must re-fire the apply even when the
audit SQL is unchanged. Mirrors the UGC-constraints step exactly.

See also: `.claude/rules/postgres-hydration.md` (why catalog tables churn),
`.claude/rules/infrastructure.md` (deploy pipeline / hash-gating),
`.claude/rules/server-actions.md`, `.claude/rules/type-safety.md`.
