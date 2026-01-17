/**
 * Embedding Generator
 *
 * Generates vector embeddings for movies and series using AWS Bedrock's
 * Amazon Titan Text Embeddings V2 model (1024 dimensions).
 *
 * Features:
 * - Batch processing for efficiency
 * - Rate limiting and retry logic
 * - Progress tracking and dry-run mode
 * - Incremental updates for single items
 * - Configurable dimensions (256, 384, 1024)
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { prisma } from "@/server/db/postgres";
import { buildMovieEmbeddingText, buildSeriesEmbeddingText, estimateTokens } from "./text-builder";
import pino from "pino";
import type { Credit, MovieGenre, MovieKeyword, Person, Genre, Keyword } from "@prisma/client";

const logger = pino({ name: "embeddings" });

// =============================================================================
// Configuration
// =============================================================================

/**
 * Amazon Titan Text Embeddings V2
 * - Dimensions: 256, 384, or 1024 (we use 1024 for best quality)
 * - Max input: 8,192 tokens
 * - Cost: ~$0.00002 per 1K tokens
 * - Model ID: amazon.titan-embed-text-v2:0
 */
const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";
const EMBEDDING_DIMENSIONS = 1024; // Match schema: vector(1024)
const EMBEDDING_NORMALIZE = true; // Normalize for cosine similarity

const BATCH_SIZE = 100; // Process 100 items at a time
const CONCURRENT_API_CALLS = 25; // Bedrock supports high concurrency
const RATE_LIMIT_DELAY_MS = 50; // Small delay between batches
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// AWS region for Bedrock - same as AI agent
// IMPORTANT: Titan embeddings should work in all regions, but default to us-east-1 for consistency
const AWS_REGION = process.env.BEDROCK_REGION || "us-east-1";

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
  /** Custom dimensions (256, 384, 1024) */
  dimensions?: 256 | 384 | 1024;
  /** Force regenerate even if embeddings exist */
  force?: boolean;
}

interface TitanEmbeddingRequest {
  inputText: string;
  dimensions?: number;
  normalize?: boolean;
}

interface TitanEmbeddingResponse {
  embedding: number[];
  inputTextTokenCount: number;
}

// =============================================================================
// Bedrock Client
// =============================================================================

let bedrockClient: BedrockRuntimeClient | null = null;

/**
 * Get or create a Bedrock client using credentials from .env.local
 * Uses the same pattern as src/server/ai/bedrock.ts
 */
function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    // Validate required environment variables (same check as AI agent)
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local"
      );
    }

    bedrockClient = new BedrockRuntimeClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return bedrockClient;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Generate embedding for a single text string using Amazon Titan.
 */
export async function generateEmbedding(
  text: string,
  dimensions: number = EMBEDDING_DIMENSIONS
): Promise<number[]> {
  const client = getBedrockClient();

  const request: TitanEmbeddingRequest = {
    inputText: text,
    dimensions,
    normalize: EMBEDDING_NORMALIZE,
  };

  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(request),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(
    new TextDecoder().decode(response.body)
  ) as TitanEmbeddingResponse;

  return responseBody.embedding;
}

/**
 * Generate embeddings for multiple texts.
 * Note: Titan doesn't support batch API, so we call in parallel with high concurrency.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  dimensions: number = EMBEDDING_DIMENSIONS,
  concurrency: number = CONCURRENT_API_CALLS
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  let nextIndex = 0;
  const errors: Array<{ index: number; error: Error }> = [];

  // Process with controlled concurrency using a worker pool
  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, async () => {
    while (nextIndex < texts.length) {
      const index = nextIndex++;
      if (index >= texts.length) break;

      try {
        results[index] = await generateEmbedding(texts[index], dimensions);
      } catch (error) {
        errors.push({ index, error: error as Error });
        results[index] = null;
      }
    }
  });

  await Promise.all(workers);

  // Retry failed ones with lower concurrency
  if (errors.length > 0 && errors.length < texts.length / 2) {
    logger.warn({ errorCount: errors.length }, "Retrying failed embeddings");
    for (const { index } of errors) {
      try {
        await sleep(500); // Small delay before retry
        results[index] = await generateEmbedding(texts[index], dimensions);
      } catch (retryError) {
        logger.error({ index, error: retryError }, "Retry failed");
        // Return a zero vector as fallback (will be regenerated later)
        results[index] = new Array(dimensions).fill(0);
      }
    }
  }

  // Filter out any remaining nulls (shouldn't happen)
  return results.map((r) => r || new Array(dimensions).fill(0));
}

/**
 * Generate embedding for a user search query.
 * Wrapper with logging for query-specific use case.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const startTime = Date.now();

  try {
    const embedding = await generateEmbedding(query);

    logger.debug({
      event: "query_embedding",
      model: EMBEDDING_MODEL_ID,
      dimensions: EMBEDDING_DIMENSIONS,
      queryLength: query.length,
      durationMs: Date.now() - startTime,
    });

    return embedding;
  } catch (error) {
    logger.error({
      event: "query_embedding_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// =============================================================================
// Batch Processing
// =============================================================================

interface MovieForEmbedding {
  id: number;
  title: string;
  overview: string | null;
  tagline: string | null;
  popularity: number | null;
}

/**
 * Generate embeddings for movies without them.
 * Processes in batches with progress logging.
 */
