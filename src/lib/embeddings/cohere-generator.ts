/**
 * Cohere Embed v4 Generator
 *
 * Generates vector embeddings using AWS Bedrock's Cohere Embed v4 model.
 * Superior semantic understanding with asymmetric input_type selection
 * (search_document vs search_query) for better retrieval quality.
 *
 * Key Features:
 * - Configurable dimensions (256-1536, we use 1024)
 * - Input type selection: search_document (corpus) vs search_query (queries)
 * - Multiple embedding formats: float, int8, uint8, binary, ubinary
 * - Up to ~128k token context length
 * - Better semantic matching, less title-based bias
 *
 * Model: cohere.embed-v4:0
 * Docs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { prisma } from "@/server/db/postgres";
import { buildMovieEmbeddingText, buildSeriesEmbeddingText, estimateTokens } from "./text-builder";
import pino from "pino";
import type { Credit, MovieGenre, MovieKeyword, Person, Genre, Keyword } from "@prisma/client";

const logger = pino({ name: "cohere-embeddings" });

// =============================================================================
// Configuration
// =============================================================================

/**
 * Cohere Embed v4 Configuration
 * - Dimensions: 256-1536 (we use 1024)
 * - Max input: ~128k tokens
 * - Model ID: global.cohere.embed-v4:0 (cross-region inference)
 */
// Use global cross-region inference profile for fastest routing from ap-south-1 (Mumbai)
// This routes to the nearest Cohere-available region (us-east-1, eu-west-1, or ap-northeast-1)
const COHERE_MODEL_ID = process.env.COHERE_EMBED_MODEL_ID || "global.cohere.embed-v4:0";
const COHERE_DIMENSIONS = 1024;
const COHERE_EMBEDDING_TYPE = "float" as const; // float, int8, uint8, binary, ubinary

const BATCH_SIZE = 100; // Process 100 items at a time
const CONCURRENT_API_CALLS = 25; // High concurrency for Bedrock
const RATE_LIMIT_DELAY_MS = 50; // Small delay between batches
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ap-south-1 (Mumbai) — closest to Hyderabad EC2, global inference profile handles routing
const AWS_REGION = process.env.BEDROCK_REGION || "ap-south-1";

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingStats {
  processed: number;
  skipped: number;
  errors: number;
  tokensUsed: number;
}

export interface GenerateEmbeddingsOptions {
  /** Maximum items to process */
  limit?: number;
  /** Minimum popularity filter */
  minPopularity?: number;
  /** Don't actually generate embeddings, just count */
  dryRun?: boolean;
  /** Custom dimensions (256-1536, default 1024) */
  dimensions?: number;
  /** Force regenerate even if embeddings exist */
  force?: boolean;
}

/**
 * Cohere Embed v4 Request
 * Docs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html
 */
interface CohereEmbedRequest {
  /** Array of text strings to embed */
  texts: string[];

  /**
   * Input type affects embedding optimization:
   * - search_document: For documents being stored in vector DB (corpus)
   * - search_query: For user search queries
   * - classification: For classification tasks
   * - clustering: For clustering tasks
   * - image: For image embeddings (multimodal)
   */
  input_type: "search_document" | "search_query" | "classification" | "clustering" | "image";

  /**
   * Embedding format types:
   * - float: Standard floating point (best quality)
   * - int8: 8-bit integer (quantized)
   * - uint8: Unsigned 8-bit integer
   * - binary: Binary embeddings (ultra-compressed)
   * - ubinary: Unsigned binary
   */
  embedding_types: ("float" | "int8" | "uint8" | "binary" | "ubinary")[];

  /** How to truncate if text exceeds limit (default: RIGHT) */
  truncate?: "NONE" | "LEFT" | "RIGHT";

  /**
   * Output dimension for dimensionality reduction.
   * Cohere Embed v4 defaults to 1536 if omitted.
   * Supported: 256, 512, 1024, 1536.
   * We use 1024 to match the DB column vector(1024).
   */
  output_dimension?: number;
}

interface CohereEmbedResponse {
  /** Embeddings for each input text */
  embeddings: {
    float?: number[][];
    int8?: number[][];
    uint8?: number[][];
    binary?: number[][];
    ubinary?: number[][];
  };

  /** Response type identifier */
  response_type: "embeddings_floats" | "embeddings_by_type";

  /** Model ID used */
  id: string;

  /** Text strings that were embedded */
  texts?: string[];
}

// =============================================================================
// Bedrock Client
// =============================================================================

let bedrockClient: BedrockRuntimeClient | null = null;

/**
 * Get or create a Bedrock client.
 * Uses explicit credentials from env vars (local dev) or falls back
 * to EC2 instance profile credentials automatically.
 */
