/**
 * AI Data Service
 *
 * Handles reading/writing AI enrichment data (hooks, insights, mood, questions)
 * from PostgreSQL. No caching - DB queries are fast (~5ms) and caching
 * causes stale data issues with multi-worker Next.js during enrichment.
 */

import { prisma } from "@/server/db/postgres";
import type { AISummary } from "@/types";
import { dataLogger } from "@/lib/logger";
import type { InsightCategory, SpoilerLevel, AiInsight } from "@prisma/client";

const log = dataLogger.child({ service: "ai-data" });

// =============================================================================
// Types
// =============================================================================

/** Structured insight item with subcategory */
interface InsightItem {
  subcategory: string;
  text: string;
}

/** Deep dive insight with spoiler level */
interface DeepDiveItem extends InsightItem {
  spoilerLevel: string;
}

/** New structured AI data response */
export interface AIDataResponse {
  hook: string | null;
  rawInput: string | null;
  mood: {
    pacing: string | null;
    intensity: string | null;
    tone: string | null;
    emotional: string | null;
  } | null;
  insights: {
    spoilerFree: {
      vibes: string[];
      themes: string[];
      bestFor: InsightItem[];
      highlights: InsightItem[];
      headsUp: InsightItem[];
      questions: string[];
    };
    spoilerContent: {
      questions: string[];
      deepDive: DeepDiveItem[];
    };
  };
  generatedAt: Date | null;
  version: number;
}

/** Raw AI data record from Prisma (legacy format) */
interface AiDataRecordLegacy {
  id: number;
  movieId: number | null;
  seriesId: number | null;
  hook: string | null;
  quickTake: string[];
  themes: string[];
  mood: unknown; // JSON field
  questions: string[];
  watchContext?: string[];
  contentWarnings?: string[];
  generatedAt: Date | null;
  modelId: string | null;
}

/** Mood structure from AISummary type */
interface MoodData {
  pacing: "slow" | "steady" | "fast";
  intensity: "low" | "medium" | "high";
  tone: "dark" | "light" | "mixed";
  emotional: "light" | "medium" | "heavy";
}

// =============================================================================
// Transform Helpers
// =============================================================================

/**
 * Transform insights array into structured spoiler-free and spoiler content
 */
function transformInsights(insights: AiInsight[]): AIDataResponse["insights"] {
  const spoilerFree = {
    vibes: insights
      .filter((i) => i.category === "VIBE" && i.spoilerLevel === "FREE")
      .map((i) => i.text),
    themes: insights
      .filter((i) => i.category === "THEME" && i.spoilerLevel === "FREE")
      .map((i) => i.text),
    bestFor: insights
      .filter((i) => i.category === "BEST_FOR" && i.spoilerLevel === "FREE")
      .map((i) => ({ subcategory: i.subcategory || "", text: i.text })),
    highlights: insights
      .filter((i) => i.category === "HIGHLIGHT" && i.spoilerLevel === "FREE")
      .map((i) => ({ subcategory: i.subcategory || "", text: i.text })),
    headsUp: insights
      .filter((i) => i.category === "HEADS_UP" && i.spoilerLevel === "FREE")
      .map((i) => ({ subcategory: i.subcategory || "", text: i.text })),
    questions: insights
      .filter(
        (i) =>
          i.category === "QUESTION" &&
          i.subcategory === "pre_watch" &&
          i.spoilerLevel === "FREE"
      )
      .map((i) => i.text),
  };

  const spoilerContent = {
    questions: insights
      .filter(
        (i) => i.category === "QUESTION" && i.subcategory === "post_watch"
      )
      .map((i) => i.text),
    deepDive: insights
      .filter((i) => i.category === "DEEP_DIVE")
      .map((i) => ({
        subcategory: i.subcategory || "",
        text: i.text,
        spoilerLevel: i.spoilerLevel,
      })),
  };

  return { spoilerFree, spoilerContent };
}

/**
 * Extract mood data from MOOD category insights
 */
function extractMood(
  insights: AiInsight[]
): AIDataResponse["mood"] {
  const moodInsights = insights.filter((i) => i.category === "MOOD");
  if (moodInsights.length === 0) return null;

  return {
    pacing: moodInsights.find((i) => i.subcategory === "pacing")?.text || null,
    intensity:
      moodInsights.find((i) => i.subcategory === "intensity")?.text || null,
    tone: moodInsights.find((i) => i.subcategory === "tone")?.text || null,
    emotional:
      moodInsights.find((i) => i.subcategory === "emotional")?.text || null,
  };
}

/**
 * Transform database record with insights to AIDataResponse format
 */
function transformToAIDataResponse(
  record: {
    id: number;
    movieId: number | null;
    seriesId: number | null;
    hook: string | null;
    rawInput: string | null;
    version: number;
    generatedAt: Date | null;
    modelId: string | null;
    insights: AiInsight[];
  }
): AIDataResponse {
  const insights = transformInsights(record.insights);
  const mood = extractMood(record.insights);

  return {
    hook: record.hook,
    rawInput: record.rawInput,
    mood,
    insights,
    generatedAt: record.generatedAt,
    version: record.version,
  };
}

