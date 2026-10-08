/**
 * PostgreSQL Credit Upserts (non-aggregate cast/crew)
 *
 * Split from shared-upserts.ts for the 800-line file limit. Reconciles the
 * credits child table diff-based (see ./diff-reconcile): insert new, update
 * order-only changes, delete removed — ZERO writes when the credit set is
 * unchanged. Re-exported via shared-upserts.ts so callers are unaffected.
 */

import { dataLogger } from "@/lib/logger";
import type { PrismaTx } from "./types";
import { dedupeBy } from "./upsert-diff";
import { ensurePersons } from "./lookup-upserts";
import {
  diffChildRows,
  hasChanges,
  keyPart,
  type ChildRowDiff,
} from "./diff-reconcile";

/** Observability: every actual child-table write is logged with delta counts. */
function logChildReconcile(
  table: string,
  mediaType: string,
  mediaId: number,
  diff: ChildRowDiff<unknown, unknown>
): void {
  dataLogger.debug(
    {
      table,
      mediaType,
      mediaId,
      inserted: diff.toInsert.length,
      updated: diff.toUpdate.length,
      deleted: diff.toDelete.length,
    },
    "hydration: child rows changed, reconciling"
  );
}

interface TmdbCreditPerson {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  popularity?: number | null;
}

/**
 * Upsert credits (cast and crew) - NON-AGGREGATE version
 *
 * Stores ALL cast and ALL crew members (no arbitrary limits).
 * For series: This stores the "regular" credits (main cast), NOT aggregate_credits.
 * The isAggregate flag allows UI to choose which to display.
 */
export async function upsertCredits(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  credits: {
    cast?: Array<TmdbCreditPerson & { character?: string | null; order?: number | null }>;
    crew?: Array<TmdbCreditPerson & { job?: string | null; department?: string | null }>;
  }
): Promise<void> {
  const allCredits: Array<{
    personTmdbId: number;
    creditType: "CAST" | "CREW";
    character: string | null;
    job: string | null;
    department: string | null;
    creditOrder: number | null;
    // Person payload — used only when creating persons for inserted credits.
    personName: string;
    personProfilePath: string | null;
    personKnownFor: string | null;
    personPopularity: number | null;
  }> = [];

  // Process ALL cast
  for (const cast of credits.cast || []) {
    allCredits.push({
      personTmdbId: cast.id,
      creditType: "CAST",
      character: cast.character ?? null,
      job: null,
      department: null,
      creditOrder: cast.order ?? null,
      personName: cast.name,
      personProfilePath: cast.profile_path ?? null,
      personKnownFor: cast.known_for_department ?? null,
      personPopularity: cast.popularity ?? null,
    });
  }

  // Process ALL crew (no job filter - store everything)
  for (const crew of credits.crew || []) {
    allCredits.push({
      personTmdbId: crew.id,
      creditType: "CREW",
      character: null,
      job: crew.job ?? null,
      department: crew.department ?? null,
      creditOrder: null,
      personName: crew.name,
      personProfilePath: crew.profile_path ?? null,
      personKnownFor: crew.known_for_department ?? null,
      personPopularity: crew.popularity ?? null,
    });
  }

  // Mirror the (media, person, creditType, character) unique constraint that
  // used to collapse duplicates via .create().catch(ignore): rows with a NULL
  // character (all crew) are never collapsed by it — Postgres treats NULLs as
  // distinct — so only dedupe when character is non-null.
  const dedupedCredits = dedupeBy(allCredits, (c) =>
    c.character !== null ? `${c.creditType}|${c.personTmdbId}|${c.character}` : null
  );

  const existingRaw = await tx.credit.findMany({
    where:
      mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId, isAggregate: false },
    select: {
      id: true,
      creditType: true,
      character: true,
      job: true,
      department: true,
      creditOrder: true,
      person: { select: { tmdbId: true } },
    },
  });
  const existing = existingRaw.map((r) => ({
    id: r.id,
    personTmdbId: r.person.tmdbId,
    creditType: String(r.creditType),
    character: r.character,
    job: r.job,
    department: r.department,
    creditOrder: r.creditOrder,
  }));

  // Identity = person + type + character/job/department; order-only changes
  // become UPDATEs. A changed character/job pairs as delete+insert instead.
  // Note: person popularity refreshes for unchanged credits are skipped — the
  // daily popularity-sync job covers those.
  const diff = diffChildRows(
    existing,
    dedupedCredits,
    (r) =>
      `${r.creditType}|${r.personTmdbId}|${keyPart(r.character)}|${keyPart(r.job)}|${keyPart(r.department)}`,
    (a, b) => a.creditOrder === b.creditOrder
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("credits", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.credit.deleteMany({ where: { id: { in: diff.toDelete.map((r) => r.id) } } });
  }
  for (const { existing: row, incoming } of diff.toUpdate) {
    await tx.credit.update({
      where: { id: row.id },
      data: { creditOrder: incoming.creditOrder },
    });
  }

  if (diff.toInsert.length === 0) return;

  // Persons for the inserted delta: one read, a race-safe create of the
  // missing ones, and the existing "keep the highest popularity" bump. Then
  // ONE ON CONFLICT DO NOTHING insert for the credits — the old per-row
  // `.create().catch()` aborted the whole transaction on a duplicate (25P02,
  // see lookup-upserts.ts).
  const wanted = dedupeBy(diff.toInsert, (c) => String(c.personTmdbId));
  const known = await tx.person.findMany({
    where: { tmdbId: { in: wanted.map((c) => c.personTmdbId) } },
    select: { id: true, tmdbId: true, popularity: true },
  });
  const knownByTmdb = new Map(known.map((p) => [p.tmdbId, p]));
  for (const c of wanted) {
    const p = knownByTmdb.get(c.personTmdbId);
    if (p && c.personPopularity != null && (p.popularity == null || c.personPopularity > p.popularity)) {
      // Person popularity can vary by movie context — keep the highest seen.
      await tx.person.update({ where: { id: p.id }, data: { popularity: c.personPopularity } });
    }
  }
  const personIds = new Map(known.map((p) => [p.tmdbId, p.id]));
  const missing = wanted.filter((c) => !personIds.has(c.personTmdbId));
  if (missing.length > 0) {
    const created = await ensurePersons(
      tx,
      missing.map((c) => ({
        id: c.personTmdbId,
        name: c.personName,
        profile_path: c.personProfilePath,
        known_for_department: c.personKnownFor,
        popularity: c.personPopularity,
      }))
    );
    for (const [tmdbId, id] of created) personIds.set(tmdbId, id);
  }

  const rows = [];
  for (const credit of diff.toInsert) {
    const personId = personIds.get(credit.personTmdbId);
    if (personId === undefined) continue;
    rows.push({
      movieId: mediaType === "movie" ? mediaId : null,
      seriesId: mediaType === "series" ? mediaId : null,
      personId,
      creditType: credit.creditType,
      character: credit.character,
      job: credit.job,
      department: credit.department,
      creditOrder: credit.creditOrder,
      isAggregate: false,
    });
  }
  if (rows.length > 0) {
    await tx.credit.createMany({ data: rows, skipDuplicates: true });
  }

}
