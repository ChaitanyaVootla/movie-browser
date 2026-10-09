/**
 * Taste profile service — the interface recommendations / taste match build on
 * (spec docs/superpowers/specs/2026-10-09-taste-profile-design.md §13).
 *
 * Lifecycle mirrors user_stats: the stored row is served unless it is missing,
 * dirty, older than TASTE_TTL_MS, or from another TASTE_ALGO_VERSION; then it
 * is recomputed (concurrent callers for one user share one recompute). If a
 * recompute fails, the last stored snapshot keeps being served.
 *
 * PRIVACY RULE FOR CONSUMERS: anything shown to someone other than the owner
 * uses scope "public" (public snapshot / public centroid). "full" may include
 * private watches and the watchlist — owner-only recs.
 */
import { MIN_PUBLIC_POSITIVES_FOR_DISPLAY, TASTE_ALGO_VERSION, TASTE_TTL_MS } from "@/lib/taste/constants";
import {
  TasteClusterSchema,
  emptyFacets,
  parseTasteSnapshot,
  type TasteCluster,
  type TasteSnapshot,
} from "@/lib/taste/profile";
import type { TasteScope } from "@/lib/taste/types";
import { readTasteRow, readTasteVectors, type TasteRow } from "@/server/db/postgres/social/taste";
import { markTasteDirty } from "@/server/db/postgres/social/taste-dirty";
import { dataLogger } from "@/lib/logger";
import type { ProfileTasteDTO } from "@/types/social";
import { computeAndStoreTaste, fullFacetsColumn } from "./compute";
import { z } from "zod";
import pLimit from "p-limit";

export { markTasteDirty };
export { cosineSimilarity, l2Normalize } from "@/lib/taste/vector";
export type { TasteSnapshot, TasteCluster } from "@/lib/taste/profile";

/** Global cap on concurrent recomputes (crawler bursts across many profiles). */
const RECOMPUTE_CONCURRENCY = 2;
/** How long a reader waits for a recompute before serving the stale row (render path). */
const RECOMPUTE_WAIT_MS = 1_500;
/** Hard cap on one recompute holding a limiter slot. */
const RECOMPUTE_TIMEOUT_MS = 20_000;
/** Failure backoff: 5 min, doubling, capped at 1 h. Bounded map. */
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;
const BACKOFF_MAX_ENTRIES = 10_000;

const limit = pLimit(RECOMPUTE_CONCURRENCY);
const inflight = new Map<number, Promise<TasteRow | null>>();
const backoff = new Map<number, { until: number; delay: number }>();

