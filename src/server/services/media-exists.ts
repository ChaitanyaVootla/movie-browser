/**
 * Lightweight existence checks for movie/series/person detail pages.
 *
 * Detail pages stream a 200 shell via loading.tsx, so the only place a real
 * 404 status can still be produced is generateMetadata (it blocks the first
 * flush). These helpers let generateMetadata call notFound() for IDs that
 * definitively don't exist — without ever turning a transient failure into
 * a (cached!) false 404:
 *
 * - PG hit               → exists (covers ~99% of real traffic, indexed PK)
 * - TMDB 404             → definitively missing
 * - TMDB error / PG down → assume exists (render degrades gracefully as 200)
 */

import { prisma } from "@/server/db/postgres";
import { getMovieDetails, getSeriesDetails, getPersonDetails } from "@/server/services/tmdb";

function isTmdbNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("TMDB API error: 404");
}

async function tmdbExists(fetcher: () => Promise<Record<string, unknown>>): Promise<boolean> {
  try {
    const data = await fetcher();
    return typeof data?.id === "number";
  } catch (error: unknown) {
    return !isTmdbNotFound(error);
  }
}

export async function movieExists(id: number): Promise<boolean> {
  const row = await prisma.movie
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (row) return true;
  // The TMDB response is cached by cache-service, so a hit here warms the
  // cache for the hydration that follows in the same render.
  return tmdbExists(() => getMovieDetails(id));
}

export async function seriesExists(id: number): Promise<boolean> {
  const row = await prisma.series
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (row) return true;
  return tmdbExists(() => getSeriesDetails(id));
}

export async function personExists(tmdbId: number): Promise<boolean> {
  const row = await prisma.person
    .findUnique({ where: { tmdbId }, select: { id: true } })
    .catch(() => null);
  if (row) return true;
  return tmdbExists(() => getPersonDetails(tmdbId));
}
