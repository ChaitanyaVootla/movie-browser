/**
 * ImportJob execution. Fire-and-forget after the action creates the job
 * (triggerProgressiveEnrichment style). Row-level stats; app-level dedupe
 * within the run on (titleKey, watchedAt, isRewatch) — NO unique constraints
 * on events (two same-day watches are legit); skips recorded in stats.
 * ONE progress recompute per affected series, at the end.
 */
import pLimit from "p-limit";
import { Prisma, type ImportSource } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { dateOnlyToUtc } from "@/lib/watch-dates";
import { strFromU8, unzipSync } from "fflate";
import { gateText } from "@/server/services/moderation/gate";
import { recomputeSeriesProgress } from "@/server/db/postgres/social/progress";
import { markStatsDirty } from "@/server/db/postgres/social/stats-dirty";
import { setUserRating } from "@/server/db/postgres/social/ratings";
import { upsertUserReview, setReviewGateResult } from "@/server/db/postgres/social/reviews";
import { createList, addListItem } from "@/server/db/postgres/social/lists";
import { importFileStorage } from "./storage";
import { parseLetterboxdExport } from "./letterboxd";
import { parseTraktExport } from "./trakt";
import { parseImdbRatings } from "./imdb";
import type { ImportStats, NormalizedImport, NormalizedWatch, TitleRef } from "./types";
import { EpisodeResolver, TitleResolver, type ResolvedTitle } from "./resolve";

const INSERT_CHUNK = 500;
const GATE_CONCURRENCY = 2;

