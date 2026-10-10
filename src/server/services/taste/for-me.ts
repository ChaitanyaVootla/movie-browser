/**
 * Taste-aware re-rank for Cue's `smart_discover` (`forMe: true`), spec
 * docs/superpowers/specs/2026-10-10-taste-vector-upgrades.md §4.
 *
 * "A dark thriller I'd like" = the query's candidate pool, re-ranked by
 *   0.65 · mm(query similarity) + 0.35 · mm(centered taste similarity)
 * against the user's FULL-scope centroid (the user's own chat, so private
 * signals are fine — the output is shown only to them). Exclusions (watched,
 * watchlisted, rated, in progress) are applied by the caller via
 * `getForMeExclusions` before retrieval. Never throws.
 */
import { blendQueryTaste, FOR_ME_QUERY_WEIGHT } from "@/lib/taste/rerank";
import { RAW_SPACE } from "@/lib/taste/space";
import { dot, l2Normalize } from "@/lib/taste/vector";
import { titleKey, type TasteMediaType } from "@/lib/taste/types";
import { fetchTitleEmbeddings } from "@/server/db/postgres/social/taste";
import { fetchRecExclusions } from "@/server/db/postgres/social/taste-recs";
import { dataLogger } from "@/lib/logger";
import { getTasteSpace, getTasteVectors } from "./index";

export type ForMeStatus = "applied" | "no_profile" | "error";

/** Ids of `mediaType` the user already engaged with (never suggest them "for me"). */
export async function getForMeExclusions(userId: number, mediaType: TasteMediaType): Promise<number[]> {
  try {
    const ex = await fetchRecExclusions(userId);
    return mediaType === "movie" ? ex.movieIds : ex.seriesIds;
  } catch {
    return [];
  }
}

/**
 * Re-rank `items` (best query match first, with an optional query similarity)
 * by the blend; returns the top `limit`. Without a taste centroid the query
 * order is kept (`no_profile`).
 */
export async function personalizeResults<T extends { id: number; semanticScore?: number; score: number }>(
  userId: number,
  mediaType: TasteMediaType,
  items: readonly T[],
  limit: number
): Promise<{ items: T[]; status: ForMeStatus }> {
  const keep = (status: ForMeStatus) => ({ items: items.slice(0, limit), status });
  try {
    const [vectors, current] = await Promise.all([getTasteVectors(userId), getTasteSpace()]);
    const centroid = vectors.centroid ? l2Normalize(vectors.centroid) : null;
    if (!centroid || items.length === 0) return keep("no_profile");
    const space = vectors.space === current.kind ? current : RAW_SPACE;
    const ids = items.map((i) => i.id);
    const emb = await fetchTitleEmbeddings(mediaType === "movie" ? ids : [], mediaType === "series" ? ids : []);
    const blended = blendQueryTaste(
      items.map((it, rank) => {
        const v = emb.get(titleKey(mediaType, it.id));
        const p = v ? space.project(v) : null;
        return {
          key: String(it.id),
          // Without a semantic score keep the incoming order as the query term.
          querySim: it.semanticScore ?? -rank,
          tasteSim: p ? dot(p, centroid) : null,
        };
      }),
      FOR_ME_QUERY_WEIGHT
    );
    const byId = new Map(items.map((i) => [String(i.id), i]));
    return {
      items: blended
        .slice(0, limit)
        .map((b) => byId.get(b.key))
        .filter((x): x is T => x !== undefined),
      status: "applied",
    };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.for_me_failed",
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return keep("error");
  }
}
