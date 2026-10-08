/**
 * Opportunistic write-back of TMDB person details to PG (fire-and-forget from
 * the person page render) so the PG-only person `.md` twin fills in as pages
 * are visited (see `.claude/rules/llm-friendly.md`).
 *
 * CHANGE-DETECTED (Oct 2026): it used to `upsert` on EVERY person render, i.e.
 * an UPDATE (new tuple + WAL) even when nothing changed. Now: one indexed read,
 * and a write only when a field actually differs (or the row is missing).
 * Popularity stays create-only — popularity-sync / credit upserts own it.
 */

import { prisma } from "@/server/db/postgres";

export interface PersonDetail {
  name: string;
  biography: string | null;
  birthday: Date | null;
  deathday: Date | null;
  placeOfBirth: string | null;
  gender: number | null;
  homepage: string | null;
  knownFor: string | null;
  profilePath: string | null;
  /** Only present when TMDB sent it — never clobber a backfilled `true`. */
  adult?: boolean;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** TMDB person payload → PG detail fields; null when unusable. */
export function buildPersonDetail(
  data: Record<string, unknown>,
): { tmdbId: number; detail: PersonDetail; popularity: number | null } | null {
  const tmdbId = data.id;
  if (typeof tmdbId !== "number" || tmdbId <= 0) return null;
  const name = data.name;
  if (typeof name !== "string" || !name) return null;
  return {
    tmdbId,
    popularity: typeof data.popularity === "number" ? data.popularity : null,
    detail: {
      name,
      biography: str(data.biography),
      birthday: toDate(data.birthday),
      deathday: toDate(data.deathday),
      placeOfBirth: str(data.place_of_birth),
      gender: typeof data.gender === "number" ? data.gender : null,
      homepage: str(data.homepage),
      knownFor: str(data.known_for_department),
      profilePath: str(data.profile_path),
      ...(typeof data.adult === "boolean" ? { adult: data.adult } : {}),
    },
  };
}

type StoredPerson = Omit<PersonDetail, "adult"> & { adult: boolean };

const sameDate = (a: Date | null, b: Date | null) =>
  a == null || b == null ? a == null && b == null : a.getTime() === b.getTime();

/** The subset of `detail` that differs from the stored row (empty = no write). */
export function changedPersonFields(stored: StoredPerson, detail: PersonDetail): Partial<PersonDetail> {
  const out: Partial<PersonDetail> = {};
  if (stored.name !== detail.name) out.name = detail.name;
  if (stored.biography !== detail.biography) out.biography = detail.biography;
  if (!sameDate(stored.birthday, detail.birthday)) out.birthday = detail.birthday;
  if (!sameDate(stored.deathday, detail.deathday)) out.deathday = detail.deathday;
  if (stored.placeOfBirth !== detail.placeOfBirth) out.placeOfBirth = detail.placeOfBirth;
  if (stored.gender !== detail.gender) out.gender = detail.gender;
  if (stored.homepage !== detail.homepage) out.homepage = detail.homepage;
  if (stored.knownFor !== detail.knownFor) out.knownFor = detail.knownFor;
  if (stored.profilePath !== detail.profilePath) out.profilePath = detail.profilePath;
  if (detail.adult !== undefined && stored.adult !== detail.adult) out.adult = detail.adult;
  return out;
}

/** Best-effort; never throws (a persistence failure must not affect the page). */
export async function persistPersonDetails(data: Record<string, unknown>): Promise<void> {
  try {
    const built = buildPersonDetail(data);
    if (!built) return;
    const { tmdbId, detail, popularity } = built;
    const stored = await prisma.person.findUnique({
      where: { tmdbId },
      select: {
        name: true,
        biography: true,
        birthday: true,
        deathday: true,
        placeOfBirth: true,
        gender: true,
        homepage: true,
        knownFor: true,
        profilePath: true,
        adult: true,
      },
    });
    if (!stored) {
      // skipDuplicates: a concurrent render/credit upsert may create it first.
      await prisma.person.createMany({
        data: [{ tmdbId, ...detail, popularity }],
        skipDuplicates: true,
      });
      return;
    }
    const changes = changedPersonFields(stored, detail);
    if (Object.keys(changes).length === 0) return;
    await prisma.person.update({ where: { tmdbId }, data: changes });
  } catch {
    // best-effort
  }
}
