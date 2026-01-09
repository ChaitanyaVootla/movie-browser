/**
 * Lambda Source for Hydration
 *
 * Calls TWO Lambda functions in parallel for fresh enriched data:
 * 1. puppeteer-node14 (Google Lambda) - Deep watch links, basic ratings
 * 2. movie-ratings-scraper (Ratings Lambda) - Detailed IMDb/RT ratings via Wikidata
 *
 * External ID Resolution Flow:
 * - TMDB provides wikidata_id in external_ids
 * - Ratings Lambda calls Wikidata API to get rottentomatoes_id
 * - RT scraper uses rottentomatoes_id for detailed ratings
 * - If RT ID not in Wikidata, falls back to Google-scraped RT link
 *
 * ✅ KEEP FOREVER - this is the primary enrichment source after MongoDB deprecation
 *
 * Prerequisites:
 *   yarn add @aws-sdk/client-lambda
 *   Set GOOGLE_LAMBDA_ARN and RATINGS_LAMBDA_ARN in environment
 */

import type { EnrichedData, MediaType } from "../types";
import { trackAPICall } from "@/lib/analytics/track";

// =============================================================================
// Configuration (hardcoded - no env vars needed)
// =============================================================================

/** Google scraping lambda - deep watch links, basic ratings */
const GOOGLE_LAMBDA_FN = "puppeteer-node14";

/** Ratings scraping lambda - detailed IMDb/RT via Wikidata */
const RATINGS_LAMBDA_FN = "movie-ratings-scraper";

/** AWS region where lambdas are deployed */
const AWS_REGION = "ap-south-2";

// Lazy load Lambda client to avoid startup cost if not used
let lambdaClient: import("@aws-sdk/client-lambda").LambdaClient | null = null;

async function getLambdaClient() {
  if (!lambdaClient) {
    const { LambdaClient } = await import("@aws-sdk/client-lambda");
    lambdaClient = new LambdaClient({ region: AWS_REGION });
  }
  return lambdaClient;
}

/** Item context for tracking */
interface ItemContext {
  tmdbId: number;
  mediaType: MediaType;
}

// Module-level context for tracking (set by fetchFromLambda)
let currentItemContext: ItemContext | null = null;

/**
 * Track Lambda invocation for analytics
 */
function trackLambdaCall(
  functionName: string,
  startTime: number,
  statusCode: number,
  errorType: string | null,
  errorMessage: string | null
): void {
  try {
    const durationMs = Date.now() - startTime;
    // Include item context in endpoint for filtering (e.g., "puppeteer-node14:movie:550")
    const endpoint = currentItemContext
      ? `${functionName}:${currentItemContext.mediaType}:${currentItemContext.tmdbId}`
      : functionName;
    trackAPICall({
      service: "lambda",
      endpoint,
      method: "INVOKE",
      statusCode,
      durationMs,
      cached: false,
      errorType,
      errorMessage,
    });
  } catch {
    // Don't let tracking errors break Lambda calls
  }
}

// =============================================================================
// Types
// =============================================================================

/** Google Lambda response (puppeteer-node14) */
interface GoogleLambdaResponse {
  ratings?: Array<{ rating: string; name: string; link: string }>;
  allWatchOptions?: Array<{ link: string; name: string; price?: string }>;
  imdbId?: string | null;
  directorName?: string | null;
}

/** Ratings Lambda response (movie-ratings-scraper) */
interface RatingsLambdaResponse {
  ratings?: Array<{ rating: string; name: string; link: string }>;
  allWatchOptions?: Array<{ link: string; name: string; price?: string }>;
  imdbId?: string | null;
  directorName?: string | null;
  externalIds?: {
    imdb_id?: string | null;
    tmdb_id?: string | null;
    rottentomatoes_id?: string | null;
    metacritic_id?: string | null;
    letterboxd_id?: string | null;
    netflix_id?: string | null;
    prime_id?: string | null;
    apple_id?: string | null;
    hotstar_id?: string | null;
  };
  detailedRatings?: {
    imdb?: {
      rating: number | null;
      ratingCount: number | null;
      sourceUrl?: string;
      error?: string | null;
    } | null;
    rottenTomatoes?: {
      critic?: {
        score: number | null;
        ratingCount: number | null;
        certified: boolean | null;
        sentiment: string | null;
        consensus?: string | null;
      } | null;
      audience?: {
        score: number | null;
        ratingCount: number | null;
        certified: boolean | null;
        sentiment: string | null;
        consensus?: string | null;
      } | null;
      sourceUrl?: string;
      error?: string | null;
    } | null;
  };
  debugText?: string;
  googleError?: string;
}

