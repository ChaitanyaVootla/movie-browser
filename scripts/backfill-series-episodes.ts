#!/usr/bin/env npx tsx
/**
 * One-off: fill episodes for series whose seasons exist in PG with NO episode
 * rows (Nov 2026: 837 of 3,048 series with popularity > 20). Before the Oct 8
 * isSummaryOnly guard, summary season writes deleted episodes, and the
 * series freshness clock (updated_at, premiere-anchored) kept these from ever
 * refetching. Set position / Mark season saved nothing for them.
 *
 * The app now heals these on its own (tracking actions + a gap-triggered full
 * refresh on page render), but only when visited. This fills the popular ones
 * up front. Idempotent: ensureSeriesEpisodes re-checks the gap per series.
 *
 * Dry-run by default (lists what it would fill):
 *   nice -n 19 npx tsx scripts/backfill-series-episodes.ts --min-popularity 5
 * Write:
 *   nice -n 19 npx tsx scripts/backfill-series-episodes.ts --min-popularity 5 --apply
 * Flags: --limit N (default 2000), --pause-ms N between series (default 400).
 */
import { prisma } from "@/server/db/postgres";
import { ensureSeriesEpisodes } from "@/server/services/hydration/episode-backfill";

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const APPLY = process.argv.includes("--apply");
const MIN_POP = flag("--min-popularity", 5);
const LIMIT = flag("--limit", 2000);
const PAUSE_MS = flag("--pause-ms", 400);

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ id: number; name: string | null; popularity: number | null }>>`
    SELECT s.id, s.name, s.popularity
    FROM series s
    WHERE s.popularity >= ${MIN_POP}
      AND EXISTS (
        SELECT 1 FROM seasons se
        WHERE se.series_id = s.id AND se.season_number > 0 AND se.episode_count > 0
          AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.season_id = se.id)
      )
    ORDER BY s.popularity DESC NULLS LAST
    LIMIT ${LIMIT}`;

  console.log(`${rows.length} series with an episode gap (popularity >= ${MIN_POP})`);
  if (!APPLY) {
    for (const r of rows.slice(0, 25)) console.log(`  ${r.id}  ${r.name}  (${r.popularity})`);
    console.log("Dry run. Pass --apply to fill them.");
    return;
  }

  let filled = 0;
  let failed = 0;
  for (const [i, r] of rows.entries()) {
    try {
      if (await ensureSeriesEpisodes(r.id)) filled++;
      else failed++;
    } catch (error: unknown) {
      failed++;
      console.warn(`series ${r.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${rows.length} filled=${filled} failed=${failed}`);
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
  console.log(`done: filled=${filled} failed=${failed} of ${rows.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
