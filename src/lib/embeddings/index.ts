/**
 * Embeddings Module
 *
 * Provides vector embedding generation and management for semantic search.
 * Now using Cohere Embed v4 for superior semantic understanding.
 *
 * @example
 * import {
 *   generateQueryEmbedding,
 *   generateMovieEmbeddings,
 *   updateMovieEmbedding,
 * } from "@/lib/embeddings";
 *
 * // Generate embedding for a search query (uses Cohere search_query type)
 * const embedding = await generateQueryEmbedding("mind-bending sci-fi movies");
 *
 * // Batch generate embeddings for movies (uses Cohere search_document type)
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

// Amazon Titan Text Embeddings V2 (primary - 1024 dimensions)
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

// Cohere Embed v4 (for future use - requires AWS Marketplace subscription)
export {
  generateDocumentEmbedding as generateCohereDocumentEmbedding,
  generateQueryEmbedding as generateCohereQueryEmbedding,
  generateMovieEmbeddings as generateCohereMovieEmbeddings,
  generateSeriesEmbeddings as generateCohereSeriesEmbeddings,
} from "./cohere-generator";
