/**
 * Embeddings Module — Cohere Embed v4
 *
 * All embeddings use Cohere Embed v4 (1024 dimensions) via AWS Bedrock.
 * Global cross-region inference from ap-south-1 (Mumbai) for lowest latency.
 *
 * Key advantage: asymmetric search types
 * - search_document: for storing movie/series embeddings in PostgreSQL
 * - search_query: for user queries at search time (optimized for retrieval)
 *
 * @example
 * import { generateQueryEmbedding, generateMovieEmbeddings } from "@/lib/embeddings";
 *
 * const embedding = await generateQueryEmbedding("mind-bending sci-fi movies");
 * const stats = await generateMovieEmbeddings({ limit: 1000 });
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

// Cohere Embed v4 — the only provider
export {
  generateQueryEmbedding,
  generateDocumentEmbedding,
  generateMovieEmbeddings,
  generateSeriesEmbeddings,
  type EmbeddingStats,
  type GenerateEmbeddingsOptions,
} from "./cohere-generator";
