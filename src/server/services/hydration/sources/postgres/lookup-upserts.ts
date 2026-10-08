/**
 * Transaction-safe lookup + junction writes for the hydration upserts.
 *
 * WHY THIS FILE EXISTS (Oct 2026): the junction upserts used
 * `tx.<junction>.create(...).catch(() => {})` to "ignore duplicates". Inside
 * an interactive transaction that does NOT ignore anything — Postgres aborts
 * the transaction on the unique violation (23505) and every later statement
 * fails with 25P02 ("current transaction is aborted"), so the WHOLE title
 * upsert is lost and redone on the next visit. Prod logged 29 movie_genres_pkey
 * + 10 series_genres_pkey + 4 series_companies_pkey violations and 43 aborted
 * statements in 72h. The duplicates come from two upserts of the same title
 * racing (e.g. a hover-card partial hydration alongside a background refresh,
 * both doing delete-then-insert). The per-row `find → upsert` lookups had the
 * same race (P2002 on the lookup's unique tmdb_id).
 *
 * The fix is `INSERT … ON CONFLICT DO NOTHING` (`createMany({ skipDuplicates })`)
 * for every lookup and junction: a racing duplicate now WAITS for the other
 * transaction and is skipped instead of poisoning this one. It is also fewer
 * round-trips (one findMany + at most one createMany per lookup table, instead
 * of a findUnique per item).
 *
 * Behaviour change, deliberate: lookups are create-only. The old code only
 * ever reached its `upsert` when the row was missing (i.e. it was a create),
 * EXCEPT for production countries, whose `update: { name }` rewrote the same
 * name on every refresh — 446k no-op `countries` updates on prod. Countries
 * are seeded (`prisma/seed.ts`, `scripts/seed-countries.ts`), so names are
 * no longer touched here.
 */

import type { PrismaTx } from "./types";
import { dedupeBy } from "./upsert-diff";

export interface TmdbNamed {
  id: number;
  name: string;
}

export interface TmdbCompanyLike extends TmdbNamed {
  logo_path?: string | null;
  origin_country?: string | null;
}

export interface TmdbPersonLike extends TmdbNamed {
  profile_path?: string | null;
  known_for_department?: string | null;
  popularity?: number | null;
}

type IdRow = { id: number; tmdbId: number };

/**
 * Shared shape: find existing by tmdbId, create the missing ones with
 * skipDuplicates (race-safe), re-read only those. Returns tmdbId → db id.
 */
async function ensureByTmdbId<T extends TmdbNamed>(
  items: ReadonlyArray<T>,
  find: (tmdbIds: number[]) => Promise<IdRow[]>,
  createMissing: (missing: T[]) => Promise<unknown>,
): Promise<Map<number, number>> {
  const uniq = dedupeBy(items, (i) => String(i.id));
  const ids = new Map<number, number>();
  if (uniq.length === 0) return ids;
  for (const r of await find(uniq.map((i) => i.id))) ids.set(r.tmdbId, r.id);
  const missing = uniq.filter((i) => !ids.has(i.id));
  if (missing.length > 0) {
    await createMissing(missing);
    for (const r of await find(missing.map((i) => i.id))) ids.set(r.tmdbId, r.id);
  }
  return ids;
}

const idSelect = { id: true, tmdbId: true } as const;

export function ensureGenres(tx: PrismaTx, items: ReadonlyArray<TmdbNamed>) {
  return ensureByTmdbId(
    items,
    (tmdbIds) => tx.genre.findMany({ where: { tmdbId: { in: tmdbIds } }, select: idSelect }),
    (m) =>
      tx.genre.createMany({
        data: m.map((g) => ({ tmdbId: g.id, name: g.name })),
        skipDuplicates: true,
      }),
  );
}

export function ensureKeywords(tx: PrismaTx, items: ReadonlyArray<TmdbNamed>) {
  return ensureByTmdbId(
    items,
    (tmdbIds) => tx.keyword.findMany({ where: { tmdbId: { in: tmdbIds } }, select: idSelect }),
    (m) =>
      tx.keyword.createMany({
        data: m.map((k) => ({ tmdbId: k.id, name: k.name })),
        skipDuplicates: true,
      }),
  );
}

export function ensureCompanies(tx: PrismaTx, items: ReadonlyArray<TmdbCompanyLike>) {
  return ensureByTmdbId(
    items,
    (tmdbIds) =>
      tx.productionCompany.findMany({ where: { tmdbId: { in: tmdbIds } }, select: idSelect }),
    (m) =>
      tx.productionCompany.createMany({
        data: m.map((c) => ({
          tmdbId: c.id,
          name: c.name,
          logoPath: c.logo_path ?? null,
          originCountry: c.origin_country ?? null,
        })),
        skipDuplicates: true,
      }),
  );
}

export function ensureNetworks(tx: PrismaTx, items: ReadonlyArray<TmdbCompanyLike>) {
  return ensureByTmdbId(
    items,
    (tmdbIds) => tx.network.findMany({ where: { tmdbId: { in: tmdbIds } }, select: idSelect }),
    (m) =>
      tx.network.createMany({
        data: m.map((n) => ({
          tmdbId: n.id,
          name: n.name,
          logoPath: n.logo_path ?? null,
          originCountry: n.origin_country ?? null,
        })),
        skipDuplicates: true,
      }),
  );
}

/** Persons referenced by credits/creators. Create-only (popularity handled by callers). */
export function ensurePersons(tx: PrismaTx, items: ReadonlyArray<TmdbPersonLike>) {
  return ensureByTmdbId(
    items,
    (tmdbIds) => tx.person.findMany({ where: { tmdbId: { in: tmdbIds } }, select: idSelect }),
    (m) =>
      tx.person.createMany({
        data: m.map((p) => ({
          tmdbId: p.id,
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownFor: p.known_for_department ?? null,
          ...(p.popularity != null && { popularity: p.popularity }),
        })),
        skipDuplicates: true,
      }),
  );
}

/** Country lookup rows for FK safety; never rewrites existing names. */
export async function ensureCountries(
  tx: PrismaTx,
  countries: ReadonlyArray<{ code: string; name: string }>,
): Promise<void> {
  const uniq = dedupeBy(
    countries.filter((c) => c.code),
    (c) => c.code,
  );
  if (uniq.length === 0) return;
  const existing = await tx.country.findMany({
    where: { code: { in: uniq.map((c) => c.code) } },
    select: { code: true },
  });
  const have = new Set(existing.map((c) => c.code));
  const missing = uniq.filter((c) => !have.has(c.code));
  if (missing.length > 0) {
    await tx.country.createMany({ data: missing, skipDuplicates: true });
  }
}

export async function ensureLanguages(
  tx: PrismaTx,
  languages: ReadonlyArray<{ code: string; name: string }>,
): Promise<void> {
  const uniq = dedupeBy(
    languages.filter((l) => l.code),
    (l) => l.code,
  );
  if (uniq.length === 0) return;
  const existing = await tx.language.findMany({
    where: { code: { in: uniq.map((l) => l.code) } },
    select: { code: true },
  });
  const have = new Set(existing.map((l) => l.code));
  const missing = uniq.filter((l) => !have.has(l.code));
  if (missing.length > 0) {
    await tx.language.createMany({ data: missing, skipDuplicates: true });
  }
}

/** Map TMDB ids through a lookup, dropping any that failed to resolve. */
export function resolveIds(tmdbIds: ReadonlyArray<number>, ids: Map<number, number>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const t of tmdbIds) {
    const id = ids.get(t);
    if (id !== undefined && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
