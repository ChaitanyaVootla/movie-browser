/**
 * LLM data getters — READ-ONLY PostgreSQL access.
 *
 * COST-SAFETY INVARIANT: every getter here reads ONLY from Postgres. Nothing in
 * this module may trigger hydration, TMDB, enrichment, the ratings/Google
 * Lambda, or the SSE stream. If a row is not already in PG the getter returns
 * null / an empty list and the caller renders a 404. This is what makes the
 * `.md` layer a cost win rather than a repeat of the ClaudeBot bill.
 */

import { prisma } from "@/server/db/postgres";
import { getTopicByKey, THEME_DEFINITIONS, getTopicMetaFromKey } from "@/lib/topics";
import type { DiscoverParams } from "@/lib/discover";

// Re-export the existing safe, read-only getters unchanged.
export { getMovieFromPostgres } from "@/server/db/postgres/movies";
export { getSeriesFromPostgres } from "@/server/db/postgres/series";
export { getAIData } from "@/server/services/ai-data-service";

// =============================================================================
// Types
// =============================================================================

/** A lightweight catalog item for list / topic / browse markdown. */
export interface LlmCardItem {
  id: number;
  mediaType: "movie" | "series";
  title: string;
  /** Release / first-air year, e.g. "2010". */
  year: string | null;
  /** TMDB rating on a 0–10 scale. */
  rating: number | null;
  /** Short overview (trimmed). */
  overview: string | null;
  genres: string[];
}

/** A single filmography entry on a person page. */
export interface LlmPersonCredit {
  /** TMDB id of the title. */
  id: number;
  mediaType: "movie" | "series";
  title: string;
  year: string | null;
  /** Character (cast) or job (crew). */
  role: string | null;
  popularity: number | null;
}

/** PG-only person shape for markdown. All fields sourced from `persons`. */
export interface LlmPerson {
  /** TMDB id (matches the URL). */
  id: number;
  name: string;
  biography: string | null;
  knownFor: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  popularity: number | null;
  homepage: string | null;
  /** Other names this person is credited under. */
  aliases: string[];
  /** Top filmography entries by title popularity. */
  knownForCredits: LlmPersonCredit[];
  /** True when the filmography was truncated (more entries exist on the site). */
  filmographyTruncated: boolean;
}

// =============================================================================
// Person (net-new, PG-only)
// =============================================================================

/** Max raw credits pulled before ranking; caps DB work for prolific people. */
const PERSON_CREDIT_SCAN_LIMIT = 300;
/** Max filmography entries surfaced in markdown. */
const PERSON_CREDIT_OUTPUT_LIMIT = 40;

function toYear(date: Date | null | undefined): string | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  return Number.isFinite(year) ? String(year) : null;
}

/**
 * Read-only person over `prisma.person` (+ credits for a filmography).
 * PG-only — NO TMDB fallback. `personId` is the TMDB id (matches the URL);
 * returns null if the person is not in PG.
 */
export async function getPersonFromPostgres(personId: number): Promise<LlmPerson | null> {
  const person = await prisma.person.findUnique({
    where: { tmdbId: personId },
    select: {
      tmdbId: true,
      name: true,
      biography: true,
      knownFor: true,
      birthday: true,
      deathday: true,
      placeOfBirth: true,
      profilePath: true,
      popularity: true,
      homepage: true,
      aliases: { select: { alias: true }, take: 8 },
      credits: {
        take: PERSON_CREDIT_SCAN_LIMIT,
        select: {
          character: true,
          job: true,
          creditType: true,
          movie: { select: { id: true, title: true, releaseDate: true, popularity: true } },
          series: { select: { id: true, name: true, firstAirDate: true, popularity: true } },
        },
      },
    },
  });

  if (!person) return null;

  // Collapse polymorphic credits into filmography entries, keeping the best role
  // per title, then rank by the title's popularity.
  const byTitle = new Map<string, LlmPersonCredit>();
  for (const c of person.credits) {
    const role = c.creditType === "CAST" ? c.character : c.job;
    if (c.movie) {
      const key = `movie:${c.movie.id}`;
      if (!byTitle.has(key)) {
        byTitle.set(key, {
          id: c.movie.id,
          mediaType: "movie",
          title: c.movie.title,
          year: toYear(c.movie.releaseDate),
          role: role || null,
          popularity: c.movie.popularity,
        });
      }
    } else if (c.series) {
      const key = `series:${c.series.id}`;
      if (!byTitle.has(key)) {
        byTitle.set(key, {
          id: c.series.id,
          mediaType: "series",
          title: c.series.name,
          year: toYear(c.series.firstAirDate),
          role: role || null,
          popularity: c.series.popularity,
        });
      }
    }
  }

  const ranked = [...byTitle.values()].sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)
  );
  const knownForCredits = ranked.slice(0, PERSON_CREDIT_OUTPUT_LIMIT);

  return {
    id: person.tmdbId,
    name: person.name,
    biography: person.biography,
    knownFor: person.knownFor,
    birthday: person.birthday ? person.birthday.toISOString().split("T")[0] : null,
    deathday: person.deathday ? person.deathday.toISOString().split("T")[0] : null,
    placeOfBirth: person.placeOfBirth,
    profilePath: person.profilePath,
    popularity: person.popularity,
    homepage: person.homepage,
    aliases: person.aliases.map((a) => a.alias),
    knownForCredits,
    // Truncated if we hit the output cap OR the raw scan cap (there may be more).
    filmographyTruncated:
      ranked.length > PERSON_CREDIT_OUTPUT_LIMIT ||
      person.credits.length >= PERSON_CREDIT_SCAN_LIMIT,
  };
}

