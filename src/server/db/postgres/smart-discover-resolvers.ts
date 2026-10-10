/**
 * Name → id resolvers for the smart_discover tool input (genres, keywords,
 * people, streaming providers). Split out of smart-discover.ts (800-line
 * limit); re-exported from there, so existing imports keep working.
 */
import { prisma } from "./index";

/**
 * Get genre IDs by names (for tool input processing)
 */
export async function resolveGenreIds(
  names: string[],
  mediaType: "movie" | "series"
): Promise<{ found: { name: string; id: number }[]; notFound: string[] }> {
  const found: { name: string; id: number }[] = [];
  const notFound: string[] = [];

  // Get all genres from database
  const allGenres = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM genres
  `;

  const genreMap = new Map(allGenres.map((g) => [g.name.toLowerCase(), g.id]));

  for (const name of names) {
    const normalizedName = name.toLowerCase();

    // Try exact match first
    if (genreMap.has(normalizedName)) {
      found.push({ name, id: genreMap.get(normalizedName)! });
      continue;
    }

    // Try partial match
    const partialMatch = allGenres.find(
      (g) =>
        g.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(g.name.toLowerCase())
    );

    if (partialMatch) {
      found.push({ name, id: partialMatch.id });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get keyword IDs by names (fuzzy matching)
 */
export async function resolveKeywordIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const results = await prisma.$queryRaw<{ id: number; name: string; similarity: number }[]>`
      SELECT id, name, similarity(LOWER(name), LOWER(${name})) as similarity
      FROM keywords
      WHERE LOWER(name) % LOWER(${name})
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (results[0]) {
      found.push({ name, id: results[0].id, matchedName: results[0].name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get person IDs by names (fuzzy matching)
 */
export async function resolvePersonIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const results = await prisma.$queryRaw<{ id: number; name: string; similarity: number }[]>`
      SELECT id, name, similarity(LOWER(name), LOWER(${name})) as similarity
      FROM persons
      WHERE LOWER(name) % LOWER(${name})
      ORDER BY similarity DESC, popularity DESC
      LIMIT 1
    `;

    if (results[0]) {
      found.push({ name, id: results[0].id, matchedName: results[0].name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}

/**
 * Get streaming provider IDs by names
 */
export async function resolveProviderIds(
  names: string[]
): Promise<{ found: { name: string; id: number; matchedName: string }[]; notFound: string[] }> {
  const found: { name: string; id: number; matchedName: string }[] = [];
  const notFound: string[] = [];

  const allProviders = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM streaming_providers
  `;

  for (const name of names) {
    const normalizedName = name.toLowerCase();

    const match = allProviders.find(
      (p) =>
        p.name.toLowerCase() === normalizedName ||
        p.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(p.name.toLowerCase())
    );

    if (match) {
      found.push({ name, id: match.id, matchedName: match.name });
    } else {
      notFound.push(name);
    }
  }

  return { found, notFound };
}