function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    // If explicit credentials are set, use them (local dev).
    // Otherwise, omit — the AWS SDK resolves credentials from the
    // EC2 instance profile automatically.
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    bedrockClient = new BedrockRuntimeClient({
      region: AWS_REGION,
      ...(credentials && { credentials }),
    });

    logger.info(
      { region: AWS_REGION, model: COHERE_MODEL_ID, usingInstanceProfile: !credentials },
      "Initialized Cohere Bedrock client"
    );
  }

  return bedrockClient;
}

// =============================================================================
// Core Embedding Functions
// =============================================================================

/**
 * Generate embedding for document storage (corpus)
 * Uses input_type: "search_document"
 */
export async function generateDocumentEmbedding(
  text: string,
  dimensions: number = COHERE_DIMENSIONS
): Promise<{ embedding: number[]; tokenCount: number }> {
  const client = getBedrockClient();

  const request: CohereEmbedRequest = {
    texts: [text],
    input_type: "search_document", // For storing in vector DB
    embedding_types: [COHERE_EMBEDDING_TYPE],
    truncate: "RIGHT",
    output_dimension: dimensions,
  };

  const command = new InvokeModelCommand({
    modelId: COHERE_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(request),
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as CohereEmbedResponse;

      // Extract float embeddings
      const embeddings = responseBody.embeddings.float;
      if (!embeddings || embeddings.length === 0) {
        throw new Error("No embeddings returned from Cohere");
      }

      const embedding = embeddings[0];

      // Validate dimensions
      if (embedding.length !== dimensions) {
        logger.warn(
          { expected: dimensions, actual: embedding.length },
          "Embedding dimension mismatch"
        );
      }

      // Estimate token count (Cohere doesn't return this, so we estimate)
      const tokenCount = estimateTokens(text);

      return { embedding, tokenCount };
    } catch (error: unknown) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        logger.error({ error, attempt }, "Failed to generate Cohere embedding after retries");
        throw error;
      }

      logger.warn({ error, attempt }, "Retrying Cohere embedding generation");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error("Failed to generate embedding");
}

/**
 * Generate embedding for search queries (detailed version with token count)
 * Uses input_type: "search_query"
 *
 * IMPORTANT: Use this for user search queries, not for storing documents
 */
export async function generateQueryEmbeddingDetailed(
  query: string,
  dimensions: number = COHERE_DIMENSIONS
): Promise<{ embedding: number[]; tokenCount: number }> {
  const client = getBedrockClient();

  const request: CohereEmbedRequest = {
    texts: [query],
    input_type: "search_query", // For user queries
    embedding_types: [COHERE_EMBEDDING_TYPE],
    truncate: "RIGHT",
    output_dimension: dimensions,
  };

  const command = new InvokeModelCommand({
    modelId: COHERE_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(request),
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as CohereEmbedResponse;

      const embeddings = responseBody.embeddings.float;
      if (!embeddings || embeddings.length === 0) {
        throw new Error("No embeddings returned from Cohere");
      }

      const embedding = embeddings[0];
      const tokenCount = estimateTokens(query);

      return { embedding, tokenCount };
    } catch (error: unknown) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        logger.error({ error, attempt }, "Failed to generate Cohere query embedding");
        throw error;
      }

      logger.warn({ error, attempt }, "Retrying Cohere query embedding generation");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error("Failed to generate query embedding");
}

/**
 * Generate embedding for search queries (simple version - returns just the array)
 * Uses input_type: "search_query"
 *
 * This is the default interface expected by semantic-search.ts
 */
export async function generateQueryEmbedding(
  query: string,
  dimensions: number = COHERE_DIMENSIONS
): Promise<number[]> {
  const { embedding } = await generateQueryEmbeddingDetailed(query, dimensions);
  return embedding;
}

/**
 * Generate embeddings in batch for multiple texts
 * More efficient than calling generateDocumentEmbedding() multiple times
 */
