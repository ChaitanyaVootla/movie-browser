/**
 * Progressive AI Enrichment Service
 *
 * Orchestrates background AI enrichment for movies/series:
 * 1. Checks if AI data already exists (and overview hasn't changed)
 * 2. Generates TMDB-only embedding if missing
 * 3. Calls Kimi K2.5 on Flex tier for AI summary generation
 * 4. Parses and stores AI insights in PostgreSQL
 * 5. Regenerates embedding with AI themes/mood/hook included
 *
 * Features:
 * - In-memory dedup: concurrent requests for the same item share a single Promise
 * - Concurrency limiter: max 5 concurrent LLM calls via p-limit
 * - Fire-and-forget: errors are logged, never crash the caller
 * - Analytics: tracks both LLM and embedding costs
 */

import pLimit from "p-limit";
import { dataLogger } from "@/lib/logger";
import { getAIData } from "@/server/services/ai-data-service";
import { upsertAIData } from "@/server/services/ai-data-service";
import { buildAIInputFromTMDB, type TMDBData } from "@/server/services/enrichment/ai-input-builder";
import { ENRICHMENT_SYSTEM_PROMPT } from "@/server/services/enrichment/prompts";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { parseAndValidateAIOutput, type RawAIOutput } from "@/types/ai-insights";
import { generateAndStoreEmbedding } from "@/lib/embeddings/cohere-generator";
import { buildMovieEmbeddingText, buildSeriesEmbeddingText } from "@/lib/embeddings/text-builder";
import { calculateCost } from "@/lib/model-pricing";
import { trackAIUsage } from "@/lib/analytics/track";
import type { InsightCategory, SpoilerLevel } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

// =============================================================================
// Configuration
// =============================================================================

/** Max concurrent LLM calls across all progressive enrichment */
const MAX_CONCURRENT_LLM = 5;

/** Model ID for enrichment (Kimi K2.5 non-thinking) */
const MODEL_ID = "moonshotai.kimi-k2.5";

/** Max output tokens for AI summary */
const MAX_TOKENS = 2048;

/** Temperature for generation */
const TEMPERATURE = 0.7;

// =============================================================================
// Logger
// =============================================================================

const log = dataLogger.child({ service: "enrichment" });

// =============================================================================
// Dedup Map & Concurrency Limiter
// =============================================================================

/**
 * In-memory dedup: maps "movie:550" → active enrichment Promise.
 * Second caller for the same item awaits the existing Promise.
 * Cleaned up in .finally() of each enrichment.
 */
const dedupMap = new Map<string, Promise<void>>();

/**
 * Concurrency limiter — max 5 concurrent LLM calls to avoid
 * overwhelming Bedrock and staying within Flex tier limits.
 */
const llmLimit = pLimit(MAX_CONCURRENT_LLM);

// =============================================================================
// Helpers
// =============================================================================

function dedupKey(mediaType: "movie" | "series", id: number): string {
  return `${mediaType}:${id}`;
}

/**
 * Map spoiler level from ai-insights format to Prisma enum.
 * Mirrors the mapping in scripts/summarize-movies.ts.
 */
function mapSpoilerLevel(level: string): SpoilerLevel {
  const normalized = level.toUpperCase();
  if (normalized === "FREE" || normalized === "NONE") return "FREE";
  if (normalized === "LIGHT" || normalized === "MILD") return "LIGHT";
  if (normalized === "HEAVY" || normalized === "MODERATE") return "HEAVY";
  return "FREE";
}

/**
 * Check if an embedding exists for the given item using raw SQL.
 * The embedding column is managed by pgvector and not in Prisma types.
 */
async function hasEmbedding(
  mediaType: "movie" | "series",
  id: number
): Promise<boolean> {
  const table = mediaType === "movie" ? "movies" : "series";
  const result = await prisma.$queryRawUnsafe<Array<{ has_emb: boolean }>>(
    `SELECT (embedding IS NOT NULL) AS has_emb FROM ${table} WHERE id = $1`,
    id
  );
  return result.length > 0 && result[0].has_emb;
}

/**
 * Build a TMDB-only embedding text from the tmdbData.
 * This is a lightweight embedding without AI-enriched fields.
 */
