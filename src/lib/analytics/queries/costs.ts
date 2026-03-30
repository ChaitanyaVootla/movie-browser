/**
 * Unified Cost Breakdown Analytics Queries
 *
 * Aggregates costs across all services: LLM chat, LLM search parsing,
 * embeddings, and Lambda. Returns a unified view for the admin dashboard.
 */

import { query } from "../client";
import { calculateEmbeddingCost } from "@/lib/model-pricing";
import { estimateLambdaCost } from "./lambda";
import { getTimeRangeCondition, type TimeRange } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface ServiceCost {
  /** Total cost in USD */
  cost: number;
  /** Number of invocations/calls */
  calls: number;
}

export interface DailyCostBreakdown {
  date: string;
  llmChat: number;
  llmSearchParsing: number;
  embedding: number;
  lambda: number;
  total: number;
}

export interface UnifiedCostBreakdown {
  llmChat: ServiceCost;
  llmSearchParsing: ServiceCost;
  embedding: ServiceCost;
  lambda: ServiceCost;
  total: number;
  daily: DailyCostBreakdown[];
}

// =============================================================================
// Unified Cost Breakdown
// =============================================================================

/**
 * Get unified cost breakdown across all services.
 * Aggregates: LLM chat, LLM search parsing, embedding, and Lambda costs.
 */
export async function getUnifiedCostBreakdown(range: TimeRange): Promise<UnifiedCostBreakdown> {
  const timeCondition = getTimeRangeCondition(range);

  // Run all queries in parallel
  const [llmChat, llmSearchParsing, embedding, lambda, daily] = await Promise.all([
    // LLM chat costs (ai_usage excluding search_llm_parsing)
    query<{ cost: string; calls: string }>(`
      SELECT
        sum(total_cost) AS cost,
        count() AS calls
      FROM ai_usage
      WHERE query_type != 'search_llm_parsing' AND ${timeCondition}
    `),

    // LLM search parsing costs
    query<{ cost: string; calls: string }>(`
      SELECT
        sum(total_cost) AS cost,
        count() AS calls
      FROM ai_usage
      WHERE query_type = 'search_llm_parsing' AND ${timeCondition}
    `),

    // Embedding costs (from api_calls)
    query<{ tokens: string; calls: string }>(`
      SELECT
        sum(tokens) AS tokens,
        count() AS calls
      FROM api_calls
      WHERE service = 'embedding' AND ${timeCondition}
    `),

    // Lambda costs (from api_calls)
    query<{ calls: string; total_duration: string }>(`
      SELECT
        count() AS calls,
        sum(duration_ms) AS total_duration
      FROM api_calls
      WHERE service = 'lambda' AND ${timeCondition}
    `),

    // Daily breakdown — union of all four sources
    getDailyCostBreakdown(range),
  ]);

  const llmChatResult = llmChat[0];
  const llmSearchResult = llmSearchParsing[0];
  const embeddingResult = embedding[0];
  const lambdaResult = lambda[0];

  const embeddingTokens = parseInt(embeddingResult?.tokens || "0", 10);
  const embeddingCost = calculateEmbeddingCost(embeddingTokens, "search_query");

  const lambdaCalls = parseInt(lambdaResult?.calls || "0", 10);
  const lambdaDurationMs = parseFloat(lambdaResult?.total_duration || "0");
  const lambdaCost = estimateLambdaCost(lambdaCalls, lambdaDurationMs);

  const llmChatCost = parseFloat(llmChatResult?.cost || "0");
  const llmSearchCost = parseFloat(llmSearchResult?.cost || "0");

  return {
    llmChat: {
      cost: llmChatCost,
      calls: parseInt(llmChatResult?.calls || "0", 10),
    },
    llmSearchParsing: {
      cost: llmSearchCost,
      calls: parseInt(llmSearchResult?.calls || "0", 10),
    },
    embedding: {
      cost: embeddingCost,
      calls: parseInt(embeddingResult?.calls || "0", 10),
    },
    lambda: {
      cost: lambdaCost,
      calls: lambdaCalls,
    },
    total: llmChatCost + llmSearchCost + embeddingCost + lambdaCost,
    daily,
  };
}

// =============================================================================
// Daily Cost Breakdown (internal helper)
// =============================================================================

async function getDailyCostBreakdown(range: TimeRange): Promise<DailyCostBreakdown[]> {
  const timeCondition = getTimeRangeCondition(range);

  // Fetch daily data from each source in parallel
  const [aiDaily, embeddingDaily, lambdaDaily] = await Promise.all([
    // AI daily (split by query_type)
    query<{
      date: string;
      chat_cost: string;
      parsing_cost: string;
    }>(`
      SELECT
        toDate(timestamp) AS date,
        sumIf(total_cost, query_type != 'search_llm_parsing') AS chat_cost,
        sumIf(total_cost, query_type = 'search_llm_parsing') AS parsing_cost
      FROM ai_usage
      WHERE ${timeCondition}
      GROUP BY date
      ORDER BY date
    `),

    // Embedding daily
    query<{
      date: string;
      tokens: string;
    }>(`
      SELECT
        toDate(timestamp) AS date,
        sum(tokens) AS tokens
      FROM api_calls
      WHERE service = 'embedding' AND ${timeCondition}
      GROUP BY date
      ORDER BY date
    `),

    // Lambda daily
    query<{
      date: string;
      calls: string;
      total_duration: string;
    }>(`
      SELECT
        toDate(timestamp) AS date,
        count() AS calls,
        sum(duration_ms) AS total_duration
      FROM api_calls
      WHERE service = 'lambda' AND ${timeCondition}
      GROUP BY date
      ORDER BY date
    `),
  ]);

  // Merge all daily data into a single map
  const dateMap = new Map<string, DailyCostBreakdown>();

  const getOrCreate = (date: string): DailyCostBreakdown => {
    let entry = dateMap.get(date);
    if (!entry) {
      entry = { date, llmChat: 0, llmSearchParsing: 0, embedding: 0, lambda: 0, total: 0 };
      dateMap.set(date, entry);
    }
    return entry;
  };

  for (const row of aiDaily) {
    const entry = getOrCreate(row.date);
    entry.llmChat = parseFloat(row.chat_cost);
    entry.llmSearchParsing = parseFloat(row.parsing_cost);
  }

  for (const row of embeddingDaily) {
    const entry = getOrCreate(row.date);
    entry.embedding = calculateEmbeddingCost(parseInt(row.tokens, 10), "search_query");
  }

  for (const row of lambdaDaily) {
    const entry = getOrCreate(row.date);
    entry.lambda = estimateLambdaCost(
      parseInt(row.calls, 10),
      parseFloat(row.total_duration)
    );
  }

  // Calculate totals and sort by date
  const result = Array.from(dateMap.values());
  for (const entry of result) {
    entry.total = entry.llmChat + entry.llmSearchParsing + entry.embedding + entry.lambda;
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}