export async function createImportJob(
  userId: number,
  source: ImportSource,
  fileRef: string
): Promise<number> {
  const job = await prisma.importJob.create({
    data: { userId, source, fileRef },
    select: { id: true },
  });
  // Fire-and-forget (triggerProgressiveEnrichment style) — errors land on the job row.
  void runImportJob(job.id).catch((error: unknown) => {
    dataLogger.error({
      service: "import",
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return job.id;
}

function extractFiles(source: ImportSource, buffer: Buffer): Map<string, string> {
  const isZip = buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  if (!isZip) {
    const text = buffer.toString("utf8");
    if (source === "IMDB") return new Map([["ratings.csv", text]]);
    if (source === "TRAKT") return new Map([["history.json", text]]);
    return new Map([["diary.csv", text]]);
  }
  const unzipped = unzipSync(new Uint8Array(buffer));
  const files = new Map<string, string>();
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue;
    // Strip a single top-level export folder if present.
    const normalized = path.replace(/^[^/]*letterboxd[^/]*\//i, "");
    files.set(normalized, strFromU8(data));
  }
  return files;
}

function parseBySource(source: ImportSource, files: Map<string, string>): NormalizedImport {
  if (source === "LETTERBOXD") return parseLetterboxdExport(files);
  if (source === "TRAKT") return parseTraktExport(files);
  const csv = files.get("ratings.csv") ?? [...files.values()][0] ?? "";
  return parseImdbRatings(csv);
}

function titleKey(r: ResolvedTitle): string {
  return `${r.kind}:${r.id}`;
}

/** Key matches the stored-row key exactly (ISO of the COMPUTED Date, since
 *  DATE-precision strings become 12:00-UTC datetimes on insert). */
function watchDedupeKey(
  r: ResolvedTitle,
  seasonNumber: number | null,
  episodeNumber: number | null,
  watchedAt: Date | null,
  isRewatch: boolean
): string {
  const ep = seasonNumber !== null ? `:${seasonNumber}:${episodeNumber}` : "";
  return `${titleKey(r)}${ep}|${watchedAt?.toISOString() ?? "null"}|${isRewatch}`;
}

export async function runImportJob(jobId: number): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "PENDING") return;
  await prisma.importJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

  const stats: ImportStats = { rowsTotal: 0, imported: 0, skipped: 0, errors: [] };
  try {
    const buffer = await importFileStorage.load(job.fileRef);
    const parsed = parseBySource(job.source, extractFiles(job.source, buffer));
    stats.rowsTotal =
      parsed.watches.length +
      parsed.ratings.length +
      parsed.reviews.length +
      parsed.watchlist.length +
      parsed.lists.reduce((n, l) => n + l.items.length, 0) +
      parsed.unmappable.length;
    for (const u of parsed.unmappable.slice(0, 200)) {
      stats.errors.push(`${u.file}:${u.line} ${u.reason}`);
    }
    stats.skipped += parsed.unmappable.length;

    const resolver = new TitleResolver();
    const allRefs: TitleRef[] = [
      ...parsed.watches.map((w) => w.ref),
      ...parsed.ratings.map((r) => r.ref),
      ...parsed.reviews.map((r) => r.ref),
      ...parsed.watchlist.map((w) => w.ref),
      ...parsed.lists.flatMap((l) => l.items.map((i) => i.ref)),
    ];
    await resolver.prime(allRefs);

    const skipUnresolved = (ref: TitleRef, what: string): ResolvedTitle | null => {
      const resolved = resolver.resolve(ref);
      if (!resolved) {
        stats.skipped += 1;
        if (stats.errors.length < 500) {
          stats.errors.push(`${what} "${ref.title ?? ref.imdbId ?? ref.tmdbId}" not in catalog`);
        }
      }
      return resolved;
    };

    // ---- watches -----------------------------------------------------------
    const episodeResolver = new EpisodeResolver();
    const seriesIdsInRun = new Set<number>();
    type Row = Prisma.WatchEventCreateManyInput;
    const rows: Row[] = [];
    const seen = new Set<string>();

    // Cross-run idempotency: skip exact duplicates of prior IMPORT events.
    const existing = await prisma.watchEvent.findMany({
      where: { userId: job.userId, source: "IMPORT" },
      select: {
        movieId: true,
        seriesId: true,
        seasonNumber: true,
        episodeNumber: true,
        watchedAt: true,
        isRewatch: true,
      },
    });
    for (const e of existing) {
      const key = `${e.movieId !== null ? `movie:${e.movieId}` : `series:${e.seriesId}`}${
        e.seasonNumber !== null ? `:${e.seasonNumber}:${e.episodeNumber}` : ""
      }|${e.watchedAt?.toISOString() ?? "null"}|${e.isRewatch}`;
      seen.add(key);
    }

    const preResolve = parsed.watches
      .map((w) => ({ w, resolved: resolver.resolve(w.ref) }))
      .filter((x): x is { w: NormalizedWatch; resolved: ResolvedTitle } => x.resolved !== null);
    await episodeResolver.prime([
      ...new Set(preResolve.filter((x) => x.resolved.kind === "series").map((x) => x.resolved.id)),
    ]);

    for (const w of parsed.watches) {
      const resolved = skipUnresolved(w.ref, "watch");
      if (!resolved) continue;

      let watchedAt: Date | null = null;
      if (w.watchedAt !== null) {
        watchedAt = w.precision === "DATE" ? dateOnlyToUtc(w.watchedAt) : new Date(w.watchedAt);
      }
      const row: Row = {
        userId: job.userId,
        movieId: resolved.kind === "movie" ? resolved.id : null,
        seriesId: resolved.kind === "series" ? resolved.id : null,
        mediaType: resolved.kind === "movie" ? "MOVIE" : "SERIES",
        seasonNumber: null,
        episodeNumber: null,
        tmdbEpisodeId: null,
        watchedAt,
        watchedAtPrecision: w.precision,
        isRewatch: w.isRewatch,
        tags: w.tags,
        note: w.note,
        source: "IMPORT",
      };
      if (resolved.kind === "series" && w.episode) {
        const ep = episodeResolver.resolve(resolved.id, w.episode);
        if (ep) {
          row.seasonNumber = ep.seasonNumber;
          row.episodeNumber = ep.episodeNumber;
          row.tmdbEpisodeId = ep.tmdbEpisodeId;
        }
      }
      const key = watchDedupeKey(
        resolved,
        row.seasonNumber ?? null,
        row.episodeNumber ?? null,
        watchedAt,
        w.isRewatch
      );
      if (seen.has(key)) {
        stats.skipped += 1;
        continue;
      }
      seen.add(key);
      if (resolved.kind === "series") seriesIdsInRun.add(resolved.id);
      rows.push(row);
    }

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      await prisma.watchEvent.createMany({ data: chunk });
      stats.imported += chunk.length;
    }

    // ONE recompute per affected series (spec mandate).
    for (const seriesId of seriesIdsInRun) {
      await prisma.$transaction((tx) => recomputeSeriesProgress(tx, job.userId, seriesId));
    }

    // ---- ratings (merge thumb+score per title) ------------------------------
    for (const r of parsed.ratings) {
      const resolved = skipUnresolved(r.ref, "rating");
      if (!resolved) continue;
      await setUserRating(job.userId, {
        itemId: resolved.id,
        itemType: resolved.kind,
        ...(r.score !== null ? { score: r.score } : {}),
        ...(r.thumb !== null ? { thumb: r.thumb } : {}),
        ratedAt: r.ratedAt !== null ? dateOnlyToUtc(r.ratedAt) : undefined,
      });
      stats.imported += 1;
    }

    // ---- reviews: stored PENDING_REVIEW, gated lazily afterwards ------------
    const reviewIds: number[] = [];
    for (const review of parsed.reviews) {
      const resolved = skipUnresolved(review.ref, "review");
      if (!resolved) continue;
      const { id } = await upsertUserReview(job.userId, {
        ...(resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id }),
        body: review.body,
        title: null,
        spoilerScope: review.containsSpoilers ? "WATCHED" : "NONE",
        scopeSeason: null,
        scopeEpisode: null,
        scopeTmdbEpisodeId: null,
        images: undefined,
        isPrivate: false,
        status: "PENDING_REVIEW",
      });
      reviewIds.push(id);
      stats.imported += 1;
    }

    // ---- watchlist -----------------------------------------------------------
    for (const item of parsed.watchlist) {
      const resolved = skipUnresolved(item.ref, "watchlist item");
      if (!resolved) continue;
      const anchor =
        resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id };
      const where =
        resolved.kind === "movie"
          ? { userId_movieId: { userId: job.userId, movieId: resolved.id } }
          : { userId_seriesId: { userId: job.userId, seriesId: resolved.id } };
      await prisma.watchlistItem.upsert({
        where,
        create: {
          userId: job.userId,
          ...anchor,
          note: item.note,
          addedAt: item.addedAt !== null ? dateOnlyToUtc(item.addedAt) : new Date(),
        },
        update: { note: item.note ?? undefined },
      });
      stats.imported += 1;
    }

    // ---- lists ---------------------------------------------------------------
    for (const list of parsed.lists) {
      const created = await createList(job.userId, {
        name: list.name,
        description: list.description,
        isRanked: true,
      });
      for (const item of [...list.items].sort((a, b) => a.position - b.position)) {
        const resolved = skipUnresolved(item.ref, `list "${list.name}" item`);
        if (!resolved) continue;
        try {
          await addListItem(
            job.userId,
            created.id,
            resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id }
          );
          stats.imported += 1;
        } catch {
          stats.skipped += 1; // duplicate within the source list
        }
      }
    }

    await prisma.$transaction((tx) => markStatsDirty(tx, job.userId));
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });

    // Lazy AI-gate pass over imported reviews — fire-and-forget; failures stay
    // PENDING_REVIEW (fail-open, never silent-publish).
    if (reviewIds.length > 0) {
      void gateImportedReviews(reviewIds).catch(() => {});
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stats.errors.push(message);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });
    dataLogger.error({ service: "import", jobId, error: message });
  }
}

async function gateImportedReviews(reviewIds: number[]): Promise<void> {
  const limit = pLimit(GATE_CONCURRENCY);
  await Promise.all(
    reviewIds.map((id) =>
      limit(async () => {
        const review = await prisma.userReview.findUnique({
          where: { id },
          select: {
            body: true,
            movie: { select: { title: true } },
            series: { select: { name: true } },
          },
        });
        if (!review) return;
        const gate = await gateText(review.body, {
          title: review.movie?.title ?? review.series?.name ?? undefined,
        });
        await setReviewGateResult(id, gate.status, gate.aiLabels);
      })
    )
  );
}
