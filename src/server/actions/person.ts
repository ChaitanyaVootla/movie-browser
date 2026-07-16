"use server";

import { z } from "zod";
import {
  getPersonDetails,
  getPersonBasicInfo,
  searchPerson as searchPersonTMDB,
  type PersonSearchResult,
} from "@/server/services/tmdb";
import type { Person } from "@/types";

const GetPersonSchema = z.object({
  id: z.number().positive(),
});

const SearchPersonSchema = z.object({
  query: z.string().min(1).max(100),
});

/**
 * Best-effort write-back of TMDB person detail fields into the `persons` table.
 *
 * WHY: person pages read live from TMDB and never persisted these fields, so
 * `persons.biography/birthday/deathday/place_of_birth/gender` were 100% NULL —
 * which left the PG-only person `.md` twin (and any future PG person read)
 * sparse. This mirrors the movie/series hydration write-back: the TMDB call
 * already happened for the HTML render, so we opportunistically persist it.
 * Fire-and-forget (never awaited) → does NOT block the render or break ISR;
 * a single indexed-row upsert, bounded by the person page's ISR revalidation.
 * Popularity is create-only (credit upserts own it with max-value logic).
 */
async function persistPersonDetails(data: Record<string, unknown>): Promise<void> {
  try {
    const tmdbId = data.id;
    if (typeof tmdbId !== "number" || tmdbId <= 0) return;
    const name = data.name;
    if (typeof name !== "string" || !name) return;

    const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
    const toDate = (v: unknown): Date | null => {
      if (typeof v !== "string" || !v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const detail = {
      name,
      biography: str(data.biography),
      birthday: toDate(data.birthday),
      deathday: toDate(data.deathday),
      placeOfBirth: str(data.place_of_birth),
      gender: typeof data.gender === "number" ? data.gender : null,
      homepage: str(data.homepage),
      knownFor: str(data.known_for_department),
      profilePath: str(data.profile_path),
    };

    const { prisma } = await import("@/server/db/postgres");
    await prisma.person.upsert({
      where: { tmdbId },
      create: {
        tmdbId,
        ...detail,
        popularity: typeof data.popularity === "number" ? data.popularity : null,
      },
      update: detail,
    });
  } catch {
    // best-effort; a persistence failure must never affect the person page
  }
}

/**
 * Get full person details including credits, images, and external IDs
 */
export async function getPerson(id: number): Promise<Person | null> {
  try {
    const validated = GetPersonSchema.parse({ id });
    const data = await getPersonDetails(validated.id);

    if (!data || !data.id) {
      return null;
    }

    // Opportunistically persist detail fields to PG (fire-and-forget) so the
    // PG-only person `.md` twin fills in organically as pages are visited.
    void persistPersonDetails(data);

    // Transform TMDB response to our Person type
    return {
      id: data.id as number,
      name: data.name as string,
      biography: (data.biography as string) || "",
      birthday: data.birthday as string | null,
      deathday: data.deathday as string | null,
      place_of_birth: data.place_of_birth as string | null,
      profile_path: data.profile_path as string | null,
      homepage: data.homepage as string | null,
      imdb_id: data.imdb_id as string | null,
      popularity: data.popularity as number,
      known_for_department: data.known_for_department as string,
      also_known_as: data.also_known_as as string[] | undefined,
      gender: data.gender as number,
      movie_credits: data.movie_credits as Person["movie_credits"],
      tv_credits: data.tv_credits as Person["tv_credits"],
      combined_credits: data.combined_credits as Person["combined_credits"],
      images: data.images as Person["images"],
      external_ids: data.external_ids as Person["external_ids"],
      tagged_images: data.tagged_images as Person["tagged_images"],
    };
  } catch (error) {
    console.error("Error fetching person:", error);
    return null;
  }
}

/**
 * Search for people (actors, directors, etc.)
 */
export async function searchPerson(query: string): Promise<PersonSearchResult[]> {
  try {
    const validated = SearchPersonSchema.parse({ query });
    const data = await searchPersonTMDB(validated.query.trim());
    return data.results.slice(0, 10); // Limit to 10 results for autocomplete
  } catch (error) {
    console.error("Error searching person:", error);
    return [];
  }
}

/**
 * Get minimal person info by ID (for displaying filter pills)
 * Uses lightweight TMDB endpoint without credits/images
 */
export async function getPersonBasic(id: number): Promise<{ id: number; name: string } | null> {
  const data = await getPersonBasicInfo(id);
  if (!data) return null;
  return { id: data.id, name: data.name };
}