function buildTMDBOnlyEmbeddingText(
  mediaType: "movie" | "series",
  tmdbData: TMDBData
): string {
  if (mediaType === "movie" && "title" in tmdbData) {
    return buildMovieEmbeddingText({
      title: tmdbData.title,
      overview: tmdbData.overview ?? null,
      genres: tmdbData.genres?.map((g) => g.name) ?? [],
      keywords: getKeywordNames(tmdbData),
      tagline: tmdbData.tagline ?? null,
      director: getDirector(tmdbData),
      topCast: getTopCastNames(tmdbData),
    });
  }
  // Series
  if ("name" in tmdbData) {
    return buildSeriesEmbeddingText({
      name: tmdbData.name,
      overview: tmdbData.overview ?? null,
      genres: tmdbData.genres?.map((g) => g.name) ?? [],
      keywords: getKeywordNames(tmdbData),
      tagline: tmdbData.tagline ?? null,
      creators: "created_by" in tmdbData
        ? tmdbData.created_by?.map((c) => c.name) ?? []
        : [],
      topCast: getTopCastNames(tmdbData),
    });
  }
  return "";
}

/**
 * Build an AI-enriched embedding text including themes/mood/hook.
 */
function buildEnrichedEmbeddingText(
  mediaType: "movie" | "series",
  tmdbData: TMDBData,
  aiData: { themes: string[]; mood: Record<string, string>; vibes: string[]; hook: string }
): string {
  if (mediaType === "movie" && "title" in tmdbData) {
    return buildMovieEmbeddingText({
      title: tmdbData.title,
      overview: tmdbData.overview ?? null,
      genres: tmdbData.genres?.map((g) => g.name) ?? [],
      keywords: getKeywordNames(tmdbData),
      tagline: tmdbData.tagline ?? null,
      director: getDirector(tmdbData),
      topCast: getTopCastNames(tmdbData),
      themes: aiData.themes,
      mood: aiData.mood,
      quickTake: aiData.vibes,
      hook: aiData.hook,
    });
  }
  // Series
  if ("name" in tmdbData) {
    return buildSeriesEmbeddingText({
      name: tmdbData.name,
      overview: tmdbData.overview ?? null,
      genres: tmdbData.genres?.map((g) => g.name) ?? [],
      keywords: getKeywordNames(tmdbData),
      tagline: tmdbData.tagline ?? null,
      creators: "created_by" in tmdbData
        ? tmdbData.created_by?.map((c) => c.name) ?? []
        : [],
      topCast: getTopCastNames(tmdbData),
      themes: aiData.themes,
      mood: aiData.mood,
      quickTake: aiData.vibes,
    });
  }
  return "";
}

/** Extract keyword names from TMDBData */
function getKeywordNames(data: TMDBData): string[] {
  if (!data.keywords) return [];
  const kws = "keywords" in data.keywords
    ? data.keywords.keywords
    : "results" in data.keywords
      ? data.keywords.results
      : [];
  return kws.map((k) => k.name);
}

/** Extract director name from TMDBData */
function getDirector(data: TMDBData): string | undefined {
  if (data.credits?.crew) {
    const director = data.credits.crew.find((c) => c.job === "Director");
    return director?.name;
  }
  return undefined;
}

/** Extract top cast names from TMDBData */
function getTopCastNames(data: TMDBData): string[] {
  if (!data.credits?.cast?.length) return [];
  return data.credits.cast.slice(0, 5).map((c) => c.name);
}

// =============================================================================
// Core Enrichment Flow
// =============================================================================

/**
 * Internal enrichment orchestration (runs inside the concurrency limiter).
 */