// =============================================================================
// Individual Lambda Callers
// =============================================================================

/**
 * Call Google Lambda (puppeteer-node14) for deep watch links
 */
async function callGoogleLambda(
  searchString: string
): Promise<GoogleLambdaResponse | null> {
  const startTime = Date.now();
  let statusCode = 200;
  let errorType: string | null = null;
  let errorMessage: string | null = null;

  try {
    const client = await getLambdaClient();
    const { InvokeCommand } = await import("@aws-sdk/client-lambda");

    const command = new InvokeCommand({
      FunctionName: GOOGLE_LAMBDA_FN,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        queryStringParameters: {
          searchString,
        },
      }),
    });

    console.log(`[Hydration/Lambda] Calling Google Lambda: ${GOOGLE_LAMBDA_FN}`);
    const response = await client.send(command);

    if (response.FunctionError) {
      console.error("[Hydration/Lambda] Google Lambda error:", response.FunctionError);
      statusCode = 500;
      errorType = "FunctionError";
      errorMessage = response.FunctionError;
      trackLambdaCall(GOOGLE_LAMBDA_FN, startTime, statusCode, errorType, errorMessage);
      return null;
    }

    if (!response.Payload) {
      trackLambdaCall(GOOGLE_LAMBDA_FN, startTime, statusCode, null, null);
      return null;
    }

    const payloadStr = new TextDecoder().decode(response.Payload);
    trackLambdaCall(GOOGLE_LAMBDA_FN, startTime, statusCode, null, null);
    return JSON.parse(payloadStr) as GoogleLambdaResponse;
  } catch (error: any) {
    statusCode = 500;
    errorType = error?.name || "UnknownError";
    errorMessage = error?.message || String(error);

    // Quieter logging for known "not a problem" errors
    if (error?.name === "ResourceNotFoundException") {
      console.warn(`[Hydration/Lambda] Google Lambda not deployed: ${GOOGLE_LAMBDA_FN}`);
    } else if (error?.name === "CredentialsProviderError") {
      console.warn("[Hydration/Lambda] AWS credentials not configured");
    } else {
      console.error("[Hydration/Lambda] Google Lambda failed:", error?.message || error);
    }

    trackLambdaCall(GOOGLE_LAMBDA_FN, startTime, statusCode, errorType, errorMessage);
    return null;
  }
}

/**
 * Call Ratings Lambda (movie-ratings-scraper) for detailed ratings
 */
async function callRatingsLambda(
  searchString: string,
  tmdbId: number,
  imdbId: string | null | undefined,
  wikidataId: string | null | undefined,
  mediaType: "movie" | "tv"
): Promise<RatingsLambdaResponse | null> {
  const startTime = Date.now();
  let statusCode = 200;
  let errorType: string | null = null;
  let errorMessage: string | null = null;

  try {
    const client = await getLambdaClient();
    const { InvokeCommand } = await import("@aws-sdk/client-lambda");

    const command = new InvokeCommand({
      FunctionName: RATINGS_LAMBDA_FN,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        queryStringParameters: {
          searchString,
          tmdbId: String(tmdbId),
          imdbId: imdbId || undefined,
          wikidataId: wikidataId || undefined,
          mediaType,
          // Note: No googleScraperMode - we call Google Lambda separately
        },
      }),
    });

    console.log(`[Hydration/Lambda] Calling Ratings Lambda: ${RATINGS_LAMBDA_FN}`);
    const response = await client.send(command);

    if (response.FunctionError) {
      console.warn("[Hydration/Lambda] Ratings Lambda error:", response.FunctionError);
      statusCode = 500;
      errorType = "FunctionError";
      errorMessage = response.FunctionError;
      trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, errorType, errorMessage);
      return null;
    }

    if (!response.Payload) {
      trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, null, null);
      return null;
    }

    const payloadStr = new TextDecoder().decode(response.Payload);
    const apiGatewayResponse = JSON.parse(payloadStr) as {
      statusCode?: number;
      body?: string;
    };

    // Handle API Gateway response format
    if (apiGatewayResponse.statusCode && apiGatewayResponse.body) {
      statusCode = apiGatewayResponse.statusCode;
      if (apiGatewayResponse.statusCode !== 200) {
        console.error("[Hydration/Lambda] Ratings Lambda non-200:", apiGatewayResponse.statusCode);
        trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, "Non200Response", `Status: ${statusCode}`);
        return null;
      }
      trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, null, null);
      return JSON.parse(apiGatewayResponse.body) as RatingsLambdaResponse;
    }

    // Direct response format
    trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, null, null);
    return apiGatewayResponse as RatingsLambdaResponse;
  } catch (error: any) {
    statusCode = 500;
    errorType = error?.name || "UnknownError";
    errorMessage = error?.message || String(error);

    // Quieter logging for known "not a problem" errors
    if (error?.name === "ResourceNotFoundException") {
      console.warn(`[Hydration/Lambda] Ratings Lambda not deployed: ${RATINGS_LAMBDA_FN}`);
    } else if (error?.name === "CredentialsProviderError") {
      console.warn("[Hydration/Lambda] AWS credentials not configured");
    } else {
      console.error("[Hydration/Lambda] Ratings Lambda failed:", error?.message || error);
    }

    trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, errorType, errorMessage);
    return null;
  }
}