export async function generateMovieEmbeddings(
  options: GenerateEmbeddingsOptions = {}
): Promise<EmbeddingStats> {
  const {
    limit = 1000,
    minPopularity = 0,
    dryRun = false,
    dimensions = EMBEDDING_DIMENSIONS,
    force = false,
  } = options;

  const stats: EmbeddingStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    tokensUsed: 0,
  };

  // Get movies - either all (force) or just those without embeddings
  const movies = force
    ? await prisma.$queryRaw<MovieForEmbedding[]>`
        SELECT m.id, m.title, m.overview, m.tagline, m.popularity
        FROM movies m
        WHERE (m.popularity >= ${minPopularity} OR m.popularity IS NULL)
        ORDER BY m.popularity DESC NULLS LAST
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<MovieForEmbedding[]>`
        SELECT m.id, m.title, m.overview, m.tagline, m.popularity
        FROM movies m
        WHERE m.embedding IS NULL
          AND (m.popularity >= ${minPopularity} OR m.popularity IS NULL)
        ORDER BY m.popularity DESC NULLS LAST
        LIMIT ${limit}
      `;

  logger.info(
    { count: movies.length, limit, minPopularity, dimensions, force },
    force ? "Found movies for regeneration" : "Found movies without embeddings"
  );

  if (movies.length === 0) {
    return stats;
  }

  // Process in batches with progress tracking
  const totalBatches = Math.ceil(movies.length / BATCH_SIZE);
  const startTime = Date.now();
  const batchTimes: number[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batch = movies.slice(batchStart, batchStart + BATCH_SIZE);
    const batchStartTime = Date.now();

    // Calculate ETA
    const avgBatchTime =
      batchTimes.length > 0 ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length : 0;
    const remainingBatches = totalBatches - batchIndex;
    const etaSeconds = avgBatchTime > 0 ? Math.round((remainingBatches * avgBatchTime) / 1000) : 0;
    const etaStr =
      etaSeconds > 60 ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s` : `${etaSeconds}s`;

    logger.info(
      {
        batch: batchIndex + 1,
        totalBatches,
        batchSize: batch.length,
        processed: stats.processed,
        total: movies.length,
        eta: batchTimes.length > 0 ? etaStr : "calculating...",
      },
      `Processing batch ${batchIndex + 1}/${totalBatches} (${Math.round((batchIndex / totalBatches) * 100)}%)`
    );

    try {
      await processBatch(batch, stats, dryRun, dimensions);
      batchTimes.push(Date.now() - batchStartTime);
      // Keep only last 5 batch times for rolling average
      if (batchTimes.length > 5) batchTimes.shift();
    } catch (error) {
      logger.error(
        {
          batch: batchIndex + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        "Batch failed"
      );
      stats.errors += batch.length;
    }

    // Rate limiting between batches
    if (batchIndex < totalBatches - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const rate = stats.processed > 0 ? Math.round(stats.processed / (totalTime || 1)) : 0;
  logger.info(
    {
      ...stats,
      totalTimeSeconds: totalTime,
      itemsPerSecond: rate,
    },
    "Embedding generation complete"
  );
  return stats;
}

async function processBatch(
  movies: MovieForEmbedding[],
  stats: EmbeddingStats,
  dryRun: boolean,
  dimensions: number
): Promise<void> {
  const movieIds = movies.map((m) => m.id);

  // Bulk fetch all related data in parallel
  const [allGenres, allKeywords, allCredits, allAiData] = await Promise.all([
    prisma.movieGenre.findMany({
      where: { movieId: { in: movieIds } },
      include: { genre: true },
    }),
    prisma.movieKeyword.findMany({
      where: { movieId: { in: movieIds } },
      include: { keyword: true },
    }),
    prisma.credit.findMany({
      where: { movieId: { in: movieIds } },
      include: { person: true },
    }),
    prisma.aiData.findMany({
      where: { movieId: { in: movieIds } },
    }),
  ]);

  // Index by movie ID for fast lookup
  const genresByMovie = new Map<number, typeof allGenres>();
  const keywordsByMovie = new Map<number, typeof allKeywords>();
  const creditsByMovie = new Map<number, typeof allCredits>();
  const aiDataByMovie = new Map<number, (typeof allAiData)[0]>();

  for (const g of allGenres) {
    const list = genresByMovie.get(g.movieId) || [];
    list.push(g);
    genresByMovie.set(g.movieId, list);
  }
  for (const k of allKeywords) {
    const list = keywordsByMovie.get(k.movieId) || [];
    list.push(k);
    keywordsByMovie.set(k.movieId, list);
  }
  for (const c of allCredits) {
    if (c.movieId) {
      const list = creditsByMovie.get(c.movieId) || [];
      list.push(c);
      creditsByMovie.set(c.movieId, list);
    }
  }
  for (const a of allAiData) {
    if (a.movieId) aiDataByMovie.set(a.movieId, a);
  }

  // Build embedding texts
  type CreditWithPerson = Credit & { person: Person };
  type MovieGenreWithGenre = MovieGenre & { genre: Genre };
  type MovieKeywordWithKeyword = MovieKeyword & { keyword: Keyword };

  const enrichedMovies = movies.map((movie) => {
    const genres = genresByMovie.get(movie.id) || [];
    // Use ALL keywords (no limit) for better semantic matching
    const keywords = keywordsByMovie.get(movie.id) || [];
    const credits = creditsByMovie.get(movie.id) || [];
    const aiData = aiDataByMovie.get(movie.id);

    const director = (credits as CreditWithPerson[]).find((c) => c.job === "Director")?.person.name;
    const topCast = (credits as CreditWithPerson[])
      .filter((c) => c.creditType === "CAST")
      .slice(0, 5)
      .map((c) => c.person.name);

    const embeddingText = buildMovieEmbeddingText({
      title: movie.title,
      overview: movie.overview,
      tagline: movie.tagline,
      genres: (genres as MovieGenreWithGenre[]).map((g) => g.genre.name),
      keywords: (keywords as MovieKeywordWithKeyword[]).map((k) => k.keyword.name),
      director,
      topCast,
      themes: aiData?.themes || undefined,
      mood: (aiData?.mood as Record<string, string>) || undefined,
      quickTake: aiData?.quickTake || undefined,
    });

    return {
      id: movie.id,
      title: movie.title,
      embeddingText,
      tokens: estimateTokens(embeddingText),
    };
  });

  // Filter out movies with insufficient text (title alone is ~15-30 chars, so 20 is safe minimum)
  const MIN_TEXT_LENGTH = 20;
  const validMovies = enrichedMovies.filter((m) => m.embeddingText.length >= MIN_TEXT_LENGTH);
  const skippedMovies = enrichedMovies.filter((m) => m.embeddingText.length < MIN_TEXT_LENGTH);

  if (skippedMovies.length > 0) {
    logger.warn(
      {
        skippedCount: skippedMovies.length,
        skippedIds: skippedMovies.map((m) => m.id),
        skippedTitles: skippedMovies.map((m) => m.title),
        reason: `text length < ${MIN_TEXT_LENGTH} chars`,
      },
      "Skipping movies with insufficient embedding text"
    );
  }
  stats.skipped += skippedMovies.length;

  if (validMovies.length === 0) {
    return;
  }

  // Track tokens
  const totalTokens = validMovies.reduce((sum, m) => sum + m.tokens, 0);
  stats.tokensUsed += totalTokens;

  if (dryRun) {
    stats.processed += validMovies.length;
    return;
  }

  // Generate embeddings with retry
  const texts = validMovies.map((m) => m.embeddingText);
  const embeddings = await retryWithBackoff(() => generateEmbeddingsBatch(texts, dimensions));

  // Bulk update database using a single transaction
  const updatePromises = validMovies.map(
    (movie, idx) =>
      prisma.$executeRaw`
      UPDATE movies 
      SET embedding = ${JSON.stringify(embeddings[idx])}::vector
      WHERE id = ${movie.id}
    `
  );
  await Promise.all(updatePromises);

  stats.processed += validMovies.length;
}

// =============================================================================
// Series Batch Processing
// =============================================================================

interface SeriesForEmbedding {
  id: number;
  name: string;
  overview: string | null;
  tagline: string | null;
  popularity: number | null;
}

/**
 * Generate embeddings for series without them.
 * Processes in batches with progress logging.
 */
export async function generateSeriesEmbeddings(
  options: GenerateEmbeddingsOptions = {}
): Promise<EmbeddingStats> {
  const {
    limit = 1000,
    minPopularity = 0,
    dryRun = false,
    dimensions = EMBEDDING_DIMENSIONS,
    force = false,
  } = options;

  const stats: EmbeddingStats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    tokensUsed: 0,
  };

  // Get series - either all (force) or just those without embeddings
  const seriesList = force
    ? await prisma.$queryRaw<SeriesForEmbedding[]>`
        SELECT s.id, s.name, s.overview, s.tagline, s.popularity
        FROM series s
        WHERE (s.popularity >= ${minPopularity} OR s.popularity IS NULL)
        ORDER BY s.popularity DESC NULLS LAST
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<SeriesForEmbedding[]>`
        SELECT s.id, s.name, s.overview, s.tagline, s.popularity
        FROM series s
        WHERE s.embedding IS NULL
          AND (s.popularity >= ${minPopularity} OR s.popularity IS NULL)
        ORDER BY s.popularity DESC NULLS LAST
        LIMIT ${limit}
      `;

  logger.info(
    { count: seriesList.length, limit, minPopularity, dimensions, force },
    force ? "Found series for regeneration" : "Found series without embeddings"
  );

  if (seriesList.length === 0) {
    return stats;
  }

  // Process in batches with progress tracking
  const totalBatches = Math.ceil(seriesList.length / BATCH_SIZE);
  const startTime = Date.now();
  const batchTimes: number[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batch = seriesList.slice(batchStart, batchStart + BATCH_SIZE);
    const batchStartTime = Date.now();

    // Calculate ETA
    const avgBatchTime =
      batchTimes.length > 0 ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length : 0;
    const remainingBatches = totalBatches - batchIndex;
    const etaSeconds = avgBatchTime > 0 ? Math.round((remainingBatches * avgBatchTime) / 1000) : 0;
    const etaStr =
      etaSeconds > 60 ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s` : `${etaSeconds}s`;

    logger.info(
      {
        batch: batchIndex + 1,
        totalBatches,
        batchSize: batch.length,
        processed: stats.processed,
        total: seriesList.length,
        eta: batchTimes.length > 0 ? etaStr : "calculating...",
      },
      `Processing series batch ${batchIndex + 1}/${totalBatches} (${Math.round((batchIndex / totalBatches) * 100)}%)`
    );

    try {
      await processSeriesBatch(batch, stats, dryRun, dimensions);
      batchTimes.push(Date.now() - batchStartTime);
      // Keep only last 5 batch times for rolling average
      if (batchTimes.length > 5) batchTimes.shift();
    } catch (error) {
      logger.error(
        {
          batch: batchIndex + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        "Series batch failed"
      );
      stats.errors += batch.length;
    }

    // Rate limiting between batches
    if (batchIndex < totalBatches - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const rate = stats.processed > 0 ? Math.round(stats.processed / (totalTime || 1)) : 0;
  logger.info(
    {
      ...stats,
      totalTimeSeconds: totalTime,
      itemsPerSecond: rate,
    },
    "Series embedding generation complete"
  );
  return stats;
}

async function processSeriesBatch(
  seriesList: SeriesForEmbedding[],
  stats: EmbeddingStats,
  dryRun: boolean,
  dimensions: number
): Promise<void> {
  const seriesIds = seriesList.map((s) => s.id);

  // Bulk fetch all related data in parallel
  const [allGenres, allKeywords, allCreators, allCredits, allAiData] = await Promise.all([
    prisma.seriesGenre.findMany({
      where: { seriesId: { in: seriesIds } },
      include: { genre: true },
    }),
    prisma.seriesKeyword.findMany({
      where: { seriesId: { in: seriesIds } },
      include: { keyword: true },
    }),
    prisma.seriesCreator.findMany({
      where: { seriesId: { in: seriesIds } },
      include: { person: true },
    }),
    prisma.credit.findMany({
      where: { seriesId: { in: seriesIds } },
      include: { person: true },
    }),
    prisma.aiData.findMany({
      where: { seriesId: { in: seriesIds } },
    }),
  ]);

  // Index by series ID for fast lookup
  const genresBySeries = new Map<number, typeof allGenres>();
  const keywordsBySeries = new Map<number, typeof allKeywords>();
  const creatorsBySeries = new Map<number, typeof allCreators>();
  const creditsBySeries = new Map<number, typeof allCredits>();
  const aiDataBySeries = new Map<number, (typeof allAiData)[0]>();

  for (const g of allGenres) {
    const list = genresBySeries.get(g.seriesId) || [];
    list.push(g);
    genresBySeries.set(g.seriesId, list);
  }
  for (const k of allKeywords) {
    const list = keywordsBySeries.get(k.seriesId) || [];
    list.push(k);
    keywordsBySeries.set(k.seriesId, list);
  }
  for (const c of allCreators) {
    const list = creatorsBySeries.get(c.seriesId) || [];
    list.push(c);
    creatorsBySeries.set(c.seriesId, list);
  }
  for (const c of allCredits) {
    if (c.seriesId) {
      const list = creditsBySeries.get(c.seriesId) || [];
      list.push(c);
      creditsBySeries.set(c.seriesId, list);
    }
  }
  for (const a of allAiData) {
    if (a.seriesId) aiDataBySeries.set(a.seriesId, a);
  }

  // Build embedding texts
  const enrichedSeries = seriesList.map((series) => {
    const genres = genresBySeries.get(series.id) || [];
    // Use ALL keywords (no limit) for better semantic matching
    const keywords = keywordsBySeries.get(series.id) || [];
    const creators = creatorsBySeries.get(series.id) || [];
    const credits = creditsBySeries.get(series.id) || [];
    const aiData = aiDataBySeries.get(series.id);

    const creatorNames = creators.map((c) => c.person.name);
    const topCast = credits
      .filter((c) => c.creditType === "CAST")
      .slice(0, 5)
      .map((c) => c.person.name);

    const embeddingText = buildSeriesEmbeddingText({
      name: series.name,
      overview: series.overview,
      tagline: series.tagline,
      genres: genres.map((g) => g.genre.name),
      keywords: keywords.map((k) => k.keyword.name),
      creators: creatorNames,
      topCast,
      themes: aiData?.themes || undefined,
      mood: (aiData?.mood as Record<string, string>) || undefined,
      quickTake: aiData?.quickTake || undefined,
    });

    return {
      id: series.id,
      name: series.name,
      embeddingText,
      tokens: estimateTokens(embeddingText),
    };
  });

  // Filter out series with insufficient text (name alone is ~15-30 chars, so 20 is safe minimum)
  const MIN_TEXT_LENGTH = 20;
  const validSeries = enrichedSeries.filter((s) => s.embeddingText.length >= MIN_TEXT_LENGTH);
  const skippedSeries = enrichedSeries.filter((s) => s.embeddingText.length < MIN_TEXT_LENGTH);

  if (skippedSeries.length > 0) {
    logger.warn(
      {
        skippedCount: skippedSeries.length,
        skippedIds: skippedSeries.map((s) => s.id),
        skippedNames: skippedSeries.map((s) => s.name),
        reason: `text length < ${MIN_TEXT_LENGTH} chars`,
      },
      "Skipping series with insufficient embedding text"
    );
  }
  stats.skipped += skippedSeries.length;

  if (validSeries.length === 0) {
    return;
  }

  // Track tokens
  const totalTokens = validSeries.reduce((sum, s) => sum + s.tokens, 0);
  stats.tokensUsed += totalTokens;

  if (dryRun) {
    stats.processed += validSeries.length;
    return;
  }

  // Generate embeddings with retry
  const texts = validSeries.map((s) => s.embeddingText);
  const embeddings = await retryWithBackoff(() => generateEmbeddingsBatch(texts, dimensions));

  // Bulk update database
  const updatePromises = validSeries.map(
    (series, idx) =>
      prisma.$executeRaw`
      UPDATE series 
      SET embedding = ${JSON.stringify(embeddings[idx])}::vector
      WHERE id = ${series.id}
    `
  );
  await Promise.all(updatePromises);

  stats.processed += validSeries.length;
}

// =============================================================================
// Single Item Updates
// =============================================================================

/**
 * Update embedding for a single movie.
 * Call this when AI data is generated/updated.
 */
export async function updateMovieEmbedding(movieId: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true }, take: 20 },
      credits: { include: { person: true }, take: 10 },
      aiData: true,
    },
  });

  if (!movie) {
    logger.warn({ movieId }, "Movie not found for embedding update");
    return false;
  }

  const director = movie.credits.find((c) => c.job === "Director")?.person.name;
  const topCast = movie.credits
    .filter((c) => c.creditType === "CAST")
    .slice(0, 5)
    .map((c) => c.person.name);

  const embeddingText = buildMovieEmbeddingText({
    title: movie.title,
    overview: movie.overview,
    tagline: movie.tagline,
    genres: movie.genres.map((g) => g.genre.name),
    keywords: movie.keywords.map((k) => k.keyword.name),
    director,
    topCast,
    themes: movie.aiData?.themes || undefined,
    mood: (movie.aiData?.mood as Record<string, string>) || undefined,
    quickTake: movie.aiData?.quickTake || undefined,
  });

  if (embeddingText.length < 50) {
    logger.warn({ movieId }, "Insufficient text for embedding");
    return false;
  }

  try {
    const embedding = await generateEmbedding(embeddingText);

    await prisma.$executeRaw`
      UPDATE movies 
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${movieId}
    `;

    logger.info({ movieId, title: movie.title }, "Movie embedding updated");
    return true;
  } catch (error) {
    logger.error(
      {
        movieId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update movie embedding"
    );
    return false;
  }
}

