/**
 * Site-wide spoiler gate (spec §5: "spoiler gate is a site-wide capability,
 * not a comments feature"). Spec §4.2 predicate, status-aware:
 *   visible ⇔ scope=NONE
 *     OR progress.status=COMPLETED
 *     OR (scopeSeason, scopeEpisode) <= (maxSeasonNumber, maxEpisodeNumber)
 *   movie-side: WATCHED|ENDING visible ⇔ watch_events EXISTS ([userId, movieId] index)
 *
 * Known accepted limitation (spec): high-watermark over-permits sparse/
 * out-of-order watchers; season-0 specials gate as "before S1E1".
 */
import type { Prisma } from "@/server/db/postgres";
import { prisma } from "@/server/db/postgres";
import type { DiscussionAnchor, SpoilerScopeValue } from "./comment-schemas";

export interface ViewerGateContext {
  loggedIn: boolean;
  /** movie anchors: at least one watch_events row for (user, movie) */
  movieWatched: boolean;
  /** series anchors: series_progress.status === COMPLETED */
  seriesCompleted: boolean;
  /** series anchors: lifetime high watermark (NEVER the current-cycle pointer) */
  maxSeason: number | null;
  maxEpisode: number | null;
}

export const ANON_GATE_CONTEXT: ViewerGateContext = {
  loggedIn: false,
  movieWatched: false,
  seriesCompleted: false,
  maxSeason: null,
  maxEpisode: null,
};

/** One cheap lookup per render: PK read (series) or index EXISTS (movie). */
export async function getViewerGateContext(
  userId: number | null,
  anchor: DiscussionAnchor
): Promise<ViewerGateContext> {
  if (!userId) return ANON_GATE_CONTEXT;
  if (anchor.type === "movie") {
    const watched = await prisma.watchEvent.findFirst({
      where: { userId, movieId: anchor.movieId },
      select: { id: true },
    });
    return { ...ANON_GATE_CONTEXT, loggedIn: true, movieWatched: watched !== null };
  }
  const progress = await prisma.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId: anchor.seriesId } },
    select: { status: true, maxSeasonNumber: true, maxEpisodeNumber: true },
  });
  return {
    loggedIn: true,
    movieWatched: false,
    seriesCompleted: progress?.status === "COMPLETED",
    maxSeason: progress?.maxSeasonNumber ?? null,
    maxEpisode: progress?.maxEpisodeNumber ?? null,
  };
}

/** Pure predicate — usable anywhere (summaries, notification previews, AI chat). */
export function isScopeVisible(
  scope: SpoilerScopeValue,
  scopeSeason: number | null,
  scopeEpisode: number | null,
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): boolean {
  if (scope === "NONE") return true;
  if (anchorKind === "movie") return ctx.movieWatched;
  if (ctx.seriesCompleted) return true;
  if (scope === "WATCHED" || scope === "ENDING") return false;
  // EPISODE: tuple compare against lifetime watermark; fail closed on nulls.
  if (scopeSeason === null || ctx.maxSeason === null) return false;
  if (scopeSeason < ctx.maxSeason) return true;
  if (scopeSeason > ctx.maxSeason) return false;
  return (scopeEpisode ?? 1) <= (ctx.maxEpisode ?? 0);
}

/**
 * The same predicate as a Prisma where-clause so gated pagination runs in SQL
 * (residual filter on the anchor's ordered index — verified read path in spec).
 */
export function visibleScopeWhere(
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): Prisma.CommentWhereInput {
  const branches: Prisma.CommentWhereInput[] = [{ spoilerScope: "NONE" }];
  const fullAccess = anchorKind === "movie" ? ctx.movieWatched : ctx.seriesCompleted;
  if (fullAccess) {
    branches.push({ spoilerScope: { in: ["WATCHED", "EPISODE", "ENDING"] } });
  } else if (anchorKind === "series" && ctx.maxSeason !== null) {
    branches.push({
      spoilerScope: "EPISODE",
      OR: [
        { scopeSeason: { lt: ctx.maxSeason } },
        { scopeSeason: ctx.maxSeason, scopeEpisode: { lte: ctx.maxEpisode ?? 0 } },
      ],
    });
  }
  return { OR: branches };
}

const SCOPE_RANKS: Record<SpoilerScopeValue, number> = {
  NONE: 0,
  EPISODE: 1,
  WATCHED: 2,
  ENDING: 3,
};

export function scopeRank(scope: SpoilerScopeValue): number {
  return SCOPE_RANKS[scope];
}

/** Is the AI-suggested scope stricter than what the user chose? */
export function isStricterScope(
  suggested: SpoilerScopeValue,
  suggestedSeason: number | null,
  suggestedEpisode: number | null,
  chosen: SpoilerScopeValue,
  chosenSeason: number | null,
  chosenEpisode: number | null
): boolean {
  if (scopeRank(suggested) !== scopeRank(chosen)) {
    return scopeRank(suggested) > scopeRank(chosen);
  }
  if (suggested !== "EPISODE") return false;
  const s1 = suggestedSeason ?? 0;
  const s2 = chosenSeason ?? 0;
  if (s1 !== s2) return s1 > s2;
  return (suggestedEpisode ?? 0) > (chosenEpisode ?? 0);
}

/** Viewer bucket for the thread-summary cache key. */
export function scopeKeyFor(ctx: ViewerGateContext, anchorKind: "movie" | "series"): string {
  if (anchorKind === "movie") return ctx.movieWatched ? "watched" : "none";
  if (ctx.seriesCompleted) return "completed";
  if (ctx.maxSeason !== null) return `s${ctx.maxSeason}e${ctx.maxEpisode ?? 0}`;
  return "none";
}
