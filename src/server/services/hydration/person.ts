/**
 * Person Hydration — serve-stale-then-refresh (mirrors movie/series in index.ts)
 *
 * PostgreSQL (`persons.details` JSONB) is the serving layer for person detail
 * pages. The render path NEVER awaits a TMDB round-trip when PG has details:
 *
 * 1. PG row has `details` (fresh OR stale) → return it IMMEDIATELY; if
 *    `detailsUpdatedAt` is older than the freshness window, refresh in a
 *    deduped, capped background task. ISR revalidation (24h) picks up changes.
 * 2. PG row exists but `details` is null (the common initial state — the
 *    popularity sync seeded ~1.1M persons with only id/name/popularity), or no
 *    row at all → ONE synchronous TMDB fetch (the only blocking case, same as
 *    a movie PG miss), upsert details, return.
 * 3. TMDB 404 on a details miss → the error propagates, the action returns
 *    null, and the page's existing notFound() flow stays intact.
 *
 * Storage is a single JSONB column write per person — deliberately NOT
 * normalized into credit child tables (that delete+reinsert churn is the
 * movie/series mistake we already paid down). Payload is trimmed to what the
 * server render consumes (~50-300KB), written once + on weekly refresh.
 */

import { prisma } from "@/server/db/postgres";
import type { Prisma } from "@prisma/client";
import { fetchPersonFromTmdb, type TmdbPersonData, type TmdbPersonCredit } from "./sources/tmdb";
import type {
  Image,
  PersonCombinedCastCredit,
  PersonCombinedCrewCredit,
  PersonExternalIds,
} from "@/types";

// =============================================================================
// Types
// =============================================================================

/**
 * The trimmed TMDB person payload stored in `persons.details` and consumed by
 * the person page (hero + known-for + upcoming/latest + filmography + gallery
 * + JSON-LD + metadata). Field names stay TMDB-shaped so the page transform is
 * a passthrough.
 */
export interface PersonDetailsPayload {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  homepage: string | null;
  imdb_id: string | null;
  popularity: number;
  known_for_department: string;
  also_known_as: string[];
  gender: number;
  combined_credits: {
    cast: PersonCombinedCastCredit[];
    crew: PersonCombinedCrewCredit[];
  };
  images: { profiles: Image[] };
  external_ids: PersonExternalIds;
}

export type PersonHydrationSource = "postgres_fresh" | "postgres_stale" | "tmdb";

export interface PersonHydrationResult {
  data: PersonDetailsPayload;
  source: PersonHydrationSource;
}

// =============================================================================
// Freshness
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Person data changes slowly (a new credit lands every few weeks at most, bios
 * almost never) — 7 days, the movie/series RECENT tier. ISR (24h) sits on top,
 * so a stale person re-renders at most once a day anyway.
 */
export const PERSON_DETAILS_FRESHNESS_MS = 7 * DAY_MS;

export function isPersonDetailsFresh(detailsUpdatedAt: Date | null): boolean {
  if (!detailsUpdatedAt) return false;
  return Date.now() - detailsUpdatedAt.getTime() < PERSON_DETAILS_FRESHNESS_MS;
}

// =============================================================================
// Background refresh (same pattern as index.ts: per-id dedup + global cap)
// =============================================================================

// In-flight background refreshes, deduped per tmdbId. The movie/series Sets in
// index.ts are module-private, so persons keep their own Set with the same
// semantics and share the MAX_BACKGROUND_REFRESH env knob (0 disables).
const inFlightPersonRefresh = new Set<number>();

const MAX_BACKGROUND_REFRESH = Number(process.env.MAX_BACKGROUND_REFRESH ?? 3);

