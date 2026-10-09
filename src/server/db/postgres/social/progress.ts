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

/**
 * PUBLIC shelf for the ISR-cached profile: only series with at least one
 * PUBLIC WATCH event, positioned at the furthest PUBLIC episode and counting
 * public episodes only. A series watched only privately never appears, and a
 * private binge never advances the shown position. (The owner's own shelf —
 * getProgressShelf — stays unfiltered.)
 */
export async function getPublicProgressShelf(
  userId: number,
  statuses: WatchStatus[],
  limit = 20
): Promise<ProgressShelfItem[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      series_id: number;
      status: WatchStatus;
      season_number: number | null;
      episode_number: number | null;
      episodes: number;
      updated_at: Date;
      name: string | null;
      poster_path: string | null;
    }>
  >`
    SELECT sp.series_id, sp.status, pub.season_number, pub.episode_number, pub.episodes,
           sp.updated_at, s.name, s.poster_path
    FROM series_progress sp
    JOIN series s ON s.id = sp.series_id
    JOIN LATERAL (
      SELECT (array_agg(we.season_number ORDER BY we.season_number DESC NULLS LAST, we.episode_number DESC NULLS LAST))[1] AS season_number,
             (array_agg(we.episode_number ORDER BY we.season_number DESC NULLS LAST, we.episode_number DESC NULLS LAST))[1] AS episode_number,
             count(*) FILTER (WHERE we.episode_number IS NOT NULL)::int AS episodes,
             count(*)::int AS n
      FROM watch_events we
      WHERE we.user_id = sp.user_id AND we.series_id = sp.series_id
        AND we.kind = 'WATCH' AND we.is_private = false
    ) pub ON pub.n > 0
    WHERE sp.user_id = ${userId} AND sp.status::text = ANY(${statuses}::text[])
    ORDER BY sp.updated_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    seriesId: r.series_id,
    status: r.status,
    lastSeasonNumber: r.season_number,
    lastEpisodeNumber: r.episode_number,
    episodesWatched: Number(r.episodes),
    updatedAt: r.updated_at,
    name: r.name,
    posterPath: r.poster_path,
  }));
}

export async function getSeriesProgress(userId: number, seriesId: number) {
  return prisma.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  });
}

export { markStatsDirty };
