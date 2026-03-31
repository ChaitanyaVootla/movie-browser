/**
 * Tavily API Client
 *
 * Shared client for web search and content extraction tools.
 * Handles API key validation, default parameters, logging, and error handling.
 *
 * Credit budget: 1,000 free credits/month (no rollover).
 * - Basic search: 1 credit
 * - Advanced search: 2 credits
 * - Basic extract (per 5 URLs): 1 credit
 */

import { tavily, type TavilySearchOptions, type TavilyExtractOptions } from "@tavily/core";
import { aiToolLogger } from "@/lib/logger";

type TavilyClient = ReturnType<typeof tavily>;

let clientInstance: TavilyClient | null = null;
let apiKeyMissing = false;

/**
 * Get or create the shared Tavily client instance.
 * Returns null if TAVILY_API_KEY is not set.
 */
function getClient(): TavilyClient | null {
  if (apiKeyMissing) return null;

  if (!clientInstance) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      apiKeyMissing = true;
      aiToolLogger.warn({
        event: "tavily_no_api_key",
        message: "TAVILY_API_KEY not set — web search and extract tools will return errors",
      });
      return null;
    }
    clientInstance = tavily({ apiKey });
  }

  return clientInstance;
}

/** Default search parameters (credit-conservative) */
const SEARCH_DEFAULTS: TavilySearchOptions = {
  searchDepth: "basic",
  maxResults: 5,
  includeAnswer: "basic",
  includeImages: true,
  includeImageDescriptions: true,
  includeRawContent: false,
  includeFavicon: true,
};

/** Default extract parameters */
const EXTRACT_DEFAULTS: TavilyExtractOptions = {
  extractDepth: "basic",
  includeFavicon: true,
};

/** Params for our search wrapper (query is separate in the SDK) */
export interface TavilySearchParams {
  query: string;
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
}

/** Params for our extract wrapper (urls is separate in the SDK) */
export interface TavilyExtractParams {
  urls: string[];
  extractDepth?: "basic" | "advanced";
  query?: string;
}

/** Normalized search response */
export interface SearchResponse {
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    favicon?: string;
  }>;
  images: Array<{ url: string; description?: string }>;
}

/** Normalized extract response */
export interface ExtractResponse {
  results: Array<{
    url: string;
    rawContent: string;
    images: string[];
    favicon?: string;
  }>;
  failedResults: Array<{
    url: string;
    error: string;
  }>;
}

/**
 * Perform a web search via Tavily API.
 */
export async function tavilySearch(params: TavilySearchParams): Promise<SearchResponse> {
  const client = getClient();
  if (!client) {
    throw new TavilyConfigError("TAVILY_API_KEY is not configured. Web search is unavailable.");
  }

  const options: TavilySearchOptions = {
    ...SEARCH_DEFAULTS,
    searchDepth: params.searchDepth ?? SEARCH_DEFAULTS.searchDepth,
    topic: params.topic,
    timeRange: params.timeRange,
    includeDomains: params.includeDomains,
    excludeDomains: params.excludeDomains,
  };

  const startTime = Date.now();

  try {
    aiToolLogger.debug({
      event: "tavily_search_start",
      query: params.query,
      searchDepth: options.searchDepth,
      topic: options.topic,
      maxResults: options.maxResults,
    });

    const response = await client.search(params.query, options);
    const durationMs = Date.now() - startTime;

    aiToolLogger.info({
      event: "tavily_search_complete",
      query: params.query,
      searchDepth: options.searchDepth,
      resultCount: response.results?.length ?? 0,
      hasAnswer: !!response.answer,
      durationMs,
      credits: options.searchDepth === "advanced" ? 2 : 1,
    });

    return {
      answer: response.answer,
      results: (response.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        favicon: r.favicon,
      })),
      images: (response.images || []).map((img) =>
        typeof img === "string" ? { url: img } : img
      ),
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    handleTavilyError(error, "search", params.query, durationMs);
    throw error;
  }
}

/**
 * Extract content from URLs via Tavily API.
 */
export async function tavilyExtract(params: TavilyExtractParams): Promise<ExtractResponse> {
  const client = getClient();
  if (!client) {
    throw new TavilyConfigError("TAVILY_API_KEY is not configured. Web extract is unavailable.");
  }

  const options: TavilyExtractOptions = {
    ...EXTRACT_DEFAULTS,
    extractDepth: params.extractDepth ?? EXTRACT_DEFAULTS.extractDepth,
    query: params.query,
  };

  const startTime = Date.now();

  try {
    aiToolLogger.debug({
      event: "tavily_extract_start",
      urlCount: params.urls.length,
      extractDepth: options.extractDepth,
    });

    const response = await client.extract(params.urls, options);
    const durationMs = Date.now() - startTime;

    aiToolLogger.info({
      event: "tavily_extract_complete",
      urlCount: params.urls.length,
      successCount: response.results?.length ?? 0,
      failedCount: response.failedResults?.length ?? 0,
      durationMs,
    });

    return {
      results: (response.results || []).map((r) => ({
        url: r.url,
        rawContent: r.rawContent,
        images: r.images || [],
        favicon: r.favicon,
      })),
      failedResults: response.failedResults || [],
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    handleTavilyError(error, "extract", params.urls.join(", "), durationMs);
    throw error;
  }
}

/**
 * Custom error class for missing API key (distinct from API errors).
 */
export class TavilyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TavilyConfigError";
  }
}

/**
 * Centralized error handling with structured logging.
 */
function handleTavilyError(
  error: unknown,
  operation: "search" | "extract",
  context: string,
  durationMs: number
): void {
  const message = error instanceof Error ? error.message : String(error);
  const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate limit");

  aiToolLogger.error({
    event: `tavily_${operation}_error`,
    context,
    error: message,
    isRateLimit,
    durationMs,
  });

  if (isRateLimit) {
    aiToolLogger.warn({
      event: "tavily_rate_limit",
      operation,
      message: "Tavily API rate limit reached. Free tier: 1,000 credits/month. Check usage at app.tavily.com.",
    });
  }
}
