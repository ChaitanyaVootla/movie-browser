/**
 * Ratings & Scraped Watch Links Upserts
 *
 * Split out of shared-upserts.ts (file size limit). Both are "never delete"
 * upserts: existing rows are preserved when Lambda fails to return data, and
 * unchanged rows are skipped entirely (change-detection, June 2026).
 */

import type { MediaType, EnrichedRatings, ScrapedWatchLink } from "../../types";
import type { PrismaTx } from "./types";

// =============================================================================
// Data Source Helper
// =============================================================================

const sourceNames: Record<string, string> = {
  tmdb: "TMDB",
  imdb: "IMDb",
  rt_critic: "Rotten Tomatoes (Critics)",
  rt_audience: "Rotten Tomatoes (Audience)",
  metacritic: "Metacritic",
  letterboxd: "Letterboxd",
  google: "Google",
};

export async function getOrCreateSource(tx: PrismaTx, slug: string): Promise<number> {
  const source = await tx.dataSource.upsert({
    where: { slug },
    create: { slug, name: sourceNames[slug] || slug, providesRatings: true },
    update: {},
  });

  return source.id;
}

// =============================================================================
// Ratings
// =============================================================================

/**
 * Upsert ratings - UPDATE existing or CREATE new, but NEVER delete existing
 *
 * This ensures that if Lambda fails to return a rating (e.g., Google), the
 * existing one is preserved instead of being deleted.
 */