/**
 * Transform database record to legacy AISummary format (backward compatibility)
 */
function transformToAISummary(record: AiDataRecordLegacy): AISummary {
  return {
    hook: record.hook || "",
    quickTake: record.quickTake || [],
    themes: record.themes || [],
    mood: (record.mood as MoodData) || {
      pacing: "steady",
      intensity: "medium",
      tone: "mixed",
      emotional: "medium",
    },
    aiQuestions: record.questions || [],
    watchContext: record.watchContext || [],
    contentWarnings: record.contentWarnings || [],
    generatedAt: record.generatedAt?.toISOString(),
    modelId: record.modelId || undefined,
  };
}

/**
 * Convert AIDataResponse to AISummary for backward compatibility
 */
export function aiDataResponseToSummary(response: AIDataResponse): AISummary {
  // Extract mood values, mapping to expected literals
  const moodPacing = response.mood?.pacing as "slow" | "steady" | "fast" || "steady";
  const moodIntensity = response.mood?.intensity as "low" | "medium" | "high" || "medium";
  const moodTone = response.mood?.tone as "dark" | "light" | "mixed" || "mixed";
  const moodEmotional = response.mood?.emotional as "light" | "medium" | "heavy" || "medium";

  return {
    hook: response.hook || "",
    quickTake: response.insights.spoilerFree.vibes,
    themes: response.insights.spoilerFree.themes,
    mood: {
      pacing: moodPacing,
      intensity: moodIntensity,
      tone: moodTone,
      emotional: moodEmotional,
    },
    aiQuestions: response.insights.spoilerFree.questions,
    watchContext: response.insights.spoilerFree.bestFor.map((b) => b.text),
    contentWarnings: response.insights.spoilerFree.headsUp.map((h) => h.text),
    generatedAt: response.generatedAt?.toISOString(),
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get AI enrichment data for a movie or series (new structured format)
 *
 * Fetches directly from PostgreSQL with related insights (no caching - queries are fast ~5ms)
 */
export async function getAIData(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<AIDataResponse | null> {
  try {
    const whereClause =
      mediaType === "movie" ? { movieId: tmdbId } : { seriesId: tmdbId };

    const aiData = await prisma.aiData.findFirst({
      where: whereClause,
      include: {
        insights: {
          orderBy: [{ category: "asc" }, { priority: "asc" }],
        },
      },
    });

    if (!aiData) {
      return null;
    }

    return transformToAIDataResponse(aiData);
  } catch (error) {
    log.error(
      { error, tmdbId, mediaType },
      "Failed to fetch AI data from PostgreSQL"
    );
    return null;
  }
}

/**
 * Get AI enrichment data in legacy AISummary format (backward compatibility)
 *
 * @deprecated Use getAIData() for new code
 */
export async function getAIDataLegacy(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<AISummary | null> {
  const response = await getAIData(tmdbId, mediaType);
  if (!response) return null;
  return aiDataResponseToSummary(response);
}

/**
 * Check if AI data exists for a movie or series
 */
export async function hasAIData(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<boolean> {
  const whereClause =
    mediaType === "movie" ? { movieId: tmdbId } : { seriesId: tmdbId };

  const count = await prisma.aiData.count({
    where: whereClause,
  });

  return count > 0;
}

/**
 * Get raw AI input markdown for agent context
 *
 * Efficient query that only fetches the raw_input column.
 * Used by the AI agent to get enriched context for answering questions.
 */
export async function getRawAIInput(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<string | null> {
  try {
    const whereClause =
      mediaType === "movie" ? { movieId: tmdbId } : { seriesId: tmdbId };

    const result = await prisma.aiData.findFirst({
      where: whereClause,
      select: { rawInput: true },
    });

    return result?.rawInput || null;
  } catch (error) {
    log.error({ error, tmdbId, mediaType }, "Failed to fetch raw AI input");
    return null;
  }
}

/**
 * Upsert AI enrichment data with insights
 *
 * Creates or updates AI data for a movie/series, replacing all insights.
 */
export async function upsertAIData(
  tmdbId: number,
  mediaType: "movie" | "series",
  data: {
    hook: string;
    rawInput?: string;
    modelId?: string;
    insights: Array<{
      text: string;
      category: InsightCategory;
      subcategory?: string;
      spoilerLevel?: SpoilerLevel;
      priority?: number;
    }>;
  }
): Promise<void> {
  try {
    const aiDataPayload = {
      hook: data.hook,
      rawInput: data.rawInput || null,
      generatedAt: new Date(),
      modelId: data.modelId || null,
    };

    // Use a transaction to upsert AiData and replace insights
    await prisma.$transaction(async (tx) => {
      let aiDataId: number;

      if (mediaType === "movie") {
        const result = await tx.aiData.upsert({
          where: { movieId: tmdbId },
          update: {
            ...aiDataPayload,
            version: { increment: 1 },
          },
          create: {
            movieId: tmdbId,
            ...aiDataPayload,
            version: 1,
          },
        });
        aiDataId = result.id;
      } else {
        const result = await tx.aiData.upsert({
          where: { seriesId: tmdbId },
          update: {
            ...aiDataPayload,
            version: { increment: 1 },
          },
          create: {
            seriesId: tmdbId,
            ...aiDataPayload,
            version: 1,
          },
        });
        aiDataId = result.id;
      }

      // Delete existing insights
      await tx.aiInsight.deleteMany({
        where: { aiDataId },
      });

      // Create new insights
      if (data.insights.length > 0) {
        await tx.aiInsight.createMany({
          data: data.insights.map((insight) => ({
            aiDataId,
            text: insight.text,
            category: insight.category,
            subcategory: insight.subcategory || null,
            spoilerLevel: insight.spoilerLevel || "FREE",
            priority: insight.priority || 50,
          })),
        });
      }
    });

    log.info({ tmdbId, mediaType, insightCount: data.insights.length }, "AI data upserted successfully");
  } catch (error) {
    log.error({ error, tmdbId, mediaType }, "Failed to upsert AI data");
    throw error;
  }
}

/**
 * Upsert AI enrichment data from legacy AISummary format
 *
 * @deprecated Use upsertAIData() with insights array for new code
 */
export async function upsertAIDataLegacy(
  tmdbId: number,
  mediaType: "movie" | "series",
  data: AISummary
): Promise<void> {
  // Convert legacy format to insights
  const insights: Array<{
    text: string;
    category: InsightCategory;
    subcategory?: string;
    spoilerLevel?: SpoilerLevel;
    priority?: number;
  }> = [];

  // Add vibes (quickTake)
  data.quickTake.forEach((text, i) => {
    insights.push({
      text,
      category: "VIBE",
      priority: i + 1,
    });
  });

  // Add themes
  data.themes.forEach((text, i) => {
    insights.push({
      text,
      category: "THEME",
      priority: i + 1,
    });
  });

  // Add mood
  if (data.mood) {
    insights.push({ text: data.mood.pacing, category: "MOOD", subcategory: "pacing" });
    insights.push({ text: data.mood.intensity, category: "MOOD", subcategory: "intensity" });
    insights.push({ text: data.mood.tone, category: "MOOD", subcategory: "tone" });
    insights.push({ text: data.mood.emotional, category: "MOOD", subcategory: "emotional" });
  }

  // Add questions (pre_watch)
  data.aiQuestions.forEach((text, i) => {
    insights.push({
      text,
      category: "QUESTION",
      subcategory: "pre_watch",
      priority: i + 1,
    });
  });

  // Add watchContext as BEST_FOR
  (data.watchContext || []).forEach((text, i) => {
    insights.push({
      text,
      category: "BEST_FOR",
      subcategory: "context",
      priority: i + 1,
    });
  });

  // Add contentWarnings as HEADS_UP
  (data.contentWarnings || []).forEach((text, i) => {
    insights.push({
      text,
      category: "HEADS_UP",
      subcategory: "warning",
      priority: i + 1,
    });
  });

  await upsertAIData(tmdbId, mediaType, {
    hook: data.hook,
    modelId: data.modelId,
    insights,
  });
}

/**
 * Delete AI enrichment data (including all related insights via cascade)
 */
export async function deleteAIData(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<void> {
  const whereClause =
    mediaType === "movie" ? { movieId: tmdbId } : { seriesId: tmdbId };

  await prisma.aiData.deleteMany({
    where: whereClause,
  });

  log.info({ tmdbId, mediaType }, "AI data deleted");
}

/**
 * Get AI data for multiple items (batch) - new structured format
 *
 * Efficient batch query for getting AI data for multiple movies or series.
 * Does not use caching to avoid complexity with batch cache invalidation.
 */
export async function getAIDataBatch(
  ids: number[],
  mediaType: "movie" | "series"
): Promise<Map<number, AIDataResponse>> {
  const result = new Map<number, AIDataResponse>();

  if (ids.length === 0) return result;

  try {
    const whereClause =
      mediaType === "movie"
        ? { movieId: { in: ids } }
        : { seriesId: { in: ids } };

    const records = await prisma.aiData.findMany({
      where: whereClause,
      include: {
        insights: {
          orderBy: [{ category: "asc" }, { priority: "asc" }],
        },
      },
    });

    for (const record of records) {
      const id = mediaType === "movie" ? record.movieId : record.seriesId;
      if (!id) continue;

      const response = transformToAIDataResponse(record);
      result.set(id, response);
    }

    return result;
  } catch (error) {
    log.error({ error, ids, mediaType }, "Failed to fetch AI data batch");
    return result;
  }
}

/**
 * Get AI data for multiple items (batch) - legacy AISummary format
 *
 * @deprecated Use getAIDataBatch() for new code
 */
export async function getAIDataBatchLegacy(
  ids: number[],
  mediaType: "movie" | "series"
): Promise<Map<number, AISummary>> {
  const responses = await getAIDataBatch(ids, mediaType);
  const result = new Map<number, AISummary>();

  for (const [id, response] of responses) {
    result.set(id, aiDataResponseToSummary(response));
  }

  return result;
}
