/**
 * Pure diff helpers for child-row reconciliation.
 *
 * Hydration used to delete + reinsert every child row (credits, images,
 * watch_options, …) whenever ANYTHING in the set changed. `upsert-diff.ts`
 * added the "skip when identical" fast path; this module goes further and
 * computes a per-row reconciliation so a single changed row produces a single
 * UPDATE instead of a full delete+reinsert of the whole collection:
 *
 *   diffChildRows(existing, incoming, keyOf, isSame)
 *     → { toInsert, toUpdate, toDelete }
 *
 * Semantics:
 * - Rows are matched by natural key (`keyOf`). Duplicate keys are handled as
 *   a MULTISET: the Nth incoming row with key K pairs with the Nth existing
 *   row with key K (in array order). Unpaired incoming rows → toInsert;
 *   unpaired existing rows → toDelete. Tables whose unique constraint
 *   collapses duplicates must pre-dedupe incoming with `dedupeBy` (keep
 *   first), mirroring what `createMany({ skipDuplicates })` /
 *   `.create().catch(ignore)` used to produce.
 * - Paired rows compare via `isSame`; differing pairs → toUpdate.
 * - Identical sets → all three arrays empty → caller performs ZERO writes.
 *
 * Float comparisons use 3-decimal rounding (`floatEq3`) — the popularity-sync
 * precedent — because TMDB re-jitters floats (vote_average, aspect_ratio)
 * beyond meaningful precision on most daily exports.
 *
 * This module is intentionally dependency-free (no logger/prisma imports) so
 * unit tests exercise exactly the production code paths.
 */

export interface ChildRowDiff<E, I> {
  /** Incoming rows with no existing match — INSERT these. */
  toInsert: I[];
  /** Key-matched pairs whose compared fields differ — UPDATE existing by id. */
  toUpdate: Array<{ existing: E; incoming: I }>;
  /** Existing rows no longer present in incoming — DELETE these. */
  toDelete: E[];
}

/**
 * Diff existing vs incoming child rows by natural key.
 *
 * `keyOf` must be callable on both shapes (project existing DB rows to the
 * incoming field names before diffing). `isSame` returns true when the row
 * needs no update (compare only meaningful, caller-owned fields).
 */
export function diffChildRows<E, I>(
  existing: ReadonlyArray<E>,
  incoming: ReadonlyArray<I>,
  keyOf: (row: E | I) => string,
  isSame: (existing: E, incoming: I) => boolean
): ChildRowDiff<E, I> {
  const existingByKey = new Map<string, E[]>();
  for (const row of existing) {
    const key = keyOf(row);
    const bucket = existingByKey.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      existingByKey.set(key, [row]);
    }
  }

  const toInsert: I[] = [];
  const toUpdate: Array<{ existing: E; incoming: I }> = [];

  for (const row of incoming) {
    const bucket = existingByKey.get(keyOf(row));
    const match = bucket && bucket.length > 0 ? bucket.shift() : undefined;
    if (match === undefined) {
      toInsert.push(row);
    } else if (!isSame(match, row)) {
      toUpdate.push({ existing: match, incoming: row });
    }
  }

  const toDelete: E[] = [];
  for (const bucket of existingByKey.values()) {
    for (const row of bucket) {
      toDelete.push(row);
    }
  }

  return { toInsert, toUpdate, toDelete };
}

/** True when the diff requires any write at all. */
export function hasChanges(diff: ChildRowDiff<unknown, unknown>): boolean {
  return diff.toInsert.length > 0 || diff.toUpdate.length > 0 || diff.toDelete.length > 0;
}

/**
 * Float equality with 3-decimal tolerance (popularity-sync precedent).
 * null/undefined compare equal to each other and unequal to any number.
 */
export function floatEq3(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.round(a * 1000) === Math.round(b * 1000);
}

/** Date equality by epoch millis; null/undefined compare equal to each other. */
export function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.getTime() === b.getTime();
}

/**
 * Null-safe key segment: distinguishes `null` from the literal string "null"
 * (e.g. a character actually named "null") when building composite keys.
 */
export function keyPart(value: string | number | null | undefined): string {
  return value == null ? "\u0000" : String(value);
}
