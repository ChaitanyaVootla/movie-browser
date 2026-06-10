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
        },
        update: {
          score: enrichedRatings.letterboxd.score,
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
 * Upsert scraped watch links - UPDATE existing or CREATE new, but NEVER delete existing
 *
 * This ensures that if Lambda fails to return watch links, the existing ones are preserved.
 */
export async function upsertScrapedWatchLinks(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  links: ScrapedWatchLink[]
): Promise<void> {
  // DO NOT delete existing links - preserve them if Lambda doesn't return new ones
  // Only upsert the links we have

  if (links.length === 0) {
    console.log(`[Hydration/Postgres] No watch links to upsert for ${mediaType} ${mediaId}`);
    return;
  }

  console.log(
    `[Hydration/Postgres] Upserting ${links.length} watch links for ${mediaType} ${mediaId}:`
  );

  const baseData = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  const countryCode = "IN"; // Scraped links are currently India-only

  // Change-detection: skip per-link upserts whose stored values already match
  // (the upsert's `updatedAt` write otherwise churns a dead row per link).
  const existingLinks = await tx.scrapedWatchLink.findMany({
    where: {
      ...(mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId }),
      countryCode,
    },
    select: { providerName: true, link: true, price: true },
  });
  const existingByProvider = new Map(existingLinks.map((l) => [l.providerName, l]));

  for (const link of links) {
    const ex = existingByProvider.get(link.provider);
    if (ex && ex.link === link.link && (ex.price ?? null) === (link.price || null)) {
      continue;
    }
    console.log(`  → ${link.provider}: ${link.link} (${link.price || "Free"})`);

    try {
      await tx.scrapedWatchLink.upsert({
        where:
          mediaType === "movie"
            ? {
                movieId_providerName_countryCode: {
                  movieId: mediaId,
                  providerName: link.provider,
                  countryCode,
                },
              }
            : {
                seriesId_providerName_countryCode: {
                  seriesId: mediaId,
                  providerName: link.provider,
                  countryCode,
                },
              },
        create: {
          ...baseData,
          providerName: link.provider,
          link: link.link,
          price: link.price || null,
          countryCode,
        },
        update: {
          link: link.link,
          price: link.price || null,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Log but don't fail - some links might have issues
      console.warn(`[Hydration/Postgres] Failed to upsert watch link ${link.provider}:`, error);
    }
  }

  console.log(`[Hydration/Postgres] Watch links upsert complete for ${mediaType} ${mediaId}`);
}

