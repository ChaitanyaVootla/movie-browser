/**
 * LLM Query Parser for Complex Natural Language Queries
 *
 * Uses Kimi K2 via AWS Bedrock to parse complex movie/TV search queries
 * that regex-based parsing cannot handle well (intent confidence < 0.6).
 *
 * This parser extracts:
 * - Genres (mapped to TMDB genre names)
 * - Mood descriptors (for semantic search)
 * - Year ranges
 * - Person names (actors/directors)
 * - "Similar to" references (title names)
 * - Streaming service filters
 *
 * @example
 * // Complex query that regex struggles with
 * const result = await parseQueryWithLlm("feel-good movies for a rainy Sunday");
 * // → { genres: ["Comedy", "Romance"], mood: "feel-good cozy heartwarming", ... }
 *
 * @example
 * // Multi-filter query
 * const result = await parseQueryWithLlm("dark Korean thrillers like Parasite");
 * // → { genres: ["Thriller"], mood: "dark intense", similarTo: "Parasite", ... }
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { aiLogger, usageLogger } from "@/lib/logger";
import { cacheGet, cacheSet } from "@/lib/cache-service";
import { trackSearchLLMUsage } from "@/lib/analytics/track";
import { calculateCost, getModelPricing } from "@/lib/model-pricing";

// =============================================================================
// Types
// =============================================================================

export interface LlmParsedQuery {
  /** Extracted genre names (e.g., "Action", "Horror", "Comedy") */
  genres: string[];
  /** Mood/vibe descriptors for semantic search (e.g., "dark atmospheric", "feel-good cozy") */
  mood: string | null;
  /** Year range filter as [startYear, endYear] */
  yearRange: [number, number] | null;
  /** Actor or director name to filter by */
  person: string | null;
  /** Title name for "similar to" queries (not ID - needs resolution later) */
  similarTo: string | null;
  /** Streaming service filter (e.g., "Netflix", "Disney+") */
  streamingService: string | null;
  /** Query with filters extracted, for semantic search */
  cleanedQuery: string;
  /** LLM's confidence in its parsing (0-1) */
  confidence: number;
}

interface BedrockResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// =============================================================================
// Configuration
// =============================================================================

const MODEL_ID = process.env.LLM_PARSER_MODEL_ID || "moonshot.kimi-k2-thinking";
const REGION = process.env.BEDROCK_REGION || "us-east-1";

/** LLM parsing timeout in milliseconds */
const LLM_TIMEOUT_MS = 5000;

/** Cache TTL for parsed queries (15 minutes) */
const CACHE_TTL_SECONDS = 900;

/**
 * Tier-3 LLM query parsing is OPT-IN (June 2026, default OFF).
 *
 * It is a 1–2s SYNCHRONOUS Bedrock call on the search hot path, and search is
 * hammered by crawlers — running an LLM there is both a latency landmine (the
 * unlucky ~5% of queries waited 1–2s+) and a cost/abuse exposure that violates the
 * codebase invariant "never invoke AI on a render/crawler path". With it off, the
 * regex + embedding tiers handle classification deterministically and, when a query
 * is genuinely too ambiguous, the UI surfaces an explicit "Ask Cue" action — moving
 * the AI cost to an intentional click. Set `SEARCH_LLM_ENABLED=true` to restore
 * inline LLM parsing.
 */
