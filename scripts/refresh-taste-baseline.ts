/**
 * refresh-taste-baseline.ts — nightly rebuild of the taste-facet catalog
 * baseline (`taste_facet_baseline` + `taste_baseline_meta`). The taste-profile
 * request path only does PK lookups against these tables; every catalog scan
 * lives here.
 *
 * PM2 `taste-baseline` (ecosystem.config.cjs), 19:00 UTC, under `nice -n 19`,
 * with the CRON_HOUR_UTC guard: PM2 re-runs cron jobs once on every `pm2 start`
 * (= every deploy), so off-hour starts exit immediately.
 *
 *   FORCE_RUN=1 nice -n 19 npx tsx scripts/refresh-taste-baseline.ts   # manual
 *
 * Memory: aggregation is server-side (INSERT … SELECT into temp tables); Node
 * only holds per-type counts. Writes are diff-only.
 */
/** Same contract as shouldRunNow in seed-episode-drop-notifications.ts (not imported:
 * that module loads dotenv + Prisma + notifications at import time). */
export function shouldRunNow(p: { nowHourUtc: number; cronHourUtc: number; force: boolean }): boolean {
  if (p.force) return true;
  return p.nowHourUtc === p.cronHourUtc;
}

async function main(): Promise<void> {
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "19");
  if (
    !shouldRunNow({
      nowHourUtc: new Date().getUTCHours(),
      cronHourUtc,
      force: process.env.FORCE_RUN === "1",
    })
  ) {
    console.log(`[taste-baseline] skip: not the ${cronHourUtc}:00 UTC window (set FORCE_RUN=1 to override)`);
    return;
  }
  const { refreshTasteBaseline } = await import("../src/server/db/postgres/social/taste-baseline");
  const { prisma } = await import("../src/server/db/postgres");
  try {
    const r = await refreshTasteBaseline();
    console.log(
      `[taste-baseline] done in ${r.totalMs}ms  mode=${r.mode} catalog=${r.catalogSize} enriched=${r.enrichedSize} quantiles=${r.quantilesMs}ms`
    );
    for (const [type, s] of Object.entries(r.perType)) {
      console.log(
        `  ${type.padEnd(9)} keys=${String(s.keys).padStart(7)} +${s.inserted} ~${s.updated} -${s.deleted}  ${s.ms}ms`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[taste-baseline] FAILED:", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
