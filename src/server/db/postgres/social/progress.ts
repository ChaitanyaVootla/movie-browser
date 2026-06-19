/**
 * Materialized series progress (one row per user+series).
 *
 * recomputeSeriesProgress is TRANSACTIONAL with event writes and runs ONCE
 * per batch (spec mandate: 300-episode mark = 1 action, 1 recompute).
 * Index-only aggregate over one user's rows for one series (~ms at soap scale).
 */
import { Prisma, type WatchStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { deriveProgress } from "./progress-derive";
import { markStatsDirty } from "./stats-dirty";

const ENDED_STATUSES = new Set(["Ended", "Canceled"]);

/** Accepts a transaction client OR the root prisma client (structurally compatible). */
export async function recomputeSeriesProgress(
  tx: Prisma.TransactionClient,
  userId: number,
  seriesId: number
): Promise<void> {
  const [events, series, airedEpisodes, existing] = await Promise.all([
    tx.watchEvent.findMany({
      where: { userId, seriesId, kind: "WATCH" },
      select: { seasonNumber: true, episodeNumber: true, watchedAt: true, createdAt: true },
    }),
    tx.series.findUnique({ where: { id: seriesId }, select: { status: true } }),
    tx.episode.count({
      where: {
        airDate: { lte: new Date() },
        season: { seriesId, seasonNumber: { gt: 0 } },
      },
    }),
    tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { status: true, statusIsManual: true, rewatchStartedAt: true },
    }),
  ]);

  const derived = deriveProgress(
    events,
    { airedEpisodes, isEnded: ENDED_STATUSES.has(series?.status ?? "") },
    existing?.rewatchStartedAt ?? null,
    existing?.statusIsManual ? existing.status : null
  );

  if (derived.empty) {
    await tx.seriesProgress.deleteMany({ where: { userId, seriesId } });
    return;
  }

  const fields = {
    status: derived.status,
    lastSeasonNumber: derived.lastSeasonNumber,
    lastEpisodeNumber: derived.lastEpisodeNumber,
    episodesWatched: derived.episodesWatched,
    maxSeasonNumber: derived.maxSeasonNumber,
    maxEpisodeNumber: derived.maxEpisodeNumber,
  };
  await tx.seriesProgress.upsert({
    where: { userId_seriesId: { userId, seriesId } },
    create: { userId, seriesId, ...fields },
    update: fields,
  });

  // Trakt-style: once a series has real watch progress it's no longer "want to
  // watch" — drop it from the watchlist so the watchlist stays pure intent.
  // (Only fires when progress is non-empty, i.e. there ARE WATCH events; a
  // NOTE-only series never reaches here, so noting a to-watch show is safe.)
  await tx.watchlistItem.deleteMany({ where: { userId, seriesId } });
}

/**
 * "Reset to rewatch": Trakt reset_at semantics. NEVER deletes events.
 */
export async function resetToRewatch(userId: number, seriesId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.seriesProgress.upsert({
      where: { userId_seriesId: { userId, seriesId } },
      create: {
        userId,
        seriesId,
        status: "REWATCHING",
        rewatchStartedAt: new Date(),
        rewatchCount: 1,
      },
      update: {
        rewatchStartedAt: new Date(),
        rewatchCount: { increment: 1 },
        status: "REWATCHING",
        statusIsManual: false,
      },
    });
    await recomputeSeriesProgress(tx, userId, seriesId);
  });
}

/**
 * Manual status override (DROPPED / PAUSED / any). `null` clears the override
 * and recomputes the derived status.
 */
export async function setManualStatus(
  userId: number,
  seriesId: number,
  status: WatchStatus | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (status === null) {
      await tx.seriesProgress.updateMany({
        where: { userId, seriesId },
        data: { statusIsManual: false },
      });
    } else {
      await tx.seriesProgress.upsert({
        where: { userId_seriesId: { userId, seriesId } },
        create: { userId, seriesId, status, statusIsManual: true },
        update: { status, statusIsManual: true },
      });
    }
    await recomputeSeriesProgress(tx, userId, seriesId);
  });
}

export interface ProgressShelfItem {
  seriesId: number;
  status: WatchStatus;
  lastSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  episodesWatched: number;
  updatedAt: Date;
  name: string | null;
  posterPath: string | null;
}

/** Shelf query for Up Next / profile "currently watching" (data-only; UI is a later plan). */
export async function getProgressShelf(
  userId: number,
  statuses: WatchStatus[],
  limit = 20
): Promise<ProgressShelfItem[]> {
  const rows = await prisma.seriesProgress.findMany({
    where: { userId, status: { in: statuses } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { series: { select: { name: true, posterPath: true } } },
  });
  return rows.map((r) => ({
    seriesId: r.seriesId,
    status: r.status,
    lastSeasonNumber: r.lastSeasonNumber,
    lastEpisodeNumber: r.lastEpisodeNumber,
    episodesWatched: r.episodesWatched,
    updatedAt: r.updatedAt,
    name: r.series.name,
    posterPath: r.series.posterPath,
  }));
}

export async function getSeriesProgress(userId: number, seriesId: number) {
  return prisma.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  });
}

export { markStatsDirty };
