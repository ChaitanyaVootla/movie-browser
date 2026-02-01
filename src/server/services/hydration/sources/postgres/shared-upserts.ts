/**
 * PostgreSQL Shared Upsert Functions
 *
 * Helper functions used by both movie and series upsert operations:
 * - Ratings
 * - External IDs
 * - Videos
 * - Images
 * - Watch providers
 * - Scraped watch links
 * - Reviews
 * - Credits (non-aggregate)
 */

import type {
  MediaType,
  EnrichedRatings,
  EnrichedExternalIds,
  ScrapedWatchLink,
} from "../../types";
import type { TmdbMovieData } from "../tmdb";
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

  // TMDB rating (always available)
  if (tmdb.vote_average > 0) {
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
    if (enrichedRatings.imdb?.score) {
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
    if (enrichedRatings.rtCritic?.score) {
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
    if (enrichedRatings.rtAudience?.score) {
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
    if (enrichedRatings.metacritic?.score) {
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
    if (enrichedRatings.letterboxd?.score) {
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
    if (enrichedRatings.google?.score) {
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
// External IDs
// =============================================================================

export async function upsertExternalIds(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  tmdb: { external_ids?: Record<string, string | number | null>; imdb_id?: string | null },
  enrichedIds: EnrichedExternalIds
): Promise<void> {
  // Delete existing external IDs
  if (mediaType === "movie") {
    await tx.externalId.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.externalId.deleteMany({ where: { seriesId: mediaId } });
  }

  const idsToCreate: Array<{
    movieId: number | null;
    seriesId: number | null;
    source: string;
    externalId: string;
  }> = [];

  const baseId = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  // TMDB external IDs
  const tmdbExtIds = tmdb.external_ids || {};
  const tmdbIdMapping: Record<string, string> = {
    imdb_id: "imdb",
    wikidata_id: "wikidata",
    facebook_id: "facebook",
    instagram_id: "instagram",
    twitter_id: "twitter",
    tvdb_id: "tvdb",
    tvrage_id: "tvrage",
    freebase_mid: "freebase_mid",
    freebase_id: "freebase_id",
  };

  for (const [key, source] of Object.entries(tmdbIdMapping)) {
    const value = tmdbExtIds[key];
    if (value) {
      idsToCreate.push({
        ...baseId,
        source,
        externalId: String(value),
      });
    }
  }

  // Fallback: imdb_id from root level
  if (!tmdbExtIds.imdb_id && tmdb.imdb_id) {
    idsToCreate.push({
      ...baseId,
      source: "imdb",
      externalId: tmdb.imdb_id,
    });
  }

  // Enriched external IDs - explicitly check each known key
  const enrichedIdEntries: Array<[keyof EnrichedExternalIds, string]> = [
    ["rottentomatoes", "rottentomatoes"],
    ["metacritic", "metacritic"],
    ["letterboxd", "letterboxd"],
    ["netflix", "netflix"],
    ["apple", "apple"],
    ["amazon", "amazon"],
    ["hotstar", "hotstar"],
    ["prime", "prime"],
    ["wikidata", "wikidata"],
    ["facebook", "facebook"],
    ["instagram", "instagram"],
    ["twitter", "twitter"],
  ];

  for (const [key, source] of enrichedIdEntries) {
    const value = enrichedIds[key];
    if (value) {
      idsToCreate.push({
        ...baseId,
        source,
        externalId: value,
      });
    }
  }

  if (idsToCreate.length > 0) {
    await tx.externalId.createMany({ data: idsToCreate, skipDuplicates: true });
  }
}

// =============================================================================
// Videos
// =============================================================================

export async function upsertVideos(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  videos: Array<{
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    size?: number;
    published_at?: string;
  }>
): Promise<void> {
  // Delete existing videos
  if (mediaType === "movie") {
    await tx.video.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.video.deleteMany({ where: { seriesId: mediaId } });
  }

  const videosToCreate = videos.map((v) => ({
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
    key: v.key,
    name: v.name,
    site: v.site,
    type: v.type,
    official: v.official,
    size: v.size ?? null,
    publishedAt: v.published_at ? new Date(v.published_at) : null,
  }));

  if (videosToCreate.length > 0) {
    await tx.video.createMany({ data: videosToCreate });
  }
}

// =============================================================================
// Images
// =============================================================================

export async function upsertImages(
  tx: PrismaTx,
  mediaId: number,
  mediaType: MediaType,
  images: {
    backdrops?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
    posters?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
    logos?: Array<{
      file_path: string;
      aspect_ratio?: number;
      width?: number;
      height?: number;
      vote_average?: number;
      vote_count?: number;
      iso_639_1?: string | null;
    }>;
  }
): Promise<void> {
  // Delete existing images
  if (mediaType === "movie") {
    await tx.image.deleteMany({ where: { movieId: mediaId } });
  } else {
    await tx.image.deleteMany({ where: { seriesId: mediaId } });
  }

  const imagesToCreate: Array<{
    movieId: number | null;
    seriesId: number | null;
    filePath: string;
    type: "POSTER" | "BACKDROP" | "LOGO";
    aspectRatio: number | null;
    width: number | null;
    height: number | null;
    voteAverage: number | null;
    voteCount: number | null;
    language: string | null;
  }> = [];

  const baseImage = {
    movieId: mediaType === "movie" ? mediaId : null,
    seriesId: mediaType === "series" ? mediaId : null,
  };

  const addImages = (list: typeof images.backdrops, type: "POSTER" | "BACKDROP" | "LOGO") => {
    for (const img of list || []) {
      imagesToCreate.push({
        ...baseImage,
        filePath: img.file_path,
        type,
        aspectRatio: img.aspect_ratio ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        voteAverage: img.vote_average ?? null,
        voteCount: img.vote_count ?? null,
        language: img.iso_639_1 ?? null,
      });
    }
  };

  addImages(images.backdrops, "BACKDROP");
  addImages(images.posters, "POSTER");
  addImages(images.logos, "LOGO");

  if (imagesToCreate.length > 0) {
    await tx.image.createMany({ data: imagesToCreate });
  }
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

  for (const link of links) {
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

// =============================================================================
// Watch Providers (TMDB)
// =============================================================================

/**
 * Upsert watch providers (TMDB data)
 */
export async function upsertWatchProviders(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  providersByCountry: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{
        provider_id: number;
        provider_name: string;
        logo_path?: string;
        display_priority?: number;
      }>;
      rent?: Array<{
        provider_id: number;
        provider_name: string;
        logo_path?: string;
        display_priority?: number;
      }>;
      buy?: Array<{
        provider_id: number;
        provider_name: string;
        logo_path?: string;
        display_priority?: number;
      }>;
    }
  >
): Promise<void> {
  // Delete existing watch options
  await tx.watchOption.deleteMany({
    where: mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId },
  });

  // Store ALL countries (no limit - TMDB provides 90+ countries)
  for (const [countryCode, data] of Object.entries(providersByCountry)) {
    const types: Array<{ type: "FLATRATE" | "RENT" | "BUY"; providers: typeof data.flatrate }> = [
      { type: "FLATRATE", providers: data.flatrate },
      { type: "RENT", providers: data.rent },
      { type: "BUY", providers: data.buy },
    ];

    for (const { type, providers } of types) {
      for (const provider of providers || []) {
        // Try to find existing provider first (fast, no lock contention)
        let dbProvider = await tx.streamingProvider.findUnique({
          where: { tmdbId: provider.provider_id },
        });

        // Only upsert if provider doesn't exist
        if (!dbProvider) {
          dbProvider = await tx.streamingProvider.upsert({
            where: { tmdbId: provider.provider_id },
            create: {
              tmdbId: provider.provider_id,
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: provider.display_priority || 100,
            },
            update: {
              name: provider.provider_name,
              logoPath: provider.logo_path,
              priority: provider.display_priority || 100,
            },
          });
        }

        // Create watch option using DB ID
        await tx.watchOption
          .create({
            data: {
              movieId: mediaType === "movie" ? mediaId : null,
              seriesId: mediaType === "series" ? mediaId : null,
              providerId: dbProvider.id,
              type,
              countryCode,
              link: data.link,
            },
          })
          .catch(() => {
            // Ignore duplicates
          });
      }
    }
  }
}

// =============================================================================
// Reviews
// =============================================================================

/**
 * Upsert reviews from TMDB
 */
export async function upsertReviews(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  reviews: TmdbMovieData["reviews"]["results"]
): Promise<void> {
  if (!reviews.length) return;

  // Get or create TMDB data source
  const tmdbSource = await tx.dataSource.upsert({
    where: { slug: "tmdb" },
    create: {
      slug: "tmdb",
      name: "TMDB",
      baseUrl: "https://www.themoviedb.org",
      providesReviews: true,
    },
    update: {},
  });

  // Delete existing TMDB reviews for this item
  if (mediaType === "movie") {
    await tx.review.deleteMany({
      where: { movieId: mediaId, sourceId: tmdbSource.id },
    });
  } else {
    await tx.review.deleteMany({
      where: { seriesId: mediaId, sourceId: tmdbSource.id },
    });
  }

  // Insert new reviews (use externalId for deduplication)
  for (const review of reviews) {
    await tx.review
      .create({
        data: {
          movieId: mediaType === "movie" ? mediaId : null,
          seriesId: mediaType === "series" ? mediaId : null,
          sourceId: tmdbSource.id,
          reviewType: "user",
          externalId: review.id, // TMDB review ID for uniqueness
          content: review.content,
          authorName: review.author_details?.name || review.author,
          authorUrl: review.author_details?.username
            ? `https://www.themoviedb.org/u/${review.author_details.username}`
            : null,
          authorImage: review.author_details?.avatar_path
            ? `https://image.tmdb.org/t/p/w45${review.author_details.avatar_path}`
            : null,
          score: review.author_details?.rating ?? null,
          reviewUrl: review.url,
          reviewDate: review.created_at ? new Date(review.created_at) : null,
          scrapedAt: new Date(),
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}

// =============================================================================
// Credits (Non-Aggregate)
// =============================================================================

/**
 * Upsert credits (cast and crew) - NON-AGGREGATE version
 *
 * Stores ALL cast and ALL crew members (no arbitrary limits).
 * For series: This stores the "regular" credits (main cast), NOT aggregate_credits.
 * The isAggregate flag allows UI to choose which to display.
 */
export async function upsertCredits(
  tx: PrismaTx,
  mediaId: number,
  mediaType: "movie" | "series",
  credits: { cast?: Array<any>; crew?: Array<any> }
): Promise<void> {
  // Delete existing non-aggregate credits only
  if (mediaType === "movie") {
    await tx.credit.deleteMany({ where: { movieId: mediaId } });
  } else {
    // For series: only delete non-aggregate credits (preserve aggregate)
    await tx.credit.deleteMany({ where: { seriesId: mediaId, isAggregate: false } });
  }

  const allCredits: Array<{
    personId: number;
    name: string;
    profilePath: string | null;
    knownFor: string | null;
    popularity: number | null;
    creditType: "CAST" | "CREW";
    character?: string;
    job?: string;
    department?: string;
    order?: number;
  }> = [];

  // Process ALL cast
  for (const cast of credits.cast || []) {
    allCredits.push({
      personId: cast.id,
      name: cast.name,
      profilePath: cast.profile_path,
      knownFor: cast.known_for_department,
      popularity: cast.popularity ?? null,
      creditType: "CAST",
      character: cast.character,
      order: cast.order,
    });
  }

  // Process ALL crew (no job filter - store everything)
  for (const crew of credits.crew || []) {
    allCredits.push({
      personId: crew.id,
      name: crew.name,
      profilePath: crew.profile_path,
      knownFor: crew.known_for_department,
      popularity: crew.popularity ?? null,
      creditType: "CREW",
      job: crew.job,
      department: crew.department,
    });
  }

  // Upsert persons and create credits (no limit - store everything)
  for (const credit of allCredits) {
    // Try to find existing person first (fast, no lock contention)
    let dbPerson = await tx.person.findUnique({
      where: { tmdbId: credit.personId },
    });

    if (!dbPerson) {
      // Create new person
      dbPerson = await tx.person.upsert({
        where: { tmdbId: credit.personId },
        create: {
          tmdbId: credit.personId,
          name: credit.name,
          profilePath: credit.profilePath,
          knownFor: credit.knownFor,
          popularity: credit.popularity,
        },
        update: {
          name: credit.name,
          profilePath: credit.profilePath,
          knownFor: credit.knownFor,
          popularity: credit.popularity,
        },
      });
    } else if (credit.popularity != null && (dbPerson.popularity == null || credit.popularity > dbPerson.popularity)) {
      // Update popularity if we have a higher value (person popularity can vary by movie context)
      await tx.person.update({
        where: { id: dbPerson.id },
        data: { popularity: credit.popularity },
      });
    }

    // Create credit using DB ID (non-aggregate)
    await tx.credit
      .create({
        data: {
          movieId: mediaType === "movie" ? mediaId : null,
          seriesId: mediaType === "series" ? mediaId : null,
          personId: dbPerson.id,
          creditType: credit.creditType,
          character: credit.character,
          job: credit.job,
          department: credit.department,
          creditOrder: credit.order,
          isAggregate: false,
        },
      })
      .catch(() => {
        // Ignore duplicates
      });
  }
}