function isFresh(row: TasteRow | null): boolean {
  return (
    row !== null &&
    !row.dirty &&
    row.algoVersion === TASTE_ALGO_VERSION &&
    row.computedAt !== null &&
    Date.now() - row.computedAt.getTime() < TASTE_TTL_MS
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function noteFailure(userId: number): void {
  const prev = backoff.get(userId);
  const delay = prev ? Math.min(BACKOFF_MAX_MS, prev.delay * 2) : BACKOFF_BASE_MS;
  if (!prev && backoff.size >= BACKOFF_MAX_ENTRIES) {
    const oldest = backoff.keys().next();
    if (!oldest.done) backoff.delete(oldest.value);
  }
  backoff.set(userId, { until: Date.now() + delay, delay });
}

/** Start (or join) the single in-flight recompute for a user. */
function startRecompute(userId: number, stale: TasteRow | null): Promise<TasteRow | null> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = limit(async () => {
    try {
      await withTimeout(computeAndStoreTaste(userId, stale?.updatedAt ?? null), RECOMPUTE_TIMEOUT_MS, "taste recompute");
      backoff.delete(userId);
      return await readTasteRow(userId);
    } catch (error: unknown) {
      noteFailure(userId);
      dataLogger.warn({
        action: "taste.recompute_failed",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return stale; // serve stale rather than nothing
    }
  }).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

/**
 * Fresh row when possible. A stale/missing row triggers ONE deduped,
 * concurrency-capped recompute; the reader waits at most RECOMPUTE_WAIT_MS and
 * otherwise gets the stale row (or null) while the recompute finishes in the
 * background. Rows in failure backoff are served stale without retrying.
 * `pending` = a recompute is still running for a row that had nothing to serve.
 */
async function ensureFresh(userId: number): Promise<{ row: TasteRow | null; pending: boolean }> {
  const row = await readTasteRow(userId);
  if (row && isFresh(row)) return { row, pending: false };
  const b = backoff.get(userId);
  if (b && Date.now() < b.until) return { row, pending: false };
  const p = startRecompute(userId, row);
  const TIMEOUT = Symbol("wait");
  const result = await Promise.race([
    p,
    new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), RECOMPUTE_WAIT_MS)),
  ]);
  if (result === TIMEOUT) return { row, pending: row === null };
  return { row: result, pending: false };
}

const FullFacetsSchema = z.object({
  facets: z.record(z.string(), z.unknown()),
  moods: z.unknown(),
  people: z.unknown(),
});

function fullSnapshotFromRow(row: TasteRow): TasteSnapshot | null {
  const facetsCol = FullFacetsSchema.safeParse(row.facets);
  if (!facetsCol.success) return null;
  const clusters = z.array(TasteClusterSchema).safeParse(row.clusters);
  return parseTasteSnapshot({
    v: 1,
    computedAt: row.computedAt?.toISOString() ?? new Date(0).toISOString(),
    scope: "full",
    positiveCount: row.positiveCount,
    signalCount: row.signalCount,
    axes: row.axes,
    moods: facetsCol.data.moods,
    facets: { ...emptyFacets(), ...facetsCol.data.facets },
    people: facetsCol.data.people,
    clusters: clusters.success
      ? clusters.data.map(({ medoidKey: _k, memberKeys: _m, ...view }) => view)
      : [],
  });
}

function snapshotFromRow(row: TasteRow | null, scope: TasteScope): TasteSnapshot | null {
  if (!row) return null;
  return scope === "public" ? parseTasteSnapshot(row.publicSnapshot) : fullSnapshotFromRow(row);
}

/** The taste snapshot for a scope (null when the user has no computable profile). */
export async function getTasteProfile(
  userId: number,
  opts: { scope: TasteScope }
): Promise<TasteSnapshot | null> {
  const { row } = await ensureFresh(userId);
  return snapshotFromRow(row, opts.scope);
}

/** FULL clusters with member + medoid keys ("m:<id>" | "s:<id>") — owner recs only. */
export async function getTasteClusters(userId: number): Promise<TasteCluster[]> {
  const { row } = await ensureFresh(userId);
  if (!row) return [];
  const parsed = z.array(TasteClusterSchema).safeParse(row.clusters);
  return parsed.success ? parsed.data : [];
}

/** All stored vectors (1024-d, L2-normalised) after ensuring freshness. */
export async function getTasteVectors(userId: number): Promise<{
  centroid: number[] | null;
  negCentroid: number[] | null;
  publicCentroid: number[] | null;
}> {
  await ensureFresh(userId);
  return readTasteVectors(userId);
}

/**
 * The user's taste embedding (phase-3 plan name). Default scope "full" = the
 * owner's private recs vector; pass scope "public" for anything another user
 * sees (compatibility, follow suggestions).
 */
export async function getUserTasteEmbedding(
  userId: number,
  opts: { scope?: TasteScope } = {}
): Promise<number[] | null> {
  const v = await getTasteVectors(userId);
  return (opts.scope ?? "full") === "public" ? v.publicCentroid : v.centroid;
}

/**
 * Profile-surface DTO. Never throws (render path): any failure → null and the
 * widgets simply don't render. Caller passes `show` from users.metadata.
 */
export async function getProfileTaste(userId: number, show: boolean): Promise<ProfileTasteDTO | null> {
  if (!show) return { status: "hidden" };
  try {
    const { row, pending } = await ensureFresh(userId);
    if (pending) return null; // first compute still running → render nothing this time
    const snapshot = snapshotFromRow(row, "public");
    const positives = snapshot?.positiveCount ?? 0;
    if (!snapshot || positives < MIN_PUBLIC_POSITIVES_FOR_DISPLAY) {
      return { status: "insufficient", positiveCount: positives, needed: MIN_PUBLIC_POSITIVES_FOR_DISPLAY };
    }
    return { status: "ready", snapshot };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "getProfileTaste",
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Test/dev hook: run a recompute now regardless of freshness. */
export async function recomputeTasteNow(userId: number) {
  const row = await readTasteRow(userId);
  const result = await computeAndStoreTaste(userId, row?.updatedAt ?? null);
  return { ms: result.ms, full: result.full.snapshot, public: result.public.snapshot, facetsColumn: fullFacetsColumn(result.full) };
}