export function isSearchLlmEnabled(): boolean {
  return process.env.SEARCH_LLM_ENABLED === "true";
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are a movie/TV search query parser. Extract structured filters from natural language queries.

Return ONLY valid JSON with these fields:
{
  "genres": [],           // Array of genre names like "Action", "Horror", "Comedy", "Drama", "Thriller", "Romance", "Science Fiction", "Fantasy", "Animation", "Documentary", "Crime", "Mystery", "Adventure", "Family", "War", "Western", "Music", "History"
  "mood": null,           // Descriptive words for semantic search like "dark atmospheric", "feel-good cozy", "intense gripping", "lighthearted fun"
  "yearRange": null,      // [startYear, endYear] or null. For decades like "90s" use [1990, 1999]
  "person": null,         // Actor or director name, or null
  "similarTo": null,      // Movie/show title to find similar content to, or null
  "streamingService": null, // Netflix, Disney+, Amazon Prime Video, Max, Apple TV+, Hulu, Peacock, Paramount+, etc. or null
  "cleanedQuery": "",     // Remaining query for semantic search after removing filters. Should capture the essence of what user wants.
  "confidence": 0.8       // Your confidence in this parsing (0-1)
}

Rules:
- Be precise with genres - use exact TMDB genre names
- "mood" should capture emotional/atmospheric qualities for semantic matching
- "cleanedQuery" should be useful for semantic search - not just leftover words
- For "similar to" patterns like "like Inception" or "similar to The Matrix", extract the title
- Normalize streaming services (e.g., "HBO Max" -> "Max", "Prime" -> "Amazon Prime Video")
- Return confidence 0.5-0.7 if query is ambiguous, 0.8+ if clear

Examples:
- "feel-good movies for a rainy Sunday" -> {"genres": ["Comedy", "Romance"], "mood": "feel-good cozy heartwarming uplifting", "cleanedQuery": "movies perfect for relaxing at home", "confidence": 0.85}
- "dark Korean thrillers like Parasite" -> {"genres": ["Thriller"], "mood": "dark intense Korean cinema", "similarTo": "Parasite", "cleanedQuery": "Korean thriller films", "confidence": 0.9}
- "90s action movies on Netflix" -> {"genres": ["Action"], "yearRange": [1990, 1999], "streamingService": "Netflix", "cleanedQuery": "classic action films", "confidence": 0.95}
- "something with Tom Hanks" -> {"person": "Tom Hanks", "cleanedQuery": "films starring Tom Hanks", "confidence": 0.9}
- "mind-bending sci-fi about time travel" -> {"genres": ["Science Fiction"], "mood": "mind-bending complex cerebral", "cleanedQuery": "science fiction about time travel paradoxes", "confidence": 0.85}
- "that movie where the guy relives the same day" -> {"mood": "time loop comedic philosophical", "cleanedQuery": "movie about repeating the same day", "confidence": 0.7}`;

// =============================================================================
// Bedrock Client
// =============================================================================

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    // Explicit credentials for local dev; on EC2 they are intentionally unset
    // and the SDK resolves the instance profile automatically (same pattern as
    // cohere-generator.ts). The old hard requirement on static keys made the
    // Tier-3 LLM parser permanently fail in production.
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    bedrockClient = new BedrockRuntimeClient({
      region: REGION,
      ...(credentials && { credentials }),
    });
  }
  return bedrockClient;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Parse a complex natural language search query using Kimi K2.
 *
 * This function is designed to handle queries that regex-based parsing
 * struggles with, such as:
 * - Mood/vibe-based queries ("feel-good movies for a lazy Sunday")
 * - Complex multi-filter queries ("dark Korean thrillers like Parasite")
 * - Ambiguous queries ("that one movie with the guy")
 *
 * @param query - The search query to parse
 * @returns Parsed query structure, or null on error (caller should fall back to regex)
 *
 * @example
 * const result = await parseQueryWithLlm("feel-good movies for a rainy Sunday");
 * if (result) {
 *   console.log(result.genres); // ["Comedy", "Romance"]
 *   console.log(result.mood);   // "feel-good cozy heartwarming"
 * }
 */
export async function parseQueryWithLlm(query: string): Promise<LlmParsedQuery | null> {
  // OPT-IN gate: by default the LLM tier never runs on the search path (see
  // isSearchLlmEnabled). Returning null is exactly the "no parse" path callers
  // already handle, so classification cleanly degrades to regex + embedding and
  // `needsLlmParsing` resolves to false downstream.
  if (!isSearchLlmEnabled()) return null;

  const startTime = Date.now();
  const normalizedQuery = query.toLowerCase().trim();

  // Check cache first
  const cacheKey = `llm-query-parse:${normalizedQuery}`;
  const cached = cacheGet<LlmParsedQuery>("search", cacheKey);
  if (cached) {
    aiLogger.debug({
      event: "llm_query_parser_cache_hit",
      query: query.slice(0, 50),
    });
    return cached;
  }

  try {
    const client = getBedrockClient();

    // Build the request payload for Kimi K2
    const payload = {
      messages: [
        {
          role: "user",
          content: `${SYSTEM_PROMPT}\n\nParse this query:\n"${query}"\n\nReturn ONLY the JSON response, no markdown or explanation.`,
        },
      ],
      max_tokens: 512,
      temperature: 0.3, // Low temperature for consistent structured output
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    // Execute with timeout
    const response = await Promise.race([
      client.send(command),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM parsing timeout")), LLM_TIMEOUT_MS)
      ),
    ]);

    const durationMs = Date.now() - startTime;

    // Parse response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as BedrockResponse;

    // Extract text content from response
    let responseText = "";
    if (responseBody.content && Array.isArray(responseBody.content)) {
      for (const block of responseBody.content) {
        if (block.type === "text" && block.text) {
          responseText = block.text;
          break;
        }
      }
    }

    if (!responseText) {
      aiLogger.warn({
        event: "llm_query_parser_empty_response",
        query: query.slice(0, 50),
        durationMs,
      });
      return null;
    }

    // Clean and parse JSON response
    const parsed = parseJsonResponse(responseText);
    if (!parsed) {
      aiLogger.warn({
        event: "llm_query_parser_invalid_json",
        query: query.slice(0, 50),
        responsePreview: responseText.slice(0, 200),
        durationMs,
      });
      return null;
    }

    // Validate and normalize the parsed result
    const result = validateAndNormalize(parsed);

    // Log token usage
    const inputTokens = responseBody.usage?.input_tokens || 0;
    const outputTokens = responseBody.usage?.output_tokens || 0;

    usageLogger.info({
      type: "cost/usage",
      event: "llm_query_parser_complete",
      model: MODEL_ID,
      query: query.slice(0, 100),
      tokens: { input: inputTokens, output: outputTokens },
      durationMs,
      confidence: result.confidence,
      hasGenres: result.genres.length > 0,
      hasMood: Boolean(result.mood),
      hasYearRange: Boolean(result.yearRange),
      hasPerson: Boolean(result.person),
      hasSimilarTo: Boolean(result.similarTo),
      hasStreamingService: Boolean(result.streamingService),
    });

    // Track to ClickHouse for cost dashboard
    try {
      const pricing = getModelPricing(MODEL_ID);
      const cost = calculateCost(MODEL_ID, inputTokens, outputTokens);
      trackSearchLLMUsage({
        query: query.slice(0, 500),
        modelId: MODEL_ID,
        modelName: pricing.name,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        durationMs,
        responseLength: responseText.length,
      });
    } catch {
      // Fire-and-forget: tracking errors must never break search
    }

    aiLogger.info({
      event: "llm_query_parser_success",
      query: query.slice(0, 50),
      durationMs,
      confidence: result.confidence,
    });

    // Cache the result
    cacheSet("search", cacheKey, result, CACHE_TTL_SECONDS);

    return result;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    aiLogger.warn({
      event: "llm_query_parser_error",
      query: query.slice(0, 50),
      error: errorMessage,
      durationMs,
    });

    return null;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJsonResponse(text: string): Partial<LlmParsedQuery> | null {
  try {
    // Clean up response - remove potential markdown code blocks
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned) as Partial<LlmParsedQuery>;
  } catch {
    // Try to find JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as Partial<LlmParsedQuery>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validate and normalize the parsed result
 */
function validateAndNormalize(parsed: Partial<LlmParsedQuery>): LlmParsedQuery {
  return {
    genres: normalizeGenres(parsed.genres),
    mood: typeof parsed.mood === "string" ? parsed.mood.trim() || null : null,
    yearRange: normalizeYearRange(parsed.yearRange),
    person: typeof parsed.person === "string" ? parsed.person.trim() || null : null,
    similarTo: typeof parsed.similarTo === "string" ? parsed.similarTo.trim() || null : null,
    streamingService: normalizeStreamingService(parsed.streamingService),
    cleanedQuery:
      typeof parsed.cleanedQuery === "string" ? parsed.cleanedQuery.trim() : "",
    confidence: normalizeConfidence(parsed.confidence),
  };
}

/**
 * Normalize genre array to valid TMDB genre names
 */
function normalizeGenres(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];

  const validGenres = new Set([
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "History",
    "Horror",
    "Music",
    "Mystery",
    "Romance",
    "Science Fiction",
    "TV Movie",
    "Thriller",
    "War",
    "Western",
  ]);

  return genres
    .filter((g): g is string => typeof g === "string")
    .map((g) => {
      // Normalize case
      const normalized = g
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      // Handle common variations
      if (normalized.toLowerCase() === "sci-fi" || normalized.toLowerCase() === "scifi") {
        return "Science Fiction";
      }
      if (normalized.toLowerCase() === "rom-com" || normalized.toLowerCase() === "romcom") {
        return "Romance"; // Also add Comedy in the filter
      }

      return normalized;
    })
    .filter((g) => validGenres.has(g));
}

/**
 * Normalize year range to valid bounds
 */
function normalizeYearRange(yearRange: unknown): [number, number] | null {
  if (!Array.isArray(yearRange) || yearRange.length !== 2) return null;

  const [start, end] = yearRange;
  if (typeof start !== "number" || typeof end !== "number") return null;

  const currentYear = new Date().getFullYear();
  const normalizedStart = Math.max(1900, Math.min(start, currentYear + 5));
  const normalizedEnd = Math.max(normalizedStart, Math.min(end, currentYear + 5));

  return [normalizedStart, normalizedEnd];
}

/**
 * Normalize streaming service name
 */
function normalizeStreamingService(service: unknown): string | null {
  if (typeof service !== "string" || !service.trim()) return null;

  const normalized = service.trim();

  // Normalize common variations
  const serviceMap: Record<string, string> = {
    "hbo max": "Max",
    hbo: "Max",
    "disney plus": "Disney+",
    disneyplus: "Disney+",
    disney: "Disney+",
    "amazon prime": "Amazon Prime Video",
    "prime video": "Amazon Prime Video",
    prime: "Amazon Prime Video",
    "apple tv": "Apple TV+",
    appletv: "Apple TV+",
    "paramount plus": "Paramount+",
  };

  const lowerService = normalized.toLowerCase();
  return serviceMap[lowerService] || normalized;
}

/**
 * Normalize confidence score to 0-1 range
 */
function normalizeConfidence(confidence: unknown): number {
  if (typeof confidence !== "number") return 0.5;
  return Math.max(0, Math.min(1, confidence));
}
