/**
 * Embedding-Based Intent Classification
 *
 * Uses embedding similarity to classify query intent, reducing LLM costs by ~80%.
 * This is 500x cheaper and 10x faster than LLM-based parsing.
 *
 * Classification Pipeline:
 * 1. Regex (free, <5ms) - handles 70% of queries
 * 2. Embedding (cheap, ~100ms) - handles 25% of queries
 * 3. LLM (expensive, ~1-2s) - handles 5% of queries
 *
 * Cost Analysis:
 * - Regex: $0, <5ms
 * - Embedding: $0.00002, ~100ms
 * - LLM: $0.01, ~1-2s
 *
 * @see docs/ADVANCED_SEARCH_IMPLEMENTATION_PLAN.md
 */

import { generateQueryEmbedding } from "@/lib/embeddings/generator";
import { cacheGet, cacheSet } from "@/lib/cache-service";
import { classifyQueryIntent, type IntentAnalysis, type QueryIntent } from "./intent";
import { parseQueryWithLlm, type LlmParsedQuery } from "./llm-query-parser";
import { dataLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingIntentResult {
  intent: QueryIntent;
  confidence: number;
  method: "regex" | "embedding" | "llm";
  /** Best matching intent category with its score */
  matchDetails?: {
    bestMatch: QueryIntent;
    score: number;
    allScores: Record<QueryIntent, number>;
  };
}

export interface HybridIntentResult extends IntentAnalysis {
  /** Classification method used */
  method: "regex" | "embedding" | "llm";
  /** Embedding match details (if embedding was used) */
  embeddingMatch?: {
    intent: QueryIntent;
    score: number;
  };
}

// =============================================================================
// Constants - Intent Examples
// =============================================================================

/**
 * Example queries for each intent category.
 * These are used to generate reference embeddings for classification.
 * More examples = better classification accuracy.
 */
const INTENT_EXAMPLES: Record<QueryIntent, string[]> = {
  title: [
    "The Dark Knight",
    "Inception",
    "Breaking Bad",
    "Pulp Fiction",
    "The Godfather",
    "Stranger Things",
    "Schindler's List",
    "The Shawshank Redemption",
    "Fight Club",
    "Forrest Gump",
    "The Matrix",
    "Interstellar",
    "Game of Thrones",
    "The Office",
    "Friends",
    "Avengers Endgame",
    "Parasite",
    "Joker",
    "Oppenheimer",
    "Barbie",
  ],
  semantic: [
    "dark thrillers with plot twists",
    "feel-good movies about friendship",
    "mind-bending sci-fi about time",
    "emotional dramas that make you cry",
    "cozy movies for a rainy day",
    "intense psychological thrillers",
    "uplifting stories about underdogs",
    "mysterious movies with surprise endings",
    "heartwarming family films",
    "gritty crime dramas",
    "visually stunning cinematography",
    "thought-provoking films about society",
    "nostalgic 80s vibes",
    "atmospheric horror slow burn",
    "witty dialogue smart humor",
    "epic adventure journeys",
    "romantic comedies lighthearted",
    "dark comedy satire",
    "inspiring true stories",
    "suspenseful edge of seat",
  ],
  person: [
    "Christopher Nolan movies",
    "Tom Hanks filmography",
    "directed by Denis Villeneuve",
    "starring Margot Robbie",
    "Emma Stone films",
    "Quentin Tarantino movies",
    "films by Steven Spielberg",
    "Leonardo DiCaprio movies",
    "Meryl Streep performances",
    "movies with Keanu Reeves",
    "Martin Scorsese directed",
    "Aaron Sorkin written",
    "Greta Gerwig films",
    "Jordan Peele movies",
    "Ryan Gosling starring",
    "Florence Pugh movies",
    "Timothee Chalamet films",
    "Wes Anderson directed",
    "Coen Brothers movies",
    "David Fincher films",
  ],
  filter: [
    "horror movies from 2020",
    "animated films on Netflix",
    "comedy from the 90s",
    "Korean thrillers",
    "French romantic comedies",
    "HBO series",
    "action movies 2023",
    "documentaries on Prime",
    "Japanese anime films",
    "British crime dramas",
    "Spanish thrillers",
    "Disney Plus originals",
    "movies from 1999",
    "sci-fi series 2024",
    "Indian films on Netflix",
    "Apple TV shows",
    "movies before 1980",
    "German war films",
    "Italian cinema classics",
    "Australian comedies",
  ],
  mixed: [
    "dark Korean thriller from 2020 on Netflix",
    "feel-good comedy with Tom Hanks from the 90s",
    "mind-bending sci-fi like Inception but darker",
    "horror movies similar to The Conjuring on streaming",
    "emotional drama starring Joaquin Phoenix recent",
    "crime thriller directed by David Fincher 2010s",
    "romantic comedy on Hulu 2022",
    "animated family movie like Pixar on Disney",
    "psychological thriller with twist ending recent",
    "action adventure starring Dwayne Johnson Netflix",
  ],
};

/**
 * Weights for combining cosine similarity with other signals.
 * Title queries get a boost for short, capitalized queries.
 */
const INTENT_WEIGHTS: Record<QueryIntent, number> = {
  title: 1.0,
  semantic: 1.0,
  person: 1.0,
  filter: 1.0,
  mixed: 0.9, // Slightly lower weight since mixed is a catch-all
};

// =============================================================================
// Embedding Cache
// =============================================================================

/** Pre-computed intent embeddings (computed once, reused) */
let intentEmbeddings: Map<QueryIntent, number[]> | null = null;

/** Flag to track if initialization is in progress */
let initializationPromise: Promise<void> | null = null;

/** Cache TTL for query classification (24 hours) */
const CLASSIFICATION_CACHE_TTL = 86400;

// =============================================================================
// Cosine Similarity
// =============================================================================

/**
 * Compute cosine similarity between two vectors.
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// =============================================================================
// Intent Embedding Generation
// =============================================================================

/**
 * Generate a combined embedding for an intent category.
 * Concatenates all examples with newlines and generates a single embedding.
 */
async function generateIntentEmbedding(intent: QueryIntent): Promise<number[]> {
  const examples = INTENT_EXAMPLES[intent];
  // Join examples with newlines to create a representative text
  const combinedText = examples.join("\n");
  return generateQueryEmbedding(combinedText);
}

/**
 * Initialize all intent embeddings.
 * Call this on server startup to pre-compute embeddings.
 */
export async function initializeIntentEmbeddings(): Promise<void> {
  // If already initialized, return
  if (intentEmbeddings !== null) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise !== null) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    const startTime = Date.now();

    dataLogger.info({
      event: "intent_embeddings_init_start",
    });

    try {
      const intents = Object.keys(INTENT_EXAMPLES) as QueryIntent[];
      const embeddings = new Map<QueryIntent, number[]>();

      // Generate embeddings in parallel
      const results = await Promise.all(
        intents.map(async (intent) => {
          const embedding = await generateIntentEmbedding(intent);
          return { intent, embedding };
        })
      );

      for (const { intent, embedding } of results) {
        embeddings.set(intent, embedding);
      }

      intentEmbeddings = embeddings;

      dataLogger.info({
        event: "intent_embeddings_init_complete",
        intents: intents.length,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      dataLogger.error({
        event: "intent_embeddings_init_error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Check if intent embeddings are initialized.
 */
export function areIntentEmbeddingsReady(): boolean {
  return intentEmbeddings !== null;
}

// =============================================================================
// Embedding-Based Classification
// =============================================================================

/**
 * Classify query intent using embedding similarity.
 *
 * @param query - The search query to classify
 * @returns Classification result with intent, confidence, and method
 *
 * @example
 * const result = await classifyIntentViaEmbedding("dark thrillers with twists");
 * // → { intent: "semantic", confidence: 0.82, method: "embedding" }
 */
export async function classifyIntentViaEmbedding(query: string): Promise<EmbeddingIntentResult> {
  const startTime = Date.now();
  const normalizedQuery = query.toLowerCase().trim();

  // Check cache first
  const cacheKey = `intent-embed:${normalizedQuery}`;
  const cached = cacheGet<EmbeddingIntentResult>("search", cacheKey);
  if (cached) {
    dataLogger.debug({
      event: "intent_embedding_cache_hit",
      query: query.slice(0, 50),
    });
    return cached;
  }

  // Ensure embeddings are initialized
  if (!areIntentEmbeddingsReady()) {
    await initializeIntentEmbeddings();
  }

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query);

  // Compute similarity to each intent
  const scores: Record<QueryIntent, number> = {
    title: 0,
    semantic: 0,
    person: 0,
    filter: 0,
    mixed: 0,
  };

  const intents = Object.keys(INTENT_EXAMPLES) as QueryIntent[];
  for (const intent of intents) {
    const intentEmbed = intentEmbeddings!.get(intent)!;
    const similarity = cosineSimilarity(queryEmbedding, intentEmbed);
    // Apply intent-specific weight
    scores[intent] = similarity * INTENT_WEIGHTS[intent];
  }

  // Apply heuristic boosts
  applyHeuristicBoosts(query, scores);

  // Find best match
  let bestIntent: QueryIntent = "mixed";
  let bestScore = -1;

  for (const [intent, score] of Object.entries(scores) as [QueryIntent, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Normalize confidence to 0-1 range
  // Cosine similarity for embeddings typically ranges from 0.3-0.9 for related content
  const normalizedConfidence = Math.min(1, Math.max(0, (bestScore - 0.3) / 0.5));

  const result: EmbeddingIntentResult = {
    intent: bestIntent,
    confidence: normalizedConfidence,
    method: "embedding",
    matchDetails: {
      bestMatch: bestIntent,
      score: bestScore,
      allScores: scores,
    },
  };

  // Cache the result
  cacheSet("search", cacheKey, result, CLASSIFICATION_CACHE_TTL);

  dataLogger.debug({
    event: "intent_embedding_classified",
    query: query.slice(0, 50),
    intent: bestIntent,
    confidence: normalizedConfidence,
    rawScore: bestScore,
    durationMs: Date.now() - startTime,
  });

  return result;
}

/**
 * Apply heuristic boosts based on query characteristics.
 * This helps with edge cases that embeddings might miss.
 */
function applyHeuristicBoosts(query: string, scores: Record<QueryIntent, number>): void {
  const words = query.trim().split(/\s+/);
  const normalizedQuery = query.toLowerCase();

  // Short queries with title case are likely titles
  if (words.length <= 4 && /^[A-Z]/.test(query)) {
    scores.title += 0.1;
  }

  // Quoted queries are definitely titles
  if (/^["'].*["']$/.test(query)) {
    scores.title += 0.3;
  }

  // Person indicators boost person intent
  const personIndicators = ["directed", "starring", "by", "filmography", "movies with", "films by"];
  if (personIndicators.some((p) => normalizedQuery.includes(p))) {
    scores.person += 0.15;
  }

  // Year patterns boost filter intent
  if (/\b(19|20)\d{2}s?\b/.test(query) || /\b\d{4}s?\b/.test(query)) {
    scores.filter += 0.1;
  }

  // Streaming service names boost filter intent
  const streamingServices = [
    "netflix",
    "hulu",
    "disney",
    "prime",
    "hbo",
    "max",
    "apple tv",
    "peacock",
    "paramount",
  ];
  if (streamingServices.some((s) => normalizedQuery.includes(s))) {
    scores.filter += 0.15;
  }

  // Mood/vibe words boost semantic intent
  const semanticIndicators = [
    "feel-good",
    "cozy",
    "dark",
    "intense",
    "emotional",
    "thought-provoking",
    "uplifting",
    "mind-bending",
    "atmospheric",
    "gritty",
  ];
  if (semanticIndicators.some((s) => normalizedQuery.includes(s))) {
    scores.semantic += 0.15;
  }

  // "Similar to" or "like X" patterns boost semantic
  if (/\b(similar to|like\s+\w+|movies? like|shows? like)\b/i.test(query)) {
    scores.semantic += 0.2;
  }

  // Very long queries (>6 words) with descriptive content are likely semantic
  if (words.length > 6) {
    scores.semantic += 0.05;
    scores.mixed += 0.05;
  }
}

// =============================================================================
// Hybrid Classification (Main Function)
// =============================================================================

/**
 * Classify query intent using a hybrid approach.
 * Falls back through classification methods based on confidence:
 *
 * 1. Regex (fast, free) - if confidence >= 0.7
 * 2. Embedding (fast, cheap) - if confidence >= 0.65
 * 3. LLM (slow, expensive) - final fallback for ~5% of queries
 *
 * @param query - The search query to classify
 * @returns Full intent analysis with method used
 *
 * @example
 * // High confidence regex match
 * const result = await classifyQueryIntentHybrid("The Dark Knight");
 * // → { intent: "title", confidence: 0.8, method: "regex", ... }
 *
 * @example
 * // Embedding fallback
 * const result = await classifyQueryIntentHybrid("cozy rainy day movies");
 * // → { intent: "semantic", confidence: 0.78, method: "embedding", ... }
 *
 * @example
 * // LLM fallback for ambiguous queries
 * const result = await classifyQueryIntentHybrid("that one movie with the guy");
 * // → { intent: "mixed", confidence: 0.6, method: "llm", ... }
 */
export async function classifyQueryIntentHybrid(query: string): Promise<HybridIntentResult> {
  const startTime = Date.now();

  // Step 1: Try regex classification (fast, free)
  const regexResult = classifyQueryIntent(query);

  if (regexResult.confidence >= 0.7) {
    dataLogger.debug({
      event: "intent_classification_complete",
      query: query.slice(0, 50),
      method: "regex",
      intent: regexResult.intent,
      confidence: regexResult.confidence,
      durationMs: Date.now() - startTime,
    });

    return {
      ...regexResult,
      method: "regex",
    };
  }

  // Step 2: Try embedding classification (fast, cheap)
  try {
    const embeddingResult = await classifyIntentViaEmbedding(query);

    if (embeddingResult.confidence >= 0.65) {
      // Merge embedding result with regex result (keep extracted filters from regex)
      dataLogger.debug({
        event: "intent_classification_complete",
        query: query.slice(0, 50),
        method: "embedding",
        intent: embeddingResult.intent,
        confidence: embeddingResult.confidence,
        regexIntent: regexResult.intent,
        regexConfidence: regexResult.confidence,
        durationMs: Date.now() - startTime,
      });

      return {
        ...regexResult,
        intent: embeddingResult.intent,
        confidence: embeddingResult.confidence,
        method: "embedding",
        embeddingMatch: {
          intent: embeddingResult.intent,
          score: embeddingResult.matchDetails?.score || embeddingResult.confidence,
        },
        // Keep needsLlmParsing false since embedding was confident
        needsLlmParsing: false,
      };
    }
  } catch (error) {
    dataLogger.warn({
      event: "intent_embedding_fallback_error",
      query: query.slice(0, 50),
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue to LLM fallback
  }

  // Step 3: Fall back to LLM (slow, expensive) - only ~5% of queries
  if (regexResult.needsLlmParsing) {
    const llmResult = await parseQueryWithLlm(query);

    if (llmResult) {
      dataLogger.info({
        event: "intent_classification_complete",
        query: query.slice(0, 50),
        method: "llm",
        llmConfidence: llmResult.confidence,
        durationMs: Date.now() - startTime,
      });

      // Merge LLM results with regex results
      return mergeLlmResultWithIntent(regexResult, llmResult);
    }
  }

  // Final fallback: return regex result with low confidence
  dataLogger.debug({
    event: "intent_classification_complete",
    query: query.slice(0, 50),
    method: "regex",
    intent: regexResult.intent,
    confidence: regexResult.confidence,
    note: "fallback_to_regex",
    durationMs: Date.now() - startTime,
  });

  return {
    ...regexResult,
    method: "regex",
  };
}

/**
 * Merge LLM parsing results with regex intent analysis.
 */
function mergeLlmResultWithIntent(
  regexResult: IntentAnalysis,
  llmResult: LlmParsedQuery
): HybridIntentResult {
  // Determine intent based on LLM results
  let intent: QueryIntent = regexResult.intent;

  if (llmResult.similarTo) {
    intent = "semantic";
  } else if (llmResult.person) {
    intent = "person";
  } else if (llmResult.yearRange || llmResult.streamingService) {
    if (llmResult.mood || llmResult.genres.length > 0) {
      intent = "mixed";
    } else {
      intent = "filter";
    }
  } else if (llmResult.mood) {
    intent = "semantic";
  } else if (llmResult.genres.length > 0) {
    intent = regexResult.intent === "title" ? "title" : "semantic";
  }

  // Merge extracted filters
  const mergedFilters = {
    ...regexResult.extractedFilters,
    genres:
      llmResult.genres.length > 0
        ? llmResult.genres.map((g) => g.toLowerCase())
        : regexResult.extractedFilters?.genres,
    yearRange: llmResult.yearRange || regexResult.extractedFilters?.yearRange,
    person: llmResult.person || regexResult.extractedFilters?.person,
    similarTo: llmResult.similarTo
      ? { title: llmResult.similarTo }
      : regexResult.extractedFilters?.similarTo,
    streamingService: llmResult.streamingService || regexResult.extractedFilters?.streamingService,
  };

  return {
    ...regexResult,
    intent,
    confidence: Math.max(regexResult.confidence, llmResult.confidence),
    extractedFilters: mergedFilters,
    cleanedQuery: llmResult.mood || llmResult.cleanedQuery || regexResult.cleanedQuery,
    needsLlmParsing: false,
    method: "llm",
  };
}

// =============================================================================
// Metrics and Logging
// =============================================================================

/**
 * Log classification metrics for analytics.
 * Call this periodically or on specific events to track classification distribution.
 */
export function logClassificationMetrics(
  query: string,
  result: HybridIntentResult,
  durationMs: number
): void {
  dataLogger.info({
    type: "intent_classification",
    event: "classification_metrics",
    query: query.slice(0, 100),
    intent: result.intent,
    confidence: result.confidence,
    method: result.method,
    hasFilters: Boolean(
      result.extractedFilters?.genres?.length ||
        result.extractedFilters?.yearRange ||
        result.extractedFilters?.person ||
        result.extractedFilters?.similarTo ||
        result.extractedFilters?.streamingService
    ),
    durationMs,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { classifyQueryIntent } from "./intent";
export type { QueryIntent, IntentAnalysis, ExtractedFilters } from "./intent";
