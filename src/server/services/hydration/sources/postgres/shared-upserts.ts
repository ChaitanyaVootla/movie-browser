/**
 * PostgreSQL Shared Upsert Functions
 *
 * Helper functions used by both movie and series upsert operations:
 * - External IDs
 * - Videos
 * - Images
 * - Watch providers
 * - Reviews
 * - Credits (non-aggregate)
 *
 * All child collections are reconciled DIFF-BASED (June 2026): existing rows
 * are loaded once, matched against incoming rows by natural key
 * (`diffChildRows` in ./diff-reconcile), and only the delta is written —
 * insert new, update changed, delete removed. When nothing changed (the
 * overwhelmingly common case for TMDB data), ZERO writes happen. The previous
 * delete+reinsert-everything pattern produced ~387k deletes/day at crawler
 * scale, starved autovacuum, and bloated tables to 100x their live size.
 */

import { dataLogger } from "@/lib/logger";
import type { MediaType, EnrichedExternalIds } from "../../types";
import type { TmdbMovieData } from "../tmdb";
import type { PrismaTx } from "./types";
import { dedupeBy } from "./upsert-diff";
import {
  diffChildRows,
  hasChanges,
  floatEq3,
  sameDate,
  type ChildRowDiff,
} from "./diff-reconcile";

// =============================================================================
// Shared helpers
// =============================================================================

function mediaWhere(
  mediaId: number,
  mediaType: MediaType
): { movieId: number } | { seriesId: number } {
  return mediaType === "movie" ? { movieId: mediaId } : { seriesId: mediaId };
}