export async function upsertRatings(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  tmdb: { vote_average: number; vote_count: number },
  enrichedRatings: EnrichedRatings | null
): Promise<void> {
  // DO NOT delete existing ratings - we want to preserve them if Lambda doesn't return new ones
  // Instead, upsert each rating individually

  const baseData = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  console.log(`[Hydration/Postgres] Upserting ratings for ${mediaType} ${mediaId}:`);

  // Change-detection: fetch existing ratings once and skip per-source upserts
  // when stored values already match — the upsert's `updatedAt: new Date()`
  // otherwise writes a dead row per source on every refresh.
  const existingRatings = await tx.rating.findMany({
    where: mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId },
    select: {
      score: true,
      voteCount: true,
      certified: true,
      consensus: true,
      sentiment: true,
      sourceUrl: true,
      source: { select: { slug: true } },
    },
  });
  const existingBySlug = new Map(existingRatings.map((r) => [r.source.slug, r]));
  const ratingUnchanged = (
    slug: string,
    next: {
      score?: number | null;
      voteCount?: number | null;
      certified?: boolean | null;
      consensus?: string | null;
      sentiment?: string | null;
      sourceUrl?: string | null;
    }
  ): boolean => {
    const ex = existingBySlug.get(slug);
    if (!ex) return false;
    return (
      ex.score === (next.score ?? null) &&
      (ex.voteCount ?? null) === (next.voteCount ?? null) &&
      (ex.certified ?? null) === (next.certified ?? null) &&
      (ex.consensus ?? null) === (next.consensus ?? null) &&
      (ex.sentiment ?? null) === (next.sentiment ?? null) &&
      (ex.sourceUrl ?? null) === (next.sourceUrl ?? null)
    );
  };

  // TMDB rating (always available)
  if (tmdb.vote_average > 0 && !ratingUnchanged("tmdb", { score: tmdb.vote_average, voteCount: tmdb.vote_count })) {
    const sourceId = await getOrCreateSource(tx, "tmdb");
    console.log(`  → TMDB: ${tmdb.vote_average} (${tmdb.vote_count} votes)`);
    await tx.rating.upsert({
      where:
        mediaType === "movie"
          ? { movieId_sourceId: { movieId: mediaId, sourceId } }
          : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
      create: {
        ...baseData,
        sourceId,
        score: tmdb.vote_average,
        voteCount: tmdb.vote_count,
      },
      update: {
        score: tmdb.vote_average,
        voteCount: tmdb.vote_count,
        updatedAt: new Date(),
      },
    });
  }

  // Enriched ratings - only upsert what we have, preserve existing for sources we don't have
  if (enrichedRatings) {
    // IMDb
    if (enrichedRatings.imdb?.score && !ratingUnchanged("imdb", enrichedRatings.imdb)) {
      const sourceId = await getOrCreateSource(tx, "imdb");
      console.log(
        `  → IMDb: ${enrichedRatings.imdb.score} (${enrichedRatings.imdb.voteCount ?? "N/A"} votes)`
      );
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.imdb.score,
          voteCount: enrichedRatings.imdb.voteCount ?? null,
          sourceUrl: enrichedRatings.imdb.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.imdb.score,
          voteCount: enrichedRatings.imdb.voteCount ?? null,
          sourceUrl: enrichedRatings.imdb.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // RT Critic
    if (enrichedRatings.rtCritic?.score && !ratingUnchanged("rt_critic", enrichedRatings.rtCritic)) {
      const sourceId = await getOrCreateSource(tx, "rt_critic");
      console.log(
        `  → RT Critic: ${enrichedRatings.rtCritic.score}% (certified: ${enrichedRatings.rtCritic.certified ?? "N/A"})`
      );
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.rtCritic.score,
          voteCount: enrichedRatings.rtCritic.voteCount ?? null,
          certified: enrichedRatings.rtCritic.certified ?? null,
          consensus: enrichedRatings.rtCritic.consensus ?? null,
          sentiment: enrichedRatings.rtCritic.sentiment ?? null,
          sourceUrl: enrichedRatings.rtCritic.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.rtCritic.score,
          voteCount: enrichedRatings.rtCritic.voteCount ?? null,
          certified: enrichedRatings.rtCritic.certified ?? null,
          consensus: enrichedRatings.rtCritic.consensus ?? null,
          sentiment: enrichedRatings.rtCritic.sentiment ?? null,
          sourceUrl: enrichedRatings.rtCritic.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // RT Audience
    if (
      enrichedRatings.rtAudience?.score &&
      !ratingUnchanged("rt_audience", enrichedRatings.rtAudience)
    ) {
      const sourceId = await getOrCreateSource(tx, "rt_audience");
      console.log(`  → RT Audience: ${enrichedRatings.rtAudience.score}%`);
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.rtAudience.score,
          voteCount: enrichedRatings.rtAudience.voteCount ?? null,
          certified: enrichedRatings.rtAudience.certified ?? null,
          sentiment: enrichedRatings.rtAudience.sentiment ?? null,
        },
        update: {
          score: enrichedRatings.rtAudience.score,
          voteCount: enrichedRatings.rtAudience.voteCount ?? null,
          certified: enrichedRatings.rtAudience.certified ?? null,
          sentiment: enrichedRatings.rtAudience.sentiment ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // Metacritic
    if (
      enrichedRatings.metacritic?.score &&
      !ratingUnchanged("metacritic", enrichedRatings.metacritic)
    ) {
      const sourceId = await getOrCreateSource(tx, "metacritic");
      console.log(`  → Metacritic: ${enrichedRatings.metacritic.score}`);
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.metacritic.score,
          voteCount: enrichedRatings.metacritic.voteCount ?? null,
          sourceUrl: enrichedRatings.metacritic.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.metacritic.score,
          voteCount: enrichedRatings.metacritic.voteCount ?? null,
          sourceUrl: enrichedRatings.metacritic.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // Letterboxd
    if (
      enrichedRatings.letterboxd?.score &&
      !ratingUnchanged("letterboxd", enrichedRatings.letterboxd)
    ) {
      const sourceId = await getOrCreateSource(tx, "letterboxd");
      console.log(`  → Letterboxd: ${enrichedRatings.letterboxd.score}`);
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.letterboxd.score,
          voteCount: enrichedRatings.letterboxd.voteCount ?? null,
          sourceUrl: enrichedRatings.letterboxd.sourceUrl ?? null,
        },
        update: {
          score: enrichedRatings.letterboxd.score,
          voteCount: enrichedRatings.letterboxd.voteCount ?? null,
          sourceUrl: enrichedRatings.letterboxd.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      });
    }

    // Google
    if (enrichedRatings.google?.score && !ratingUnchanged("google", enrichedRatings.google)) {
      const sourceId = await getOrCreateSource(tx, "google");
      console.log(`  → Google: ${enrichedRatings.google.score}%`);
      await tx.rating.upsert({
        where:
          mediaType === "movie"
            ? { movieId_sourceId: { movieId: mediaId, sourceId } }
            : { seriesId_sourceId: { seriesId: mediaId, sourceId } },
        create: {
          ...baseData,
          sourceId,
          score: enrichedRatings.google.score,
        },
        update: {
          score: enrichedRatings.google.score,
          updatedAt: new Date(),
        },
      });
    }
  }

  console.log(`[Hydration/Postgres] Ratings upsert complete for ${mediaType} ${mediaId}`);
}

// =============================================================================
// Scraped Watch Links
// =============================================================================

/**
 * Upsert scraped deep links, per country.
 *
 * - A link with no `country` is treated as India (the pre-JustWatch Google
 *   scrape was India-only).
 * - `replaceCountries`: countries whose link set the scraper answered for
 *   AUTHORITATIVELY (JustWatch returned a result, even an empty one). For
 *   those, rows not in the new set are deleted — a title that left Netflix
 *   must stop showing a Netflix deep link. Countries NOT listed are never
 *   touched, so a failed/blocked scrape preserves whatever we had.
 */
export async function upsertScrapedWatchLinks(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  links: ScrapedWatchLink[],
  replaceCountries: string[] = []
): Promise<void> {
  const mediaWhereClause = mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId };
  const baseData = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };
  const withCountry = links.map((l) => ({ ...l, country: l.country ?? "IN" }));
  const countries = [...new Set([...withCountry.map((l) => l.country), ...replaceCountries])];
  if (countries.length === 0) return;

  // Change-detection: skip per-link upserts whose stored values already match
  // (the upsert's `updatedAt` write otherwise churns a dead row per link).
  const existingLinks = await tx.scrapedWatchLink.findMany({
    where: { ...mediaWhereClause, countryCode: { in: countries } },
    select: { id: true, providerName: true, link: true, price: true, countryCode: true },
  });
  const keyOf = (country: string, provider: string) => `${country}|${provider}`;
  const existingByKey = new Map(existingLinks.map((l) => [keyOf(l.countryCode, l.providerName), l]));
  const incomingKeys = new Set(withCountry.map((l) => keyOf(l.country, l.provider)));

  const replace = new Set(replaceCountries);
  const stale = existingLinks.filter(
    (l) => replace.has(l.countryCode) && !incomingKeys.has(keyOf(l.countryCode, l.providerName))
  );
  if (stale.length > 0) {
    await tx.scrapedWatchLink.deleteMany({ where: { id: { in: stale.map((l) => l.id) } } });
  }

  let written = 0;
  for (const link of withCountry) {
    const ex = existingByKey.get(keyOf(link.country, link.provider));
    if (ex && ex.link === link.link && (ex.price ?? null) === (link.price || null)) continue;
    written++;
    await tx.scrapedWatchLink.upsert({
      where:
        mediaType === "movie"
          ? {
              movieId_providerName_countryCode: {
                movieId: mediaId,
                providerName: link.provider,
                countryCode: link.country,
              },
            }
          : {
              seriesId_providerName_countryCode: {
                seriesId: mediaId,
                providerName: link.provider,
                countryCode: link.country,
              },
            },
      create: {
        ...baseData,
        providerName: link.provider,
        link: link.link,
        price: link.price || null,
        countryCode: link.country,
      },
      update: { link: link.link, price: link.price || null, updatedAt: new Date() },
    });
  }
  if (written > 0 || stale.length > 0) {
    console.log(
      `[Hydration/Postgres] Watch links ${mediaType} ${mediaId}: ${written} written, ${stale.length} stale removed (${countries.join(",")})`
    );
  }
}
