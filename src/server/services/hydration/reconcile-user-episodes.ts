/**
 * Post-hydration renumbering reconcile (spec §4.1 invariant 2), in the style
 * of triggerProgressiveEnrichment: fire-and-forget, deduped per series,
 * errors swallowed (logged).
 *
 * For the hydrated series: where a user row's tmdb_episode_id now maps to an
 * episode whose (season_number, episode_number) disagrees, update the
 * natural-key columns and re-run that user's progress recompute once.
 */
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { recomputeSeriesProgress } from "@/server/db/postgres/social/progress";

const inFlight = new Set<number>();

export function triggerUserEpisodeReconcile(seriesId: number): void {
  if (inFlight.has(seriesId)) return;
  inFlight.add(seriesId);
  void reconcile(seriesId)
    .catch((error: unknown) => {
      dataLogger.error({
        service: "episode-reconcile",
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      inFlight.delete(seriesId);
    });
}

async function reconcile(seriesId: number): Promise<void> {
  const drifted = await prisma.$queryRaw<
    Array<{ id: number; user_id: number; season_number: number; episode_number: number }>
  >`
    SELECT we.id, we.user_id, s.season_number, e.episode_number
    FROM watch_events we
    JOIN seasons s ON s.series_id = we.series_id
    JOIN episodes e ON e.season_id = s.id AND e.tmdb_episode_id = we.tmdb_episode_id
    WHERE we.series_id = ${seriesId}
      AND we.tmdb_episode_id IS NOT NULL
      AND (we.season_number IS DISTINCT FROM s.season_number
        OR we.episode_number IS DISTINCT FROM e.episode_number)
  `;
  if (drifted.length === 0) return;

  const userIds = new Set<number>();
  for (const row of drifted) {
    await prisma.watchEvent.update({
      where: { id: row.id },
      data: { seasonNumber: row.season_number, episodeNumber: row.episode_number },
    });
    userIds.add(row.user_id);
  }
  for (const userId of userIds) {
    await prisma.$transaction((tx) => recomputeSeriesProgress(tx, userId, seriesId));
  }
  dataLogger.info({
    service: "episode-reconcile",
    seriesId,
    rows: drifted.length,
    users: userIds.size,
  });
}
