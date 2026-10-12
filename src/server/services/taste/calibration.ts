/**
 * Calibration deck service (taste v2 spec 2026-10-12 §3.6). Answers write REAL
 * signals through the existing rating write path (`setUserRating` inside
 * `auditedTransaction` — audit actor + markStatsDirty/taste dirty for free);
 * "Haven't seen it" writes a 90-day rec_feedback SKIP. No watch events are
 * created: the user rated a title they know, they did not log a viewing.
 * Never throws.
 */
import { MIN_POSITIVES_FOR_CENTROID } from "@/lib/taste/constants";
import {
  answerToRating,
  CALIBRATION_DECK_SIZE,
  dayStamp,
  hashSeed,
  pickCalibrationDeck,
} from "@/lib/taste/calibration";
import { seededRandom } from "@/lib/taste/tune-filter";
import type { RecCandidate } from "@/lib/taste/recommend";
import type {
  CalibrationDeckDTO,
  CalibrationItemDTO,
  CalibrationMode,
  CalibrationSubmitInput,
  CalibrationSubmitResult,
} from "@/lib/taste/recommend-types";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import { setUserRating } from "@/server/db/postgres/social/ratings";
import { fetchCalibrationCandidates } from "@/server/db/postgres/social/calibration";
import { fetchActiveSkips, upsertRecFeedback } from "@/server/db/postgres/social/rec-feedback";
import { fetchRecExclusions } from "@/server/db/postgres/social/taste-recs";
import { dataLogger } from "@/lib/logger";
import { getTasteProfile } from "./index";
import { evictRecsCache, getRecPoolForUser } from "./recommend";

/** Vote floors tried in order until the deck fills (dev DBs have few well-known titles). */
const VOTE_FLOORS = [1000, 200, 0] as const;
/** Sharpen mode: the uncertain middle of the pool, where an answer moves the ranking most. */
const SHARPEN_RANKS = { from: 40, to: 120 } as const;

function toDeckItem(c: RecCandidate): CalibrationItemDTO {
  return {
    mediaType: c.mediaType,
    id: c.id,
    title: c.title,
    year: c.year ?? (c.releaseDate ? Number(c.releaseDate.slice(0, 4)) : null),
    posterPath: c.posterPath,
    genres: c.genres.slice(0, 2),
  };
}

async function startDeck(userId: number, now: Date): Promise<CalibrationItemDTO[]> {
  const [ex, skips] = await Promise.all([fetchRecExclusions(userId), fetchActiveSkips(userId)]);
  const movieEx = [...ex.movieIds, ...skips.movieIds];
  const seriesEx = [...ex.seriesIds, ...skips.seriesIds];
  const seed = hashSeed(`${userId}:${dayStamp(now)}`);
  let best: RecCandidate[] = [];
  for (const minVotes of VOTE_FLOORS) {
    const [movies, series] = await Promise.all([
      fetchCalibrationCandidates("movies", { excludeIds: movieEx, minVotes, limit: 80 }),
      fetchCalibrationCandidates("series", { excludeIds: seriesEx, minVotes: Math.floor(minVotes / 2), limit: 40 }),
    ]);
    best = pickCalibrationDeck(movies, series, seed);
    if (best.length >= CALIBRATION_DECK_SIZE) break;
  }
  return best.map(toDeckItem);
}

async function sharpenDeck(userId: number, now: Date): Promise<CalibrationItemDTO[] | null> {
  const [pool, ex, skips] = await Promise.all([
    getRecPoolForUser(userId),
    fetchRecExclusions(userId),
    fetchActiveSkips(userId),
  ]);
  if (!pool) return null;
  // The pool may be a cache hit from before a rating / dismissal, and SKIPs are
  // a deck-only exclusion the recs pool never applies — filter both first.
  const banned = new Set([
    ...[...ex.movieIds, ...skips.movieIds].map((id) => `m:${id}`),
    ...[...ex.seriesIds, ...skips.seriesIds].map((id) => `s:${id}`),
  ]);
  const middle = pool.scored
    .filter((c) => !banned.has(c.key))
    .slice(SHARPEN_RANKS.from, SHARPEN_RANKS.to);
  if (middle.length < 4) return null;
  const rand = seededRandom(hashSeed(`${userId}:${dayStamp(now)}:sharpen`));
  return [...middle]
    .map((c) => ({ c, r: rand() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, CALIBRATION_DECK_SIZE)
    .map(({ c }) => toDeckItem(c));
}

/** The deck (≤ 12 titles). Sharpen falls back to a start deck without a pool. */
export async function getCalibrationDeckFor(
  userId: number,
  mode: CalibrationMode,
  now = new Date()
): Promise<CalibrationDeckDTO> {
  try {
    const items = (mode === "sharpen" ? await sharpenDeck(userId, now) : null) ?? (await startDeck(userId, now));
    return { items };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.calibration_deck_failed",
      userId,
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
    return { items: [] };
  }
}

/** Existing catalog ids among the answers (an unknown id would abort the whole rating transaction). */
async function existingKeys(answers: CalibrationSubmitInput["answers"]): Promise<Set<string>> {
  const movieIds = answers.filter((a) => a.mediaType === "movie").map((a) => a.id);
  const seriesIds = answers.filter((a) => a.mediaType === "series").map((a) => a.id);
  const [m, s] = await Promise.all([
    movieIds.length ? prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true } }) : [],
    seriesIds.length ? prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true } }) : [],
  ]);
  return new Set([...m.map((r) => `movie:${r.id}`), ...s.map((r) => `series:${r.id}`)]);
}

/**
 * Write the answers, then read the (recomputed) FULL profile for the positive
 * count. `ready` = enough positives for the For-you row.
 */
export async function submitCalibrationFor(
  userId: number,
  input: CalibrationSubmitInput
): Promise<CalibrationSubmitResult> {
  try {
    const known = await existingKeys(input.answers);
    const answers = input.answers.filter((a) => known.has(`${a.mediaType}:${a.id}`));
    const ratings = answers.flatMap((a) => {
      const r = answerToRating(a.answer);
      return r ? [{ a, r }] : [];
    });
    if (ratings.length) {
      await auditedTransaction(userId, async (tx) => {
        for (const { a, r } of ratings) {
          await setUserRating(userId, { itemId: a.id, itemType: a.mediaType, ...r }, tx);
        }
      });
    }
    for (const a of answers) {
      if (a.answer !== "skip") continue;
      await upsertRecFeedback({ userId, mediaType: a.mediaType, id: a.id, kind: "SKIP", rowId: "calibration", source: "ui" });
    }
    evictRecsCache(userId);
    // setUserRating marked the taste row dirty in-transaction; this read
    // recomputes it (deduped, bounded wait) so the count is current.
    const positives = (await getTasteProfile(userId, { scope: "full" }))?.positiveCount ?? 0;
    return { positives, ready: positives >= MIN_POSITIVES_FOR_CENTROID };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.calibration_submit_failed",
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { positives: 0, ready: false };
  }
}