async function generateBatchEmbeddings(
  texts: string[],
  dimensions: number = COHERE_DIMENSIONS
): Promise<Array<{ embedding: number[]; tokenCount: number }>> {
  if (texts.length === 0) {
    return [];
  }

  const client = getBedrockClient();

  const request: CohereEmbedRequest = {
    texts,
    input_type: "search_document",
    embedding_types: [COHERE_EMBEDDING_TYPE],
    truncate: "RIGHT",
    output_dimension: dimensions,
  };

  const command = new InvokeModelCommand({
    modelId: COHERE_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(request),
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as CohereEmbedResponse;

      const embeddings = responseBody.embeddings.float;
      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings?.length || 0}`);
      }

      return embeddings.map((embedding, i) => ({
        embedding,
        tokenCount: estimateTokens(texts[i]),
      }));
    } catch (error: unknown) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        logger.error({ error, attempt, batchSize: texts.length }, "Failed to generate batch embeddings");
        throw error;
      }

      logger.warn({ error, attempt }, "Retrying batch embedding generation");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error("Failed to generate batch embeddings");
}

// =============================================================================
// Movie Embeddings
// =============================================================================

interface MovieWithRelations {
  id: number;
  title: string;
  overview: string | null;
  tagline: string | null;
  genres: Array<MovieGenre & { genre: Genre }>;
  keywords: Array<MovieKeyword & { keyword: Keyword }>;
  credits: Array<Credit & { person: Person }>;
}

/**
 * Generate embeddings for movies
 */
export async function generateMovieEmbeddings(
  options: GenerateEmbeddingsOptions = {}
): Promise<EmbeddingStats> {
  const {
    limit = 5000,
    minPopularity = 0,
    dryRun = false,
    dimensions = COHERE_DIMENSIONS,
    force = false,
  } = options;

  logger.info(
    { limit, minPopularity, dryRun, dimensions, force, model: COHERE_MODEL_ID },
    "Starting Cohere movie embedding generation"
  );

  // Build WHERE clause
  const where: any = {
    popularity: { gte: minPopularity },
  };

  if (!force) {
    where.embedding = null; // Only process movies without embeddings
  }

  // Fetch movies
  const movies = await prisma.movie.findMany({
    where,
    take: limit,
    orderBy: { popularity: "desc" },
    include: {
      genres: {
        include: { genre: true },
      },
      keywords: {
        include: { keyword: true },
      },
      credits: {
        include: { person: true },
        orderBy: { creditOrder: "asc" },
      },
    },
  });

  logger.info({ count: movies.length, limit, minPopularity, dimensions, force }, "Found movies for embedding");

  if (dryRun) {
    return { processed: 0, skipped: movies.length, errors: 0, tokensUsed: 0 };
  }

  const stats: EmbeddingStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    tokensUsed: 0,
  };

  const totalBatches = Math.ceil(movies.length / BATCH_SIZE);
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < movies.length; i += BATCH_SIZE) {
    const batch = movies.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const progress = ((i / movies.length) * 100).toFixed(0);

    // Calculate ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = stats.processed / elapsed;
    const remaining = movies.length - stats.processed;
    const eta = rate > 0 ? Math.ceil(remaining / rate) : 0;
    const etaStr = eta > 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;

    logger.info(
      {
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
        processed: stats.processed,
        total: movies.length,
        eta: eta > 0 ? etaStr : "calculating...",
      },
      `Processing batch ${batchNumber}/${totalBatches} (${progress}%)`
    );

    // Build embedding texts for this batch
    const textsWithIds = batch.map((movie) => {
      // Extract data
      const genres = movie.genres.map((g) => g.genre.name);
      const keywords = movie.keywords.map((k) => k.keyword.name);

      // Find director from crew (movie credits don't need mediaType check - they're from movie.credits)
      const director = movie.credits.find(
        (c) => c.creditType === "CREW" && c.job === "Director"
      )?.person.name || null;

      // Get top cast
      const topCast = movie.credits
        .filter((c) => c.creditType === "CAST")
        .slice(0, 10)
        .map((c) => c.person.name);

      const embeddingText = buildMovieEmbeddingText({
        title: movie.title,
        overview: movie.overview,
        genres,
        keywords,
        tagline: movie.tagline,
        director,
        topCast,
      });

      return { id: movie.id, text: embeddingText };
    });

    try {
      // Generate embeddings in parallel with controlled concurrency
      const results = await Promise.all(
        textsWithIds.map(async ({ id, text }) => {
          try {
            const { embedding, tokenCount } = await generateDocumentEmbedding(text, dimensions);
            stats.tokensUsed += tokenCount;
            return { id, embedding, error: null };
          } catch (error: unknown) {
            logger.error({ error, movieId: id }, "Failed to generate embedding for movie");
            stats.errors++;
            return { id, embedding: null, error };
          }
        })
      );

      // Update database using raw SQL (embedding column not in Prisma types)
      for (const result of results) {
        if (result.embedding) {
          const embeddingStr = `[${result.embedding.join(",")}]`;
          await prisma.$executeRaw`
            UPDATE movies SET embedding = ${embeddingStr}::vector WHERE id = ${result.id}
          `;
          stats.processed++;
        }
      }
    } catch (error: unknown) {
      logger.error({ error, batch: batchNumber }, "Batch processing failed");
      stats.errors += batch.length;
    }

    // Rate limiting
    if (i + BATCH_SIZE < movies.length) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  logger.info(
    {
      processed: stats.processed,
      skipped: stats.skipped,
      errors: stats.errors,
      tokensUsed: stats.tokensUsed,
      totalTimeSeconds: Math.round(totalTimeSeconds),
      itemsPerSecond: Math.round(stats.processed / totalTimeSeconds),
    },
    "Cohere embedding generation complete"
  );

  return stats;
}

// =============================================================================
// Series Embeddings
// =============================================================================

interface SeriesWithRelations {
  id: number;
  name: string;
  overview: string | null;
  tagline: string | null;
  genres: Array<{ genre: Genre }>;
  keywords: Array<{ keyword: Keyword }>;
  credits: Array<Credit & { person: Person }>;
  creators: Array<{ person: Person }>;
}

/**
 * Generate embeddings for series
 */
export async function generateSeriesEmbeddings(
  options: GenerateEmbeddingsOptions = {}
): Promise<EmbeddingStats> {
  const {
    limit = 2000,
    minPopularity = 0,
    dryRun = false,
    dimensions = COHERE_DIMENSIONS,
    force = false,
  } = options;

  logger.info(
    { limit, minPopularity, dryRun, dimensions, force, model: COHERE_MODEL_ID },
    "Starting Cohere series embedding generation"
  );

  const where: any = {
    popularity: { gte: minPopularity },
  };

  if (!force) {
    where.embedding = null;
  }

  const series = await prisma.series.findMany({
    where,
    take: limit,
    orderBy: { popularity: "desc" },
    include: {
      genres: {
        include: { genre: true },
      },
      keywords: {
        include: { keyword: true },
      },
      credits: {
        include: { person: true },
        orderBy: { creditOrder: "asc" },
      },
      creators: {
        include: { person: true },
      },
    },
  });

  logger.info({ count: series.length, limit, minPopularity, dimensions, force }, "Found series for embedding");

  if (dryRun) {
    return { processed: 0, skipped: series.length, errors: 0, tokensUsed: 0 };
  }

  const stats: EmbeddingStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    tokensUsed: 0,
  };

  const totalBatches = Math.ceil(series.length / BATCH_SIZE);
  const startTime = Date.now();

  for (let i = 0; i < series.length; i += BATCH_SIZE) {
    const batch = series.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const progress = ((i / series.length) * 100).toFixed(0);

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = stats.processed / elapsed;
    const remaining = series.length - stats.processed;
    const eta = rate > 0 ? Math.ceil(remaining / rate) : 0;
    const etaStr = eta > 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;

    logger.info(
      {
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
        processed: stats.processed,
        total: series.length,
        eta: eta > 0 ? etaStr : "calculating...",
      },
      `Processing batch ${batchNumber}/${totalBatches} (${progress}%)`
    );

    const textsWithIds = batch.map((s) => {
      const genres = s.genres.map((g) => g.genre.name);
      const keywords = s.keywords.map((k) => k.keyword.name);
      const creators = s.creators.map((c) => c.person.name);

      // Series credits don't need mediaType check - they're from series.credits
      const topCast = s.credits
        .filter((c) => c.creditType === "CAST")
        .slice(0, 10)
        .map((c) => c.person.name);

      const embeddingText = buildSeriesEmbeddingText({
        name: s.name,
        overview: s.overview,
        genres,
        keywords,
        tagline: s.tagline,
        creators,
        topCast,
      });

      return { id: s.id, text: embeddingText };
    });

    try {
      const results = await Promise.all(
        textsWithIds.map(async ({ id, text }) => {
          try {
            const { embedding, tokenCount } = await generateDocumentEmbedding(text, dimensions);
            stats.tokensUsed += tokenCount;
            return { id, embedding, error: null };
          } catch (error: unknown) {
            logger.error({ error, seriesId: id }, "Failed to generate embedding for series");
            stats.errors++;
            return { id, embedding: null, error };
          }
        })
      );

      // Update database using raw SQL (embedding column not in Prisma types)
      for (const result of results) {
        if (result.embedding) {
          const embeddingStr = `[${result.embedding.join(",")}]`;
          await prisma.$executeRaw`
            UPDATE series SET embedding = ${embeddingStr}::vector WHERE id = ${result.id}
          `;
          stats.processed++;
        }
      }
    } catch (error: unknown) {
      logger.error({ error, batch: batchNumber }, "Batch processing failed");
      stats.errors += batch.length;
    }

    if (i + BATCH_SIZE < series.length) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  logger.info(
    {
      processed: stats.processed,
      skipped: stats.skipped,
      errors: stats.errors,
      tokensUsed: stats.tokensUsed,
      totalTimeSeconds: Math.round(totalTimeSeconds),
      itemsPerSecond: Math.round(stats.processed / totalTimeSeconds),
    },
    "Cohere series embedding generation complete"
  );

  return stats;
}