async function runEnrichment(
  mediaType: "movie" | "series",
  id: number,
  tmdbData: TMDBData
): Promise<void> {
  const startTime = Date.now();
  const overview = tmdbData.overview;

  // Step 1: Check if AI data already exists
  const existingAI = await getAIData(id, mediaType);
  if (existingAI) {
    // Check if overview has changed by seeing if the current overview
    // appears in the stored rawInput. If it does, the data is still valid.
    if (existingAI.rawInput && overview && existingAI.rawInput.includes(overview)) {
      log.info(
        { mediaType, id, event: "enrichment.skipped.exists" },
        "AI data exists and overview unchanged — skipping enrichment"
      );
      return;
    }
    // Overview changed — will regenerate
    log.info(
      { mediaType, id, event: "enrichment.regen" },
      "Overview changed — regenerating AI data"
    );
  }

  // Step 2: Generate TMDB-only embedding if none exists
  const embeddingExists = await hasEmbedding(mediaType, id);
  if (!embeddingExists) {
    log.info({ mediaType, id }, "Generating TMDB-only embedding");
    const embeddingText = buildTMDBOnlyEmbeddingText(mediaType, tmdbData);
    if (embeddingText) {
      await generateAndStoreEmbedding(mediaType, id, embeddingText, false);
    }
  }

  // Step 3: Build AI input from TMDB data
  const aiInput = buildAIInputFromTMDB(tmdbData);

  // Step 4: Call Kimi K2.5 with Flex tier
  log.info(
    { mediaType, id, event: "enrichment.started" },
    "Starting AI enrichment"
  );

  const result = await callBedrockFlex({
    messages: [{ role: "user", text: aiInput }],
    systemPrompt: ENRICHMENT_SYSTEM_PROMPT,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    useFlex: true,
    modelId: MODEL_ID,
  });

  // Step 5: Parse LLM output
  let raw: RawAIOutput;
  try {
    // Strip markdown code fences if present
    let outputText = result.output.trim();
    if (outputText.startsWith("```")) {
      outputText = outputText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    raw = JSON.parse(outputText) as RawAIOutput;
  } catch {
    log.error(
      { mediaType, id, event: "enrichment.failed", outputPreview: result.output.slice(0, 200) },
      "Failed to parse LLM output as JSON"
    );
    return;
  }

  const { insights: validatedInsights, errors: validationErrors } = parseAndValidateAIOutput(raw);

  if (validationErrors.length > 0) {
    log.warn(
      { mediaType, id, errorCount: validationErrors.length, errors: validationErrors.slice(0, 3) },
      "AI output validation warnings"
    );
  }

  if (validatedInsights.length === 0) {
    log.error(
      { mediaType, id, event: "enrichment.failed" },
      "No valid insights generated — skipping storage"
    );
    return;
  }

  // Step 6: Store via upsertAIData
  const prismaInsights: Array<{
    text: string;
    category: InsightCategory;
    subcategory?: string;
    spoilerLevel?: SpoilerLevel;
    priority?: number;
  }> = validatedInsights.map((insight) => ({
    text: insight.text,
    category: insight.category as InsightCategory,
    subcategory: insight.subcategory ?? undefined,
    spoilerLevel: mapSpoilerLevel(insight.spoilerLevel),
    priority: insight.priority,
  }));

  await upsertAIData(id, mediaType, {
    hook: raw.hook || "",
    rawInput: aiInput,
    modelId: MODEL_ID,
    insights: prismaInsights,
  });

  // Step 7: Regenerate embedding with AI themes/mood/hook included
  const enrichedText = buildEnrichedEmbeddingText(mediaType, tmdbData, {
    themes: raw.themes || [],
    mood: raw.mood || {},
    vibes: raw.vibes || [],
    hook: raw.hook || "",
  });
  if (enrichedText) {
    await generateAndStoreEmbedding(mediaType, id, enrichedText, false);
  }

  // Track costs
  const durationMs = Date.now() - startTime;
  const cost = calculateCost(MODEL_ID, result.inputTokens, result.outputTokens);

  log.info(
    {
      mediaType,
      id,
      event: "enrichment.completed",
      durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      insightCount: validatedInsights.length,
      cost: cost.formatted,
    },
    "AI enrichment completed"
  );

  // Track AI usage for cost dashboard
  try {
    trackAIUsage({
      sessionId: "",
      userId: null,
      isAuthenticated: false,
      country: "system",
      query: `progressive_enrichment:${mediaType}:${id}`,
      queryType: "progressive_enrichment",
      hasPageContext: true,
      pageContextType: mediaType === "movie" ? "movie" : "series",
      pageContextId: id,
      modelId: MODEL_ID,
      modelName: "Kimi K2.5",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      turns: 1,
      toolCalls: [],
      durationMs,
      hadToolRecovery: false,
      responseLength: result.output.length,
    });
  } catch {
    // Fire-and-forget: tracking errors must never break enrichment
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Trigger progressive AI enrichment for a movie or series.
 *
 * Fire-and-forget safe — errors are logged, never thrown to the caller.
 * Concurrent calls for the same item are deduplicated (only one LLM call).
 *
 * @param mediaType - "movie" or "series"
 * @param id - TMDB ID
 * @param tmdbData - Hydrated TMDB data (Movie | Series from the hydration service)
 */
export async function triggerProgressiveEnrichment(
  mediaType: "movie" | "series",
  id: number,
  tmdbData: TMDBData
): Promise<void> {
  const key = dedupKey(mediaType, id);

  // Skip if no overview — not enough data for meaningful AI summary
  if (!tmdbData.overview?.trim()) {
    log.info(
      { mediaType, id, event: "enrichment.skipped.no-overview" },
      "No overview available — skipping enrichment"
    );
    return;
  }

  // Dedup: if already in flight, await the existing Promise
  const existing = dedupMap.get(key);
  if (existing) {
    log.debug(
      { mediaType, id, event: "enrichment.skipped.dedup" },
      "Enrichment already in progress — deduplicating"
    );
    return existing;
  }

  // Create enrichment Promise with concurrency limiting
  const promise = llmLimit(() => runEnrichment(mediaType, id, tmdbData))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      log.error(
        { mediaType, id, event: "enrichment.failed", error: message, errorType: errorName },
        "Progressive enrichment failed"
      );
    })
    .finally(() => {
      dedupMap.delete(key);
    });

  dedupMap.set(key, promise);
  return promise;
}
