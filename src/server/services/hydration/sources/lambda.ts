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
    console.log(`[Hydration/Lambda] Google Lambda RAW response:\n${payloadStr.slice(0, 2000)}`);
    
    const parsed = JSON.parse(payloadStr) as GoogleLambdaResponse;
    console.log(`[Hydration/Lambda] Google Lambda PARSED:`, JSON.stringify({
      ratingsCount: parsed.ratings?.length ?? 0,
      watchOptionsCount: parsed.allWatchOptions?.length ?? 0,
      imdbId: parsed.imdbId,
      directorName: parsed.directorName,
    }));
    
    trackLambdaCall(GOOGLE_LAMBDA_FN, startTime, statusCode, null, null);
    return parsed;
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
    console.log(`[Hydration/Lambda] Ratings Lambda RAW response:\n${payloadStr.slice(0, 3000)}`);
    
    const apiGatewayResponse = JSON.parse(payloadStr) as {
      statusCode?: number;
      body?: string;
    };

    // Handle API Gateway response format (Ratings Lambda returns { statusCode, body: "..." })
    let parsed: RatingsLambdaResponse;
    if (apiGatewayResponse.statusCode && apiGatewayResponse.body) {
      statusCode = apiGatewayResponse.statusCode;
      if (apiGatewayResponse.statusCode !== 200) {
        console.error("[Hydration/Lambda] Ratings Lambda non-200:", apiGatewayResponse.statusCode);
        trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, "Non200Response", `Status: ${statusCode}`);
        return null;
      }
      console.log(`[Hydration/Lambda] Ratings Lambda BODY (before parse):\n${apiGatewayResponse.body.slice(0, 2000)}`);
      parsed = JSON.parse(apiGatewayResponse.body) as RatingsLambdaResponse;
    } else {
      // Direct response format (no API Gateway wrapper)
      parsed = apiGatewayResponse as RatingsLambdaResponse;
    }
    
    console.log(`[Hydration/Lambda] Ratings Lambda PARSED:`, JSON.stringify({
      hasDetailedRatings: !!parsed.detailedRatings,
      imdb: parsed.detailedRatings?.imdb ? `${parsed.detailedRatings.imdb.rating} (${parsed.detailedRatings.imdb.ratingCount} votes)` : null,
      rtCritic: parsed.detailedRatings?.rottenTomatoes?.critic?.score ?? null,
      rtAudience: parsed.detailedRatings?.rottenTomatoes?.audience?.score ?? null,
      basicRatingsCount: parsed.ratings?.length ?? 0,
      watchOptionsCount: parsed.allWatchOptions?.length ?? 0,
      externalIds: parsed.externalIds ?? null,
      googleError: parsed.googleError ?? null,
    }));
    
    trackLambdaCall(RATINGS_LAMBDA_FN, startTime, statusCode, null, null);
    return parsed;
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
 * @param existingEnriched - Optional existing enriched data to merge with (preserves ratings Lambda doesn't return)
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
  },
  existingEnriched?: EnrichedData | null
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

    console.log(`[Hydration/Lambda] Results - Google Lambda: ${googleData ? "✓" : "✗"}, Ratings Lambda: ${ratingsData ? "✓" : "✗"}`);
    
    // Log raw results for debugging
    if (googleData?.ratings?.length) {
      console.log(`[Hydration/Lambda] Google Lambda ratings:`);
      for (const r of googleData.ratings) {
        console.log(`  → ${r.name}: ${r.rating}`);
      }
    }
    if (googleData?.allWatchOptions?.length) {
      console.log(`[Hydration/Lambda] Google Lambda watch options: ${googleData.allWatchOptions.length} providers`);
      for (const w of googleData.allWatchOptions) {
        console.log(`  → ${w.name}: ${w.link} (${w.price || 'N/A'})`);
      }
    }
    if (ratingsData?.detailedRatings) {
      console.log(`[Hydration/Lambda] Ratings Lambda detailed ratings:`);
      if (ratingsData.detailedRatings.imdb?.rating != null) {
        console.log(`  → IMDb: ${ratingsData.detailedRatings.imdb.rating} (${ratingsData.detailedRatings.imdb.ratingCount} votes)`);
      }
      if (ratingsData.detailedRatings.rottenTomatoes?.critic?.score != null) {
        console.log(`  → RT Critic: ${ratingsData.detailedRatings.rottenTomatoes.critic.score}%`);
      }
      if (ratingsData.detailedRatings.rottenTomatoes?.audience?.score != null) {
        console.log(`  → RT Audience: ${ratingsData.detailedRatings.rottenTomatoes.audience.score}%`);
      }
    }
    if (existingEnriched?.ratings) {
      console.log(`[Hydration/Lambda] Existing ratings to merge:`);
      if (existingEnriched.ratings.imdb?.score) console.log(`  → IMDb: ${existingEnriched.ratings.imdb.score}`);
      if (existingEnriched.ratings.rtCritic?.score) console.log(`  → RT Critic: ${existingEnriched.ratings.rtCritic.score}%`);
      if (existingEnriched.ratings.rtAudience?.score) console.log(`  → RT Audience: ${existingEnriched.ratings.rtAudience.score}%`);
      if (existingEnriched.ratings.google?.score) console.log(`  → Google: ${existingEnriched.ratings.google.score}%`);
      if (existingEnriched.ratings.letterboxd?.score) console.log(`  → Letterboxd: ${existingEnriched.ratings.letterboxd.score}`);
      if (existingEnriched.ratings.metacritic?.score) console.log(`  → Metacritic: ${existingEnriched.ratings.metacritic.score}`);
    }

    // Merge results with existing data (preserves ratings Lambda doesn't return, like Google)
    return mergeResponse(googleData, ratingsData, existingEnriched);
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
 * 
 * Priority (same as legacy Nuxt app):
 * 1. Ratings Lambda detailedRatings (IMDb, RT) - highest priority
 * 2. Google Lambda basic ratings (Google, Letterboxd, Metacritic, etc.)
 * 3. Existing enriched data (preserves ratings that Lambda doesn't return)
 * 
 * Key behavior (matching legacy app):
 * - If Lambda returns empty ratings but existing has ratings → keep existing
 * - If both have ratings → merge: new ratings + old ratings that don't exist in new
 * - This preserves Google ratings which only come from Google Lambda
 */
function mergeResponse(
  google: GoogleLambdaResponse | null,
  ratings: RatingsLambdaResponse | null,
  existingEnriched?: EnrichedData | null
): EnrichedData {
  const detailed = ratings?.detailedRatings;
  const externalIds = ratings?.externalIds || {};
  const existingRatings = existingEnriched?.ratings || {};

  // Merge watch options: Google has deep links, use those
  // Legacy app logic: use new if available, otherwise keep existing
  const newWatchLinks = (google?.allWatchOptions || ratings?.allWatchOptions || []).map(
    (opt) => ({
      provider: opt.name,
      link: opt.link,
      price: opt.price || "Unknown",
    })
  );
  const scrapedWatchLinks = newWatchLinks.length > 0 
    ? newWatchLinks 
    : (existingEnriched?.scrapedWatchLinks || []);

  // Try to extract RT ID from Google ratings link if not in Wikidata
  const allRatings = [...(google?.ratings || []), ...(ratings?.ratings || [])];
  let rtIdFromGoogle: string | undefined;
  if (!externalIds.rottentomatoes_id) {
    for (const r of allRatings) {
      if (r.link?.includes("rottentomatoes.com/")) {
        const match = r.link.match(/rottentomatoes\.com\/(m|tv)\/([^/?]+)/);
        if (match) {
          rtIdFromGoogle = match[2];
          console.log(`[Hydration/Lambda] Extracted RT ID from Google: ${rtIdFromGoogle}`);
          break;
        }
      }
    }
  }

  // Build ratings from detailed data (Ratings Lambda)
  const enrichedRatings: EnrichedData["ratings"] = {};

  // IMDb from Ratings Lambda (detailed) - or preserve existing
  if (detailed?.imdb?.rating != null) {
    enrichedRatings.imdb = {
      score: detailed.imdb.rating,
      voteCount: detailed.imdb.ratingCount ?? undefined,
      sourceUrl: detailed.imdb.sourceUrl,
    };
  } else if (existingRatings.imdb?.score) {
    // Preserve existing IMDb if Lambda didn't return one
    enrichedRatings.imdb = existingRatings.imdb;
    console.log(`[Hydration/Lambda] Preserved existing IMDb rating: ${existingRatings.imdb.score}`);
  }

  // RT Critic from Ratings Lambda - or preserve existing
  if (detailed?.rottenTomatoes?.critic?.score != null) {
    enrichedRatings.rtCritic = {
      score: detailed.rottenTomatoes.critic.score,
      voteCount: detailed.rottenTomatoes.critic.ratingCount ?? undefined,
      certified: detailed.rottenTomatoes.critic.certified ?? undefined,
      consensus: detailed.rottenTomatoes.critic.consensus ?? undefined,
      sentiment: detailed.rottenTomatoes.critic.sentiment ?? undefined,
      sourceUrl: detailed.rottenTomatoes.sourceUrl,
    };
  } else if (existingRatings.rtCritic?.score) {
    enrichedRatings.rtCritic = existingRatings.rtCritic;
    console.log(`[Hydration/Lambda] Preserved existing RT Critic rating: ${existingRatings.rtCritic.score}`);
  }

  // RT Audience from Ratings Lambda - or preserve existing
  if (detailed?.rottenTomatoes?.audience?.score != null) {
    enrichedRatings.rtAudience = {
      score: detailed.rottenTomatoes.audience.score,
      voteCount: detailed.rottenTomatoes.audience.ratingCount ?? undefined,
      certified: detailed.rottenTomatoes.audience.certified ?? undefined,
      sentiment: detailed.rottenTomatoes.audience.sentiment ?? undefined,
    };
  } else if (existingRatings.rtAudience?.score) {
    enrichedRatings.rtAudience = existingRatings.rtAudience;
    console.log(`[Hydration/Lambda] Preserved existing RT Audience rating: ${existingRatings.rtAudience.score}`);
  }

  // Process Google Lambda basic ratings for additional sources
  // These sources (Google, Letterboxd, Metacritic) only come from Google Lambda
  const basicRatings = google?.ratings || ratings?.ratings || [];
  
  for (const r of basicRatings) {
    const score = parseFloat(r.rating.replace("%", ""));
    if (isNaN(score)) continue;

    const nameLower = r.name.toLowerCase();
    
    // IMDb fallback (only if not already set from detailed)
    if (nameLower.includes("imdb") && !enrichedRatings.imdb) {
      enrichedRatings.imdb = { score, sourceUrl: r.link };
    }
    // RT fallback (only if not already set from detailed)
    else if (nameLower.includes("rotten") && !enrichedRatings.rtCritic) {
      enrichedRatings.rtCritic = { score, sourceUrl: r.link };
    }
    // Google rating - CRITICAL: this only comes from Google Lambda
    else if (nameLower === "google" && !enrichedRatings.google) {
      enrichedRatings.google = { score };
    }
    // Letterboxd - only from Google Lambda
    else if (nameLower.includes("letterboxd") && !enrichedRatings.letterboxd) {
      enrichedRatings.letterboxd = { score };
    }
    // Metacritic - only from Google Lambda  
    else if (nameLower.includes("metacritic") && !enrichedRatings.metacritic) {
      enrichedRatings.metacritic = { score };
    }
  }

  // CRITICAL: Preserve existing ratings that Lambda didn't return
  // This is the key fix - Google ratings get lost on force refresh without this
  if (!enrichedRatings.google && existingRatings.google?.score) {
    enrichedRatings.google = existingRatings.google;
    console.log(`[Hydration/Lambda] Preserved existing Google rating: ${existingRatings.google.score}`);
  }
  if (!enrichedRatings.letterboxd && existingRatings.letterboxd?.score) {
    enrichedRatings.letterboxd = existingRatings.letterboxd;
    console.log(`[Hydration/Lambda] Preserved existing Letterboxd rating: ${existingRatings.letterboxd.score}`);
  }
  if (!enrichedRatings.metacritic && existingRatings.metacritic?.score) {
    enrichedRatings.metacritic = existingRatings.metacritic;
    console.log(`[Hydration/Lambda] Preserved existing Metacritic rating: ${existingRatings.metacritic.score}`);
  }

  // Merge external IDs: new > existing
  const mergedExternalIds: EnrichedData["externalIds"] = {
    // RT ID: prefer Wikidata, then Google scrape, then existing
    rottentomatoes: externalIds.rottentomatoes_id ?? rtIdFromGoogle ?? existingEnriched?.externalIds?.rottentomatoes,
    metacritic: externalIds.metacritic_id ?? existingEnriched?.externalIds?.metacritic,
    letterboxd: externalIds.letterboxd_id ?? existingEnriched?.externalIds?.letterboxd,
    netflix: externalIds.netflix_id ?? existingEnriched?.externalIds?.netflix,
    apple: externalIds.apple_id ?? existingEnriched?.externalIds?.apple,
    amazon: externalIds.prime_id ?? existingEnriched?.externalIds?.amazon,
    hotstar: externalIds.hotstar_id ?? existingEnriched?.externalIds?.hotstar,
  };

  const finalRatings = Object.keys(enrichedRatings).length > 0 ? enrichedRatings : null;
  
  // Log final merged result
  console.log(`[Hydration/Lambda] Final merged ratings:`);
  if (finalRatings) {
    if (finalRatings.imdb?.score) console.log(`  → IMDb: ${finalRatings.imdb.score}`);
    if (finalRatings.rtCritic?.score) console.log(`  → RT Critic: ${finalRatings.rtCritic.score}%`);
    if (finalRatings.rtAudience?.score) console.log(`  → RT Audience: ${finalRatings.rtAudience.score}%`);
    if (finalRatings.google?.score) console.log(`  → Google: ${finalRatings.google.score}%`);
    if (finalRatings.letterboxd?.score) console.log(`  → Letterboxd: ${finalRatings.letterboxd.score}`);
    if (finalRatings.metacritic?.score) console.log(`  → Metacritic: ${finalRatings.metacritic.score}`);
  } else {
    console.log(`  (no ratings)`);
  }
  console.log(`[Hydration/Lambda] Final watch links: ${scrapedWatchLinks.length} providers`);
  for (const w of scrapedWatchLinks) {
    console.log(`  → ${w.provider}: ${w.link}`);
  }

  return {
    ratings: finalRatings,
    scrapedWatchLinks,
    externalIds: mergedExternalIds,
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
