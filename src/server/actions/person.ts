"use server";

import { z } from "zod";
import {
  getPersonBasicInfo,
  searchPerson as searchPersonTMDB,
  type PersonSearchResult,
} from "@/server/services/tmdb";
import { hydratePerson } from "@/server/services/hydration/person";
import type { Person } from "@/types";

const GetPersonSchema = z.object({
  id: z.number().positive(),
});

const SearchPersonSchema = z.object({
  query: z.string().min(1).max(100),
});

/**
 * Get full person details including credits, images, and external IDs.
 *
 * Serve-stale-then-refresh: PostgreSQL `persons.details` serves the render
 * (never blocks on TMDB when present); only a details miss does one
 * synchronous TMDB fetch. A TMDB 404 lands in the catch below → null → the
 * page's personExists()/notFound() flow handles it, exactly as before.
 *
 * NOTE: movie_credits / tv_credits / tagged_images are no longer fetched or
 * returned — nothing renders them (combined_credits covers the page) and they
 * roughly doubled the TMDB payload. The Person fields stay optional.
 */
export async function getPerson(id: number): Promise<Person | null> {
  try {
    const validated = GetPersonSchema.parse({ id });
    const { data } = await hydratePerson(validated.id);

    if (!data || !data.id) {
      return null;
    }

    // The payload is already TMDB-shaped and trimmed — passthrough to Person.
    return {
      id: data.id,
      name: data.name,
      biography: data.biography,
      birthday: data.birthday,
      deathday: data.deathday,
      place_of_birth: data.place_of_birth,
      profile_path: data.profile_path,
      homepage: data.homepage,
      imdb_id: data.imdb_id,
      popularity: data.popularity,
      known_for_department: data.known_for_department,
      also_known_as: data.also_known_as,
      gender: data.gender,
      combined_credits: data.combined_credits,
      images: data.images,
      external_ids: data.external_ids,
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
