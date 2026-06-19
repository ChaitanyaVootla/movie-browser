#!/usr/bin/env npx tsx
/**
 * Episode-drop notification cron (spec §7). Finds episodes that crossed into the
 * past within the lookback window, and for each viewer tracking that series
 * (series_progress WATCHING/REWATCHING) writes ONE bounded EPISODE_DROP
 * notification per (series, season): "its discussion is now open."
 *
 * Bounded by each viewer's tracked set — NEVER a fan-out. Idempotent: the notify
 * helper skips if a drop for that (series,season) already exists for the viewer.
 *
 * Usage:
 *   FORCE_RUN=1 npx tsx scripts/seed-episode-drop-notifications.ts
 */
import { fileURLToPath } from "url";
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/server/db/postgres";
import { notifyEpisodeDrop } from "../src/server/services/notifications/notify";

export const EPISODE_DROP_LOOKBACK_MS = 36 * 60 * 60 * 1000; // 36h — covers a daily run + slack

export function shouldRunNow(p: { nowHourUtc: number; cronHourUtc: number; force: boolean }): boolean {
  if (p.force) return true;
  return p.nowHourUtc === p.cronHourUtc;
}

export function isNewlyAired(airDate: Date | null, now: Date): boolean {
  if (airDate === null) return false;
  const t = airDate.getTime();
  return t <= now.getTime() && t > now.getTime() - EPISODE_DROP_LOOKBACK_MS;
}

export interface SeasonDropKey {
  seriesId: number;
  seasonNumber: number;
}

/** Collapse aired episodes to unique (series, season) drop keys, order preserved. */
export function dropKeysFromEpisodes(
  episodes: Array<{ seriesId: number; seasonNumber: number }>
): SeasonDropKey[] {
  const seen = new Set<string>();
  const out: SeasonDropKey[] = [];
  for (const e of episodes) {
    const k = `${e.seriesId}:${e.seasonNumber}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ seriesId: e.seriesId, seasonNumber: e.seasonNumber });
  }
  return out;
}

async function main() {
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "5");
  const nowHourUtc = new Date().getUTCHours();
  if (!shouldRunNow({ nowHourUtc, cronHourUtc, force: process.env.FORCE_RUN === "1" })) {
    console.log(`⏭ Outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — exiting.`);
    process.exit(0);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - EPISODE_DROP_LOOKBACK_MS);

  // Episodes that aired in the window, with their parent series id (natural keys).
  const episodes = await prisma.episode.findMany({
    where: { airDate: { gt: windowStart, lte: now } },
    select: { episodeNumber: true, season: { select: { seriesId: true, seasonNumber: true } } },
  });
  const seasonKeys = dropKeysFromEpisodes(
    episodes
      .filter((e) => e.season != null)
      .map((e) => ({ seriesId: e.season.seriesId, seasonNumber: e.season.seasonNumber }))
  );

  console.log(`📺 ${seasonKeys.length} (series,season) drops in the last ${EPISODE_DROP_LOOKBACK_MS / 3.6e6}h`);

  let notified = 0;
  for (const key of seasonKeys) {
    const series = await prisma.series.findUnique({
      where: { id: key.seriesId },
      select: { name: true },
    });
    if (!series) continue;
    // Bounded recipients: only viewers actively tracking this series.
    const trackers = await prisma.seriesProgress.findMany({
      where: { seriesId: key.seriesId, status: { in: ["WATCHING", "REWATCHING"] } },
      select: { userId: true },
    });
    for (const t of trackers) {
      const wrote = await notifyEpisodeDrop({
        recipientId: t.userId,
        seriesId: key.seriesId,
        seriesTitle: series.name,
        seasonNumber: key.seasonNumber,
        url: `/series/${key.seriesId}/discussions`,
      });
      if (wrote) notified++;
    }
  }

  console.log(`✅ Episode-drop run complete — ${notified} notifications written.`);
  await prisma.$disconnect();
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
