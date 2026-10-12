/**
 * `rec_feedback` SQL (taste v2 spec 2026-10-12 §6.1). DISMISS = "Not for me"
 * on a recommendation (forever, until undone); SKIP = calibration "Haven't seen
 * it" (expires after 90 days). Undo = DELETE. Not audited: a preference signal,
 * high churn, no moderation value. One row per (user, title, kind) — the
 * NULLS NOT DISTINCT unique index in 04-ugc-constraints.sql.
 */
import { prisma } from "@/server/db/postgres";
import type { RecFeedbackKindDTO, RecFeedbackSource } from "@/lib/taste/recommend-types";
import type { TasteMediaType } from "@/lib/taste/types";

/** How long a calibration SKIP keeps a title out of the deck. */
export const SKIP_TTL_DAYS = 90;

export interface RecFeedbackWrite {
  userId: number;
  mediaType: TasteMediaType;
  id: number;
  kind: RecFeedbackKindDTO;
  rowId?: string | null;
  anchorKey?: string | null;
  source: RecFeedbackSource;
}

/**
 * Insert or refresh one feedback row. Returns false when the title does not
 * exist in the catalog (FK) — the caller reports it, nothing is written.
 */
export async function upsertRecFeedback(w: RecFeedbackWrite): Promise<boolean> {
  const isMovie = w.mediaType === "movie";
  const expiresAt = w.kind === "SKIP" ? new Date(Date.now() + SKIP_TTL_DAYS * 86_400_000) : null;
  const exists = isMovie
    ? await prisma.movie.count({ where: { id: w.id } })
    : await prisma.series.count({ where: { id: w.id } });
  if (exists === 0) return false;
  await prisma.$executeRaw`
    INSERT INTO rec_feedback (user_id, media_type, movie_id, series_id, kind, row_id, anchor_key, source, expires_at)
    VALUES (${w.userId}, ${isMovie ? "MOVIE" : "SERIES"}::"MediaType",
            ${isMovie ? w.id : null}::int, ${isMovie ? null : w.id}::int,
            ${w.kind}::"RecFeedbackKind", ${w.rowId ?? null}, ${w.anchorKey ?? null}, ${w.source}, ${expiresAt})
    ON CONFLICT (user_id, media_type, movie_id, series_id, kind)
    DO UPDATE SET created_at = CURRENT_TIMESTAMP, row_id = EXCLUDED.row_id,
                  anchor_key = EXCLUDED.anchor_key, source = EXCLUDED.source, expires_at = EXCLUDED.expires_at`;
  return true;
}

/** Undo: delete the (user, title, kind) row. Returns the number of rows removed. */
export async function deleteRecFeedback(
  userId: number,
  mediaType: TasteMediaType,
  id: number,
  kind: RecFeedbackKindDTO
): Promise<number> {
  const res = await prisma.recFeedback.deleteMany({
    where: { userId, kind, ...(mediaType === "movie" ? { movieId: id } : { seriesId: id }) },
  });
  return res.count;
}

/** DISMISS rows (title + when) — taste signals (W_DISMISS) and rec exclusions. Bounded. */
export async function fetchDismissals(
  userId: number,
  limit = 1000
): Promise<Array<{ movieId: number | null; seriesId: number | null; createdAt: Date }>> {
  return prisma.recFeedback.findMany({
    where: { userId, kind: "DISMISS" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { movieId: true, seriesId: true, createdAt: true },
  });
}

/** Unexpired calibration SKIPs (deck exclusions only — skips never exclude from recs). */
export async function fetchActiveSkips(userId: number): Promise<{ movieIds: number[]; seriesIds: number[] }> {
  const rows = await prisma.recFeedback.findMany({
    where: { userId, kind: "SKIP", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { movieId: true, seriesId: true },
    take: 2000,
  });
  return {
    movieIds: rows.flatMap((r) => (r.movieId != null ? [r.movieId] : [])),
    seriesIds: rows.flatMap((r) => (r.seriesId != null ? [r.seriesId] : [])),
  };
}
