/**
 * Embeddings Module
 *
 * Provides vector embedding generation and management for semantic search.
 *
 * @example
 * import {
 *   generateQueryEmbedding,
 *   generateMovieEmbeddings,
 *   updateMovieEmbedding,
 * } from "@/lib/embeddings";
 *
 * // Generate embedding for a search query
 * const embedding = await generateQueryEmbedding("mind-bending sci-fi movies");
 *
 * // Batch generate embeddings for movies
 * const stats = await generateMovieEmbeddings({ limit: 1000, dryRun: false });
 *
 * // Update single movie embedding (after AI enrichment)
 * await updateMovieEmbedding(movieId);
 */

// Text builders
export {
  buildMovieEmbeddingText,
  buildSeriesEmbeddingText,
  buildPersonEmbeddingText,
  estimateTokens,
  truncateToTokens,
  cleanTextForEmbedding,
  type MovieEmbeddingInput,
  type SeriesEmbeddingInput,
  type PersonEmbeddingInput,
} from "./text-builder";

// Embedding generation
export {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateQueryEmbedding,
  generateMovieEmbeddings,
  generateSeriesEmbeddings,
  updateMovieEmbedding,
  updateSeriesEmbedding,
  EMBEDDING_CONFIG,
  type EmbeddingStats,
  type GenerateEmbeddingsOptions,
} from "./generator";
