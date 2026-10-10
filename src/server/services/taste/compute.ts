/**
 * One taste recompute: fetch signals → fold → fetch embeddings + metadata for
 * the bounded title set → baseline → pure compute for BOTH scopes → store.
 * No LLM, no embedding generation (stored vectors only).
 */
import { TASTE_ALGO_VERSION } from "@/lib/taste/constants";
import { computeTasteProfile, type TasteComputeResult } from "@/lib/taste/profile";
import { foldSignals } from "@/lib/taste/weights";
import type { FacetType, TitleKey } from "@/lib/taste/types";
import {
  fetchTasteSignals,
  fetchTitleEmbeddings,
  fetchTitleMeta,
  writeTasteRow,
} from "@/server/db/postgres/social/taste";
import { dataLogger } from "@/lib/logger";
import { projectAll } from "@/lib/taste/space";
import { getBaseline, getTasteSpaceState } from "./baseline-cache";

export interface ComputedTaste {
  full: TasteComputeResult;
  public: TasteComputeResult;
  ms: number;
}

const splitIds = (keys: Iterable<TitleKey>) => {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const k of keys) {
    const id = Number(k.slice(2));
    if (!Number.isFinite(id)) continue;
    if (k.startsWith("m:")) movieIds.push(id);
    else seriesIds.push(id);
  }
  return { movieIds, seriesIds };
};

/** Shape of the FULL lift tables stored in the `facets` column. */
export function fullFacetsColumn(r: TasteComputeResult) {
  return { facets: r.snapshot.facets, moods: r.snapshot.moods, people: r.snapshot.people };
}

export async function computeAndStoreTaste(
  userId: number,
  observedUpdatedAt: Date | null
): Promise<ComputedTaste> {
  const t0 = performance.now();
  // Fresh read of the space (bypasses the 1h cache): a row is always built on
  // the latest committed μ, so `computedAt >= meanAt` really means "current μ".
  // Unknown space (read failed, nothing cached) → fail the recompute (the stale
  // row keeps being served, with backoff) rather than write a guessed space.
  const spaceState = await getTasteSpaceState({ fresh: true });
  if (!spaceState.known) throw new Error("taste space unavailable");
  const space = spaceState.space;
  const now = new Date();
  const signals = await fetchTasteSignals(userId);

  // Bound the metadata fetch to the titles each scope will actually use.
  const keys = new Set<TitleKey>();
  for (const scope of ["full", "public"] as const) {
    for (const t of foldSignals(signals, scope, now).titles) keys.add(t.key);
  }
  const { movieIds, seriesIds } = splitIds(keys);
  const [rawEmbeddings, { meta, people }] = await Promise.all([
    fetchTitleEmbeddings(movieIds, seriesIds),
    fetchTitleMeta(movieIds, seriesIds),
  ]);
  // Every vector (centroids, clusters, medoids) is built in the current space —
  // mean-centered once the cron has stored μ (spec 2026-10-10 §2).
  const embeddings = projectAll(space, rawEmbeddings);

  const needed = new Map<FacetType, Set<string>>();
  for (const m of meta.values()) {
    for (const f of m.facets) {
      const set = needed.get(f.type) ?? new Set<string>();
      set.add(f.key);
      needed.set(f.type, set);
    }
  }
  const { baseline, catalog } = await getBaseline(needed);

  const input = { signals, meta, embeddings, people, baseline, catalog, now };
  const full = computeTasteProfile(input, "full");
  const pub = computeTasteProfile(input, "public");

  await writeTasteRow(
    userId,
    {
      centroid: full.centroid,
      negCentroid: full.negCentroid,
      publicCentroid: pub.centroid,
      clusters: full.clusters,
      facets: fullFacetsColumn(full),
      axes: full.snapshot.axes,
      publicSnapshot: pub.snapshot,
      signalCount: full.snapshot.signalCount,
      positiveCount: full.snapshot.positiveCount,
      algoVersion: TASTE_ALGO_VERSION,
      computedAt: now,
      space: space.kind,
    },
    observedUpdatedAt
  );

  const ms = Math.round(performance.now() - t0);
  dataLogger.debug({
    action: "taste.recompute",
    userId,
    ms,
    titles: keys.size,
    embedded: embeddings.size,
    positives: full.snapshot.positiveCount,
    publicPositives: pub.snapshot.positiveCount,
  });
  return { full, public: pub, ms };
}
