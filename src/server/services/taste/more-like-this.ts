/**
 * "More like {seed}" rows (taste v2 spec 2026-10-12 §3.4) — the service behind
 * the `getMoreLikeThis` action and Cue's `steer_recs({ seedTitle })`.
 *
 * One `annSearch` per table (via `annCandidates`: the user's exclusions incl.
 * dismissals INSIDE the scan, adult + vote floor outside), then
 *   0.65 · mm(cos to seed) + 0.35 · mm(centered taste cos)
 * (`blendQueryTaste`). FULL scope, owner only. In-process cache 10 min keyed
 * `userId:seedKey:computedAt`, re-filtered by fresh exclusions on every hit.
 * Never throws; null = nothing to show.
 */
import {
  REC_SEED_ANN_K,
  REC_SEED_CACHE_TTL_MS,
  REC_SEED_QUERY_WEIGHT,
  REC_SEED_ROW_SIZE,
} from "@/lib/taste/recommend-constants";
import { blendQueryTaste } from "@/lib/taste/rerank";
import { resolveStoredSpace } from "@/lib/taste/space";
import { dot, l2Normalize } from "@/lib/taste/vector";
import type { RecRowDTO, RecSeedInput } from "@/lib/taste/recommend-types";
import type { TitleKey } from "@/lib/taste/types";
import { annCandidates, fetchCandidateDetails, fetchRecExclusions } from "@/server/db/postgres/social/taste-recs";
import { hasVectorIndex } from "@/server/db/postgres/vector-index";
import { dataLogger } from "@/lib/logger";
import { getTasteProfile, getTasteSpace, getTasteVectors } from "./index";
import { excludedFor, REC_TABLES } from "./rec-fallbacks";
import { exclusionKeys, itemKey, thumbOf, toItem } from "./rec-dto";

const SEED_CACHE_MAX = 200;
const cache = new Map<string, { at: number; row: RecRowDTO }>();

/** Test hook / feedback eviction. */
export function clearSeedCache(userId?: number): void {
  if (userId === undefined) return cache.clear();
  for (const k of [...cache.keys()]) if (k.startsWith(`${userId}:`)) cache.delete(k);
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function seedRowId(seed: RecSeedInput): string {
  return `seed-${seed.mediaType === "movie" ? "m" : "s"}:${seed.id}`;
}

export async function getMoreLikeThisForUser(userId: number, seed: RecSeedInput): Promise<RecRowDTO | null> {
  try {
    const [snapshot, exclusions] = await Promise.all([
      getTasteProfile(userId, { scope: "full" }),
      fetchRecExclusions(userId),
    ]);
    const key = `${userId}:${itemKey(seed)}:${snapshot?.computedAt ?? "none"}`;
    const excluded = exclusionKeys(exclusions);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at <= REC_SEED_CACHE_TTL_MS) {
      const items = hit.row.items.filter((it) => !excluded.has(itemKey(it)));
      return items.length ? { ...hit.row, items } : null;
    }
    const row = await computeSeedRow(userId, seed, exclusions);
    if (row) {
      cache.set(key, { at: Date.now(), row });
      while (cache.size > SEED_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    }
    return row;
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.more_like_this_failed",
      userId,
      seed: itemKey(seed),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function computeSeedRow(
  userId: number,
  seed: RecSeedInput,
  exclusions: Awaited<ReturnType<typeof fetchRecExclusions>>
): Promise<RecRowDTO | null> {
  const seedTable = seed.mediaType === "movie" ? "movies" : "series";
  const [[seedRow], vectors, current] = await Promise.all([
    fetchCandidateDetails(seedTable, [seed.id]), // notAdult inside: an adult seed yields no row
    getTasteVectors(userId),
    getTasteSpace(),
  ]);
  if (!seedRow || seedRow.embedding.length === 0) return null;

  // Seed + candidates in the space of the stored centroid when comparable;
  // otherwise the current space and no taste term.
  const stored = resolveStoredSpace(vectors.space, current);
  const space = stored ?? current;
  const projectedSeed = space.project(seedRow.embedding);
  const q = projectedSeed ? l2Normalize(projectedSeed) : null;
  if (!q) return null;
  const centroid = stored && vectors.centroid ? l2Normalize(vectors.centroid) : null;

  const hits: Array<{ table: "movies" | "series"; id: number; dist: number }> = [];
  for (const t of REC_TABLES) {
    if (!(await hasVectorIndex(t.table))) continue;
    const own = excludedFor(exclusions, t.table);
    const excludeIds = t.table === seedTable ? [...own, seed.id] : own;
    const res = await annCandidates(t.table, [q], { excludeIds, minVotes: t.minVotes, perQuery: REC_SEED_ANN_K });
    for (const h of res) hits.push({ table: t.table, id: h.id, dist: h.dist });
  }
  if (hits.length === 0) return null;
  const top = hits.sort((a, b) => a.dist - b.dist).slice(0, REC_SEED_ROW_SIZE * 5);
  const details = (
    await Promise.all(
      REC_TABLES.map((t) =>
        fetchCandidateDetails(
          t.table,
          top.filter((h) => h.table === t.table).map((h) => h.id)
        )
      )
    )
  ).flat();

  const units = new Map<TitleKey, number[]>();
  for (const d of details) {
    const p = space.project(d.embedding);
    const u = p ? l2Normalize(p) : null;
    if (u) units.set(d.key, u);
  }
  const usable = details.filter((d) => units.has(d.key));
  const blended = blendQueryTaste(
    usable.map((d) => {
      const u = units.get(d.key) ?? [];
      return { key: d.key, querySim: dot(u, q), tasteSim: centroid ? dot(u, centroid) : null };
    }),
    REC_SEED_QUERY_WEIGHT
  );
  const byKey = new Map(usable.map((d) => [d.key, d]));
  const seedRef = thumbOf({ mediaType: seed.mediaType, id: seed.id, title: seedRow.title, posterPath: seedRow.posterPath });
  const items = blended.slice(0, REC_SEED_ROW_SIZE).flatMap((b) => {
    const d = byKey.get(b.key);
    return d ? [toItem(d, "taste", { kind: "seed", seed: seedRef, cos: round3(b.querySim) })] : [];
  });
  if (items.length === 0) return null;
  return { id: seedRowId(seed), kind: "seed", anchors: [seedRef], label: null, items, tune: null };
}
