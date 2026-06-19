/**
 * Hard migration: watched_movies -> watch_events.
 *
 * Old rows become source=BACKFILL, watchedAt=NULL, precision=UNKNOWN — the
 * old createdAt is when the user MARKED, not watched (spec §4.2), preserved
 * as watch_events.created_at for ordering.
 *
 * Idempotent via NOT EXISTS on (user, movie, BACKFILL). Run BEFORE dropping
 * the model from the schema (reads public.watched_movies while it still exists).
 *
 * NOTE: the PROD deploy does NOT use this script — it runs the expand/contract
 * SQL in postgres/migrations/2026-06-19-watched-movies-to-watch-events.sql
 * (snapshot → db push drops the table → backfill from the snapshot), wired into
 * .github/workflows/deploy-ec2.yml. This script remains for local/dev + manual
 * pre-drop runs; keep the INSERT column list in sync with that SQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/migrate-watched-movies.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Raw SQL throughout: the WatchedMovie model is gone from the generated
  // client (dropped in the same change), but the TABLE still exists wherever
  // this script legitimately runs (prod, pre-schema-deploy).
  const tableExists = await prisma.$queryRaw<Array<{ reg: string | null }>>`
    SELECT to_regclass('public.watched_movies')::text AS reg
  `;
  if (tableExists[0]?.reg === null) {
    console.log("watched_movies table no longer exists — migration already done. Nothing to do.");
    return;
  }

  const sourceCount = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM watched_movies
  `;
  const sourceRows = Number(sourceCount[0]?.n ?? 0n);

  // media_type is REQUIRED (NOT NULL, no default) on watch_events — added by the
  // 2026-06-14 diary/log unification AFTER this script was first written.
  // watched_movies was movies-only, so every row is 'MOVIE'. kind=WATCH / cycle=1
  // are DB defaults, set explicitly for clarity. (Omitting media_type made the
  // prod backfill fail with a NOT NULL violation — caught in a Jun 19 rehearsal.)
  const inserted = await prisma.$executeRaw`
    INSERT INTO watch_events
      (user_id, movie_id, media_type, watched_at, watched_at_precision, source,
       is_rewatch, is_private, tags, kind, cycle, created_at)
    SELECT wm.user_id, wm.movie_id, 'MOVIE', NULL, 'UNKNOWN', 'BACKFILL',
           false, false, '{}', 'WATCH', 1, wm.created_at
    FROM watched_movies wm
    WHERE NOT EXISTS (
      SELECT 1 FROM watch_events we
      WHERE we.user_id = wm.user_id
        AND we.movie_id = wm.movie_id
        AND we.source = 'BACKFILL'
    )
  `;

  const verify = await prisma.$queryRaw<Array<{ missing: bigint }>>`
    SELECT COUNT(*)::bigint AS missing
    FROM watched_movies wm
    WHERE NOT EXISTS (
      SELECT 1 FROM watch_events we
      WHERE we.user_id = wm.user_id AND we.movie_id = wm.movie_id
    )
  `;
  const missing = Number(verify[0]?.missing ?? 0n);

  await prisma.$executeRaw`UPDATE user_stats SET dirty = true`;

  console.log({ sourceRows, inserted, missing });
  if (missing > 0) {
    throw new Error(`Migration incomplete: ${missing} watched_movies rows have no watch_event`);
  }
  console.log("watched_movies fully represented in watch_events — safe to drop the table.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