// =============================================================================
// Main Fetcher
// =============================================================================

/**
 * Fetch enriched data from BOTH Lambda functions in parallel
 *
 * @param mediaType - "movie" or "series"
 * @param id - TMDB ID
 * @param tmdbData - TMDB data with title, imdb_id, wikidata_id, release_date
 */
export async function fetchFromLambda(
  mediaType: MediaType,
  id: number,
  tmdbData: {
    title?: string;
    name?: string;
    imdb_id?: string | null;
    release_date?: string | null;
    first_air_date?: string | null;
    external_ids?: {
      wikidata_id?: string | null;
      imdb_id?: string | null;
    };
    original_language?: string;
  }
): Promise<EnrichedData> {
  // Set item context for tracking
  currentItemContext = { tmdbId: id, mediaType };

  try {
    const title = mediaType === "movie" ? tmdbData.title : tmdbData.name;
    const releaseYear =
      mediaType === "movie"
        ? tmdbData.release_date?.split("-")[0]
        : tmdbData.first_air_date?.split("-")[0];

    // Build search strings
    const dateInfo = mediaType === "movie" ? `${releaseYear} movie` : "tv series";
    const searchString = `${sanitizeString(title || "")} ${dateInfo}`.trim();

    // Get wikidata_id from TMDB external_ids
    const wikidataId = tmdbData.external_ids?.wikidata_id;
    const imdbId = tmdbData.imdb_id || tmdbData.external_ids?.imdb_id;

    // Call BOTH lambdas in parallel (like legacy app)
    const [googleResult, ratingsResult] = await Promise.allSettled([
      callGoogleLambda(searchString),
      callRatingsLambda(
        searchString,
        id,
        imdbId,
        wikidataId,
        mediaType === "movie" ? "movie" : "tv"
      ),
    ]);

    const googleData = googleResult.status === "fulfilled" ? googleResult.value : null;
    const ratingsData = ratingsResult.status === "fulfilled" ? ratingsResult.value : null;

    console.log(`[Hydration/Lambda] Results - Google: ${googleData ? "✓" : "✗"}, Ratings: ${ratingsData ? "✓" : "✗"}`);

    // Merge results
    return mergeResponse(googleData, ratingsData);
  } finally {
    // Clear item context
    currentItemContext = null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sanitizeString(str: string): string {
  return str.replaceAll("&", "and").replaceAll("?", "").trim();
}

/**
 * Merge responses from both lambdas into EnrichedData
 * Priority: Ratings Lambda data > Google Lambda data
 */
function mergeResponse(
  google: GoogleLambdaResponse | null,
  ratings: RatingsLambdaResponse | null
): EnrichedData {
  const detailed = ratings?.detailedRatings;
  const externalIds = ratings?.externalIds || {};

  // Merge watch options: Google has deep links, use those
  const scrapedWatchLinks = (google?.allWatchOptions || ratings?.allWatchOptions || []).map(
    (opt) => ({
      provider: opt.name,
      link: opt.link,
      price: opt.price || "Unknown",
    })
  );

  // Try to extract RT ID from Google ratings link if not in Wikidata
  // RT URLs look like: https://www.rottentomatoes.com/m/movie_name or /tv/series_name
  const allRatings = [...(google?.ratings || []), ...(ratings?.ratings || [])];
  let rtIdFromGoogle: string | undefined;
  if (!externalIds.rottentomatoes_id) {
    for (const r of allRatings) {
      if (r.link?.includes("rottentomatoes.com/")) {
        const match = r.link.match(/rottentomatoes\.com\/(m|tv)\/([^/?]+)/);
        if (match) {
          rtIdFromGoogle = match[2]; // The slug after /m/ or /tv/
          console.log(`[Hydration/Lambda] Extracted RT ID from Google: ${rtIdFromGoogle}`);
          break;
        }
      }
    }
  }

  // Build ratings from detailed data
  const enrichedRatings: EnrichedData["ratings"] = {};

  // IMDb from Ratings Lambda (detailed)
  if (detailed?.imdb?.rating != null) {
    enrichedRatings.imdb = {
      score: detailed.imdb.rating,
      voteCount: detailed.imdb.ratingCount ?? undefined,
      sourceUrl: detailed.imdb.sourceUrl,
    };
  }

  // RT Critic from Ratings Lambda
  if (detailed?.rottenTomatoes?.critic?.score != null) {
    enrichedRatings.rtCritic = {
      score: detailed.rottenTomatoes.critic.score,
      voteCount: detailed.rottenTomatoes.critic.ratingCount ?? undefined,
      certified: detailed.rottenTomatoes.critic.certified ?? undefined,
      consensus: detailed.rottenTomatoes.critic.consensus ?? undefined,
      sentiment: detailed.rottenTomatoes.critic.sentiment ?? undefined,
      sourceUrl: detailed.rottenTomatoes.sourceUrl,
    };
  }

  // RT Audience from Ratings Lambda
  if (detailed?.rottenTomatoes?.audience?.score != null) {
    enrichedRatings.rtAudience = {
      score: detailed.rottenTomatoes.audience.score,
      voteCount: detailed.rottenTomatoes.audience.ratingCount ?? undefined,
      certified: detailed.rottenTomatoes.audience.certified ?? undefined,
      sentiment: detailed.rottenTomatoes.audience.sentiment ?? undefined,
    };
  }

  // Fallback to Google basic ratings if no detailed ratings
  if (!enrichedRatings.imdb && !enrichedRatings.rtCritic) {
    const basicRatings = google?.ratings || ratings?.ratings || [];
    
    for (const r of basicRatings) {
      const score = parseFloat(r.rating.replace("%", ""));
      if (isNaN(score)) continue;

      if (r.name.toLowerCase().includes("imdb") && !enrichedRatings.imdb) {
        enrichedRatings.imdb = { score, sourceUrl: r.link };
      } else if (r.name.toLowerCase().includes("rotten") && !enrichedRatings.rtCritic) {
        // Basic RT rating is usually critic score
        enrichedRatings.rtCritic = { score, sourceUrl: r.link };
      } else if (r.name.toLowerCase().includes("letterboxd") && !enrichedRatings.letterboxd) {
        enrichedRatings.letterboxd = { score };
      } else if (r.name.toLowerCase() === "google" && !enrichedRatings.google) {
        enrichedRatings.google = { score };
      } else if (r.name.toLowerCase().includes("metacritic") && !enrichedRatings.metacritic) {
        enrichedRatings.metacritic = { score };
      }
    }
  }

  return {
    ratings: Object.keys(enrichedRatings).length > 0 ? enrichedRatings : null,
    scrapedWatchLinks,
    externalIds: {
      // RT ID: prefer Wikidata, fallback to Google scrape extraction
      rottentomatoes: externalIds.rottentomatoes_id ?? rtIdFromGoogle,
      metacritic: externalIds.metacritic_id ?? undefined,
      letterboxd: externalIds.letterboxd_id ?? undefined,
      netflix: externalIds.netflix_id ?? undefined,
      apple: externalIds.apple_id ?? undefined,
      amazon: externalIds.prime_id ?? undefined,
      hotstar: externalIds.hotstar_id ?? undefined,
    },
    source: "lambda",
    scrapedAt: new Date(),
  };
}

/**
 * Create empty enriched data structure
 */
function emptyEnriched(): EnrichedData {
  return {
    ratings: null,
    scrapedWatchLinks: [],
    externalIds: {},
    source: "lambda",
    scrapedAt: null,
  };
}