/** Observability: every actual child-table write is logged with delta counts. */
function logChildReconcile(
  table: string,
  mediaType: string,
  mediaId: number,
  diff: ChildRowDiff<unknown, unknown>
): void {
  dataLogger.debug(
    {
      table,
      mediaType,
      mediaId,
      inserted: diff.toInsert.length,
      updated: diff.toUpdate.length,
      deleted: diff.toDelete.length,
    },
    "hydration: child rows changed, reconciling"
  );
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

  // The (movieId|seriesId, source) unique constraint + skipDuplicates keeps the
  // first row per source — mirror that before diffing against existing rows.
  const deduped = dedupeBy(idsToCreate, (r) => r.source);

  const existing = await tx.externalId.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: { id: true, source: true, externalId: true },
  });

  const diff = diffChildRows(
    existing,
    deduped,
    (r) => r.source,
    (a, b) => a.externalId === b.externalId
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("external_ids", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.externalId.deleteMany({
      where: { id: { in: diff.toDelete.map((r) => r.id) } },
    });
  }
  for (const { existing: row, incoming } of diff.toUpdate) {
    await tx.externalId.update({
      where: { id: row.id },
      data: { externalId: incoming.externalId },
    });
  }
  if (diff.toInsert.length > 0) {
    await tx.externalId.createMany({ data: diff.toInsert, skipDuplicates: true });
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

  // The (movieId|seriesId, key) unique constraint allows one row per video key.
  const deduped = dedupeBy(videosToCreate, (v) => v.key);

  const existing = await tx.video.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      id: true,
      key: true,
      name: true,
      site: true,
      type: true,
      official: true,
      size: true,
      publishedAt: true,
    },
  });

  const diff = diffChildRows(
    existing,
    deduped,
    (r) => r.key,
    (a, b) =>
      a.name === b.name &&
      a.site === b.site &&
      a.type === b.type &&
      a.official === b.official &&
      a.size === b.size &&
      sameDate(a.publishedAt, b.publishedAt)
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("videos", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.video.deleteMany({ where: { id: { in: diff.toDelete.map((r) => r.id) } } });
  }
  // Update only TMDB-owned fields — preserves YouTube engagement columns
  // (viewCount, topComments, …) that are fetched separately.
  for (const { existing: row, incoming } of diff.toUpdate) {
    await tx.video.update({
      where: { id: row.id },
      data: {
        name: incoming.name,
        site: incoming.site,
        type: incoming.type,
        official: incoming.official,
        size: incoming.size,
        publishedAt: incoming.publishedAt,
      },
    });
  }
  if (diff.toInsert.length > 0) {
    await tx.video.createMany({ data: diff.toInsert, skipDuplicates: true });
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

  const existing = await tx.image.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      id: true,
      filePath: true,
      type: true,
      aspectRatio: true,
      width: true,
      height: true,
      voteAverage: true,
      voteCount: true,
      language: true,
    },
  });

  // No unique constraint on images — duplicates are matched as a multiset
  // (diffChildRows pairs the Nth incoming duplicate with the Nth existing).
  // Float fields (aspectRatio, voteAverage) compare with 3-decimal tolerance:
  // TMDB re-jitters them constantly without meaningful change.
  const diff = diffChildRows(
    existing,
    imagesToCreate,
    (r) => `${r.type}|${r.filePath}`,
    (a, b) =>
      floatEq3(a.aspectRatio, b.aspectRatio) &&
      a.width === b.width &&
      a.height === b.height &&
      floatEq3(a.voteAverage, b.voteAverage) &&
      a.voteCount === b.voteCount &&
      a.language === b.language
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("images", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.image.deleteMany({ where: { id: { in: diff.toDelete.map((r) => r.id) } } });
  }
  for (const { existing: row, incoming } of diff.toUpdate) {
    await tx.image.update({
      where: { id: row.id },
      data: {
        aspectRatio: incoming.aspectRatio,
        width: incoming.width,
        height: incoming.height,
        voteAverage: incoming.voteAverage,
        voteCount: incoming.voteCount,
        language: incoming.language,
      },
    });
  }
  if (diff.toInsert.length > 0) {
    await tx.image.createMany({ data: diff.toInsert });
  }
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
  // Build the flat incoming projection; the (media, provider, country, type)
  // unique constraint collapses duplicates to the first row, so dedupe the
  // same way before diffing against existing rows. Provider metadata rides
  // along for creating streaming_providers rows on insert (not compared).
  const incoming: Array<{
    providerTmdbId: number;
    countryCode: string;
    type: "FLATRATE" | "RENT" | "BUY";
    link: string | null;
    providerName: string;
    providerLogoPath: string | null;
    providerPriority: number;
  }> = [];
  for (const [countryCode, data] of Object.entries(providersByCountry)) {
    for (const { type, providers } of [
      { type: "FLATRATE" as const, providers: data.flatrate },
      { type: "RENT" as const, providers: data.rent },
      { type: "BUY" as const, providers: data.buy },
    ]) {
      for (const provider of providers || []) {
        incoming.push({
          providerTmdbId: provider.provider_id,
          countryCode,
          type,
          link: data.link ?? null,
          providerName: provider.provider_name,
          providerLogoPath: provider.logo_path ?? null,
          providerPriority: provider.display_priority || 100,
        });
      }
    }
  }
  const dedupedIncoming = dedupeBy(
    incoming,
    (r) => `${r.providerTmdbId}|${r.countryCode}|${r.type}`
  );

  const existingRaw = await tx.watchOption.findMany({
    where: mediaWhere(mediaId, mediaType),
    select: {
      id: true,
      countryCode: true,
      type: true,
      link: true,
      provider: { select: { tmdbId: true } },
    },
  });
  const existing = existingRaw.map((r) => ({
    id: r.id,
    providerTmdbId: r.provider.tmdbId,
    countryCode: r.countryCode,
    type: String(r.type),
    link: r.link,
  }));

  const diff = diffChildRows(
    existing,
    dedupedIncoming,
    (r) => `${r.providerTmdbId}|${r.countryCode}|${r.type}`,
    (a, b) => a.link === b.link
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("watch_options", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.watchOption.deleteMany({
      where: { id: { in: diff.toDelete.map((r) => r.id) } },
    });
  }
  for (const { existing: row, incoming: inc } of diff.toUpdate) {
    await tx.watchOption.update({ where: { id: row.id }, data: { link: inc.link } });
  }

  if (diff.toInsert.length > 0) {
    // Resolve provider DB ids; create streaming_providers rows only when
    // missing (existing providers are NOT metadata-refreshed — unchanged
    // behavior from the rewrite era).
    const neededTmdbIds = [...new Set(diff.toInsert.map((r) => r.providerTmdbId))];
    const found = await tx.streamingProvider.findMany({
      where: { tmdbId: { in: neededTmdbIds } },
      select: { id: true, tmdbId: true },
    });
    const providerDbId = new Map(found.map((p) => [p.tmdbId, p.id]));

    for (const row of diff.toInsert) {
      if (providerDbId.has(row.providerTmdbId)) continue;
      const created = await tx.streamingProvider.upsert({
        where: { tmdbId: row.providerTmdbId },
        create: {
          tmdbId: row.providerTmdbId,
          name: row.providerName,
          logoPath: row.providerLogoPath,
          priority: row.providerPriority,
        },
        update: {
          name: row.providerName,
          logoPath: row.providerLogoPath,
          priority: row.providerPriority,
        },
      });
      providerDbId.set(row.providerTmdbId, created.id);
    }

    const data: Array<{
      movieId: number | null;
      seriesId: number | null;
      providerId: number;
      type: "FLATRATE" | "RENT" | "BUY";
      countryCode: string;
      link: string | null;
    }> = [];
    for (const row of diff.toInsert) {
      const providerId = providerDbId.get(row.providerTmdbId);
      if (providerId === undefined) continue; // unreachable: resolved above
      data.push({
        movieId: mediaType === "movie" ? mediaId : null,
        seriesId: mediaType === "series" ? mediaId : null,
        providerId,
        type: row.type,
        countryCode: row.countryCode,
        link: row.link,
      });
    }
    await tx.watchOption.createMany({ data, skipDuplicates: true });
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
  // Quirk preserved: an empty TMDB review list does NOT delete stored reviews.
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

  // Incoming reviews deduped by externalId (the unique constraint enforces it).
  const incoming = dedupeBy(reviews, (r) => r.id).map((review) => ({
    externalId: review.id,
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
  }));

  const existing = await tx.review.findMany({
    where: { ...mediaWhere(mediaId, mediaType), sourceId: tmdbSource.id },
    select: {
      id: true,
      externalId: true,
      content: true,
      authorName: true,
      authorUrl: true,
      authorImage: true,
      score: true,
      reviewUrl: true,
      reviewDate: true,
    },
  });

  const diff = diffChildRows(
    existing,
    incoming,
    (r) => r.externalId ?? "",
    (a, b) =>
      a.content === b.content &&
      a.authorName === b.authorName &&
      a.authorUrl === b.authorUrl &&
      a.authorImage === b.authorImage &&
      floatEq3(a.score, b.score) &&
      a.reviewUrl === b.reviewUrl &&
      sameDate(a.reviewDate, b.reviewDate)
  );
  if (!hasChanges(diff)) return;
  logChildReconcile("reviews", mediaType, mediaId, diff);

  if (diff.toDelete.length > 0) {
    await tx.review.deleteMany({ where: { id: { in: diff.toDelete.map((r) => r.id) } } });
  }
  for (const { existing: row, incoming: inc } of diff.toUpdate) {
    await tx.review.update({
      where: { id: row.id },
      data: {
        content: inc.content,
        authorName: inc.authorName,
        authorUrl: inc.authorUrl,
        authorImage: inc.authorImage,
        score: inc.score,
        reviewUrl: inc.reviewUrl,
        reviewDate: inc.reviewDate,
      },
    });
  }
  if (diff.toInsert.length > 0) {
    await tx.review.createMany({
      data: diff.toInsert.map((inc) => ({
        movieId: mediaType === "movie" ? mediaId : null,
        seriesId: mediaType === "series" ? mediaId : null,
        sourceId: tmdbSource.id,
        reviewType: "user",
        externalId: inc.externalId, // TMDB review ID for uniqueness
        content: inc.content,
        authorName: inc.authorName,
        authorUrl: inc.authorUrl,
        authorImage: inc.authorImage,
        score: inc.score,
        reviewUrl: inc.reviewUrl,
        reviewDate: inc.reviewDate,
        scrapedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }
}

// =============================================================================
// Credits (Non-Aggregate) — split into ./credit-upserts.ts (800-line limit);
// re-exported here so existing importers keep working.
// =============================================================================

export { upsertCredits } from "./credit-upserts";