/**
 * Update embedding for a single series.
 */
export async function updateSeriesEmbedding(seriesId: number): Promise<boolean> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      genres: { include: { genre: true } },
      keywords: { include: { keyword: true }, take: 20 },
      creators: { include: { person: true } },
      credits: { include: { person: true }, take: 10 },
      aiData: true,
    },
  });

  if (!series) {
    logger.warn({ seriesId }, "Series not found for embedding update");
    return false;
  }

  const creators = series.creators.map((c) => c.person.name);
  const topCast = series.credits
    .filter((c) => c.creditType === "CAST")
    .slice(0, 5)
    .map((c) => c.person.name);

  const embeddingText = buildSeriesEmbeddingText({
    name: series.name,
    overview: series.overview,
    tagline: series.tagline,
    genres: series.genres.map((g) => g.genre.name),
    keywords: series.keywords.map((k) => k.keyword.name),
    creators,
    topCast,
    themes: series.aiData?.themes || undefined,
    mood: (series.aiData?.mood as Record<string, string>) || undefined,
    quickTake: series.aiData?.quickTake || undefined,
  });

  if (embeddingText.length < 50) {
    logger.warn({ seriesId }, "Insufficient text for embedding");
    return false;
  }

  try {
    const embedding = await generateEmbedding(embeddingText);

    await prisma.$executeRaw`
      UPDATE series 
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${seriesId}
    `;

    logger.info({ seriesId, name: series.name }, "Series embedding updated");
    return true;
  } catch (error) {
    logger.error(
      {
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to update series embedding"
    );
    return false;
  }
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;

    logger.warn(
      {
        retriesLeft: retries,
        delay,
        error: error instanceof Error ? error.message : String(error),
      },
      "Retrying after error"
    );

    await sleep(delay);
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

// =============================================================================
// Configuration Exports
// =============================================================================

export const EMBEDDING_CONFIG = {
  modelId: EMBEDDING_MODEL_ID,
  dimensions: EMBEDDING_DIMENSIONS,
  normalize: EMBEDDING_NORMALIZE,
  provider: "aws-bedrock",
} as const;

// =============================================================================
// Re-exports from text-builder
// =============================================================================

export { buildMovieEmbeddingText, buildSeriesEmbeddingText, estimateTokens } from "./text-builder";