// =============================================================================
// Popular lists (PG-native — NOT the TMDB discover path)
// =============================================================================

/** Normalise a topic's `with_genres` (number | number[]) into an id array. */
function toIdArray(value: number | number[] | undefined): number[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

type MediaTable = "movie" | "series";

/**
 * Shared PG-native popular query. Filters are TMDB-id based (genre/keyword
 * tmdbId, ISO language / country codes) and rank by popularity. Read-only.
 */
async function queryPopular(
  media: MediaTable,
  filters: {
    genreTmdbIds?: number[];
    keywordTmdbIds?: number[];
    originalLanguage?: string;
    originCountry?: string;
  },
  limit: number,
  page = 1
): Promise<LlmCardItem[]> {
  const skip = Math.max(0, (page - 1) * limit);
  const genreWhere = filters.genreTmdbIds?.length
    ? { genres: { some: { genre: { tmdbId: { in: filters.genreTmdbIds } } } } }
    : {};
  const keywordWhere = filters.keywordTmdbIds?.length
    ? { keywords: { some: { keyword: { tmdbId: { in: filters.keywordTmdbIds } } } } }
    : {};
  const languageWhere = filters.originalLanguage
    ? { originalLanguage: filters.originalLanguage }
    : {};
  const countryWhere = filters.originCountry ? { originCountry: { has: filters.originCountry } } : {};

  const where = { ...genreWhere, ...keywordWhere, ...languageWhere, ...countryWhere };

  const ratingsSelect = {
    where: { source: { slug: "tmdb" } },
    select: { score: true },
  } as const;
  const genresSelect = { include: { genre: true } } as const;

  if (media === "movie") {
    const rows = await prisma.movie.findMany({
      where,
      select: {
        id: true,
        title: true,
        overview: true,
        releaseDate: true,
        genres: genresSelect,
        ratings: ratingsSelect,
      },
      orderBy: { popularity: "desc" },
      skip,
      take: limit,
    });
    return rows.map((m) => ({
      id: m.id,
      mediaType: "movie" as const,
      title: m.title,
      year: toYear(m.releaseDate),
      rating: m.ratings[0]?.score ?? null,
      overview: m.overview,
      genres: m.genres.map((g) => g.genre.name),
    }));
  }

  const rows = await prisma.series.findMany({
    where,
    select: {
      id: true,
      name: true,
      overview: true,
      firstAirDate: true,
      genres: genresSelect,
      ratings: ratingsSelect,
    },
    orderBy: { popularity: "desc" },
    skip,
    take: limit,
  });
  return rows.map((s) => ({
    id: s.id,
    mediaType: "series" as const,
    title: s.name,
    year: toYear(s.firstAirDate),
    rating: s.ratings[0]?.score ?? null,
    overview: s.overview,
    genres: s.genres.map((g) => g.genre.name),
  }));
}

/**
 * PG-native popular list for a topic key (genre / country / language / theme).
 * Derives the filter from the topic's `filterParams`. Returns [] for unknown
 * keys. NOT byte-identical to the TMDB-discover HTML lists — acceptable for agents.
 */
export async function getPopularForTopic(
  topicKey: string,
  limit: number,
  page = 1
): Promise<LlmCardItem[]> {
  // `getTopicByKey` covers genre + theme keys; fall back to the full resolver
  // (country / language) which also parses the key.
  const topic = getTopicByKey(topicKey) ?? getTopicMetaFromKey(topicKey, THEME_DEFINITIONS);
  if (!topic) return [];

  const fp: Partial<DiscoverParams> = topic.filterParams;
  const media: MediaTable = fp.media_type === "tv" ? "series" : "movie";

  return queryPopular(
    media,
    {
      genreTmdbIds: toIdArray(fp.with_genres),
      keywordTmdbIds: toIdArray(fp.with_keywords),
      originalLanguage: fp.with_original_language,
      originCountry: fp.with_origin_country,
    },
    limit,
    page
  );
}

/** PG-native popular movies for the /browse page. Read-only. Paginated. */
export async function getPopularBrowse(limit: number, page = 1): Promise<LlmCardItem[]> {
  return queryPopular("movie", {}, limit, page);
}