function backgroundRefreshPerson(tmdbId: number): void {
  if (inFlightPersonRefresh.has(tmdbId)) return;
  if (inFlightPersonRefresh.size >= MAX_BACKGROUND_REFRESH) return;
  inFlightPersonRefresh.add(tmdbId);
  void (async () => {
    try {
      const raw = await fetchPersonFromTmdb(tmdbId);
      await upsertPersonDetails(tmdbId, trimPersonDetails(raw));
      console.log(`[Hydration] Person ${tmdbId}: background details refresh complete`);
    } catch (e) {
      console.error(`[Hydration] Background person refresh ${tmdbId} failed:`, e);
    } finally {
      inFlightPersonRefresh.delete(tmdbId);
    }
  })();
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Hydrate person details for the detail page.
 *
 * Serve-stale contract: if PG has `details` at all, this NEVER awaits TMDB.
 * Throws only on a details miss where the synchronous TMDB fetch fails
 * (including 404 — callers preserve the existing null → notFound() flow).
 */
export async function hydratePerson(tmdbId: number): Promise<PersonHydrationResult> {
  // 1. Check PostgreSQL. A read failure degrades to the TMDB path rather than
  // taking the page down.
  const row = await prisma.person
    .findUnique({
      where: { tmdbId },
      select: { details: true, detailsUpdatedAt: true },
    })
    .catch((e: unknown) => {
      console.error(`[Hydration] Person ${tmdbId}: PG read failed:`, e);
      return null;
    });

  // 2. SERVE-FROM-PG PATH: details present (fresh OR stale) → return
  // immediately; stale details refresh in the deduped, capped background task.
  if (row?.details && isPersonDetailsPayload(row.details)) {
    if (isPersonDetailsFresh(row.detailsUpdatedAt)) {
      return { data: row.details, source: "postgres_fresh" };
    }
    console.log(`[Hydration] Person ${tmdbId}: serving stale PG details, background refresh`);
    backgroundRefreshPerson(tmdbId);
    return { data: row.details, source: "postgres_stale" };
  }

  // 3. DETAILS MISS (row without details — the common initial state — or no
  // row at all): one synchronous TMDB fetch. 404/errors propagate to the
  // caller so the page's notFound() behavior is preserved exactly.
  console.log(
    `[Hydration] Person ${tmdbId}: fetching from TMDB (PG ${row ? "details null" : "miss"})`
  );
  const raw = await fetchPersonFromTmdb(tmdbId);
  const details = trimPersonDetails(raw);

  // Persist for every later render. A write failure must not fail the render —
  // the next visit simply retries the backfill.
  await upsertPersonDetails(tmdbId, details).catch((e: unknown) => {
    console.error(`[Hydration] Person ${tmdbId}: details upsert failed:`, e);
  });

  return { data: details, source: "tmdb" };
}

// =============================================================================
// Trim + persist
// =============================================================================

/**
 * Trim the TMDB payload to what the server render consumes. Drops per-credit
 * `overview` (~200B × hundreds of credits) and any fields outside the page's
 * extract functions / JSON-LD / metadata needs. `genre_ids` is load-bearing
 * (known-for filters talk/awards-show TV genres); image entries keep the full
 * `Image` shape minus vote_count.
 */
export function trimPersonDetails(raw: TmdbPersonData): PersonDetailsPayload {
  return {
    id: raw.id,
    name: raw.name,
    biography: raw.biography ?? "",
    birthday: raw.birthday ?? null,
    deathday: raw.deathday ?? null,
    place_of_birth: raw.place_of_birth ?? null,
    profile_path: raw.profile_path ?? null,
    homepage: raw.homepage ?? null,
    imdb_id: raw.imdb_id ?? null,
    popularity: raw.popularity ?? 0,
    known_for_department: raw.known_for_department ?? "",
    also_known_as: raw.also_known_as ?? [],
    gender: raw.gender ?? 0,
    combined_credits: {
      cast: (raw.combined_credits?.cast ?? []).map(trimCastCredit),
      crew: (raw.combined_credits?.crew ?? []).map(trimCrewCredit),
    },
    images: {
      profiles: (raw.images?.profiles ?? []).map((img) => ({
        file_path: img.file_path,
        aspect_ratio: img.aspect_ratio,
        width: img.width,
        height: img.height,
        iso_639_1: img.iso_639_1 ?? null,
        vote_average: img.vote_average ?? 0,
      })),
    },
    external_ids: {
      imdb_id: raw.external_ids?.imdb_id ?? null,
      facebook_id: raw.external_ids?.facebook_id ?? null,
      instagram_id: raw.external_ids?.instagram_id ?? null,
      tiktok_id: raw.external_ids?.tiktok_id ?? null,
      twitter_id: raw.external_ids?.twitter_id ?? null,
      youtube_id: raw.external_ids?.youtube_id ?? null,
      wikidata_id: raw.external_ids?.wikidata_id ?? null,
    },
  };
}

function trimCastCredit(credit: TmdbPersonCredit): PersonCombinedCastCredit {
  return {
    id: credit.id,
    media_type: credit.media_type,
    title: credit.title,
    release_date: credit.release_date,
    name: credit.name,
    first_air_date: credit.first_air_date,
    episode_count: credit.episode_count,
    poster_path: credit.poster_path ?? null,
    backdrop_path: credit.backdrop_path ?? null,
    vote_average: credit.vote_average ?? 0,
    vote_count: credit.vote_count ?? 0,
    popularity: credit.popularity ?? 0,
    genre_ids: credit.genre_ids,
    adult: credit.adult ?? false,
    character: credit.character,
    credit_id: credit.credit_id,
    order: credit.order,
  };
}

function trimCrewCredit(credit: TmdbPersonCredit): PersonCombinedCrewCredit {
  return {
    id: credit.id,
    media_type: credit.media_type,
    title: credit.title,
    release_date: credit.release_date,
    name: credit.name,
    first_air_date: credit.first_air_date,
    episode_count: credit.episode_count,
    poster_path: credit.poster_path ?? null,
    backdrop_path: credit.backdrop_path ?? null,
    vote_average: credit.vote_average ?? 0,
    vote_count: credit.vote_count ?? 0,
    popularity: credit.popularity ?? 0,
    genre_ids: credit.genre_ids,
    adult: credit.adult ?? false,
    job: credit.job ?? "",
    department: credit.department ?? "",
    credit_id: credit.credit_id,
  };
}

/**
 * Single-row JSONB upsert — no child-table churn. Also refreshes the cheap
 * scalar columns search/autocomplete read (name, profile, known-for) plus
 * popularity (no index on it; the nightly sync's thresholding is about
 * avoiding row rewrites, and this row is being rewritten anyway).
 */
async function upsertPersonDetails(tmdbId: number, details: PersonDetailsPayload): Promise<void> {
  const json = details as unknown as Prisma.InputJsonValue;
  const now = new Date();
  await prisma.person.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      name: details.name,
      profilePath: details.profile_path,
      knownFor: details.known_for_department || null,
      popularity: details.popularity,
      gender: details.gender,
      details: json,
      detailsUpdatedAt: now,
    },
    update: {
      name: details.name,
      profilePath: details.profile_path,
      knownFor: details.known_for_department || null,
      popularity: details.popularity,
      gender: details.gender,
      details: json,
      detailsUpdatedAt: now,
    },
  });
}

// =============================================================================
// Guards
// =============================================================================

/**
 * Minimal shape check for the stored JSONB (it's our own write, but a corrupt
 * or hand-edited value must fall back to the TMDB path, not crash the render).
 */
function isPersonDetailsPayload(value: unknown): value is PersonDetailsPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.name === "string" &&
    typeof v.combined_credits === "object" &&
    v.combined_credits !== null
  );
}
