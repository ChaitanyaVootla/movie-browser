/**
 * Model Pricing Configuration
 *
 * Modular pricing map for LLM models used in the application.
 * Costs are per 1,000 tokens (not per token).
 *
 * Add new models here as they become available.
 * Pricing data source: AWS Bedrock pricing page
 */

// =============================================================================
// Types
// =============================================================================

export interface ModelPricing {
  /** Display name for the model */
  name: string;
  /** Cost per 1,000 input tokens in USD */
  inputCostPer1k: number;
  /** Cost per 1,000 output tokens in USD */
  outputCostPer1k: number;
  /** Provider (aws, anthropic, etc.) */
  provider: string;
  /** Optional notes about the model */
  notes?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  /** Cost formatted as string (e.g., "$0.0012") */
  formatted: string;
}

export interface UsageStats extends TokenUsage, UsageCost {
  modelId: string;
  modelName: string;
}

// =============================================================================
// Model Pricing Map
// =============================================================================

/**
 * Pricing per 1,000 tokens for supported models
 *
 * To add a new model:
 * 1. Add the model ID as a key (use exact Bedrock model ID)
 * 2. Add pricing from the provider's pricing page
 * 3. The system will automatically use it when that model is configured
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ==========================================================================
  // Kimi (Moonshot AI) Models via Bedrock
  // ==========================================================================
  "moonshot.kimi-k2-thinking": {
    name: "Kimi K2 Thinking",
    inputCostPer1k: 0.0006, // $0.00060 per 1K input tokens
    outputCostPer1k: 0.0025, // $0.00250 per 1K output tokens
    provider: "moonshot",
    notes: "Reasoning model via AWS Bedrock",
  },

  // ==========================================================================
  // Kimi (Moonshot AI) Models via OpenRouter
  // ==========================================================================
  "moonshotai/kimi-k2.5": {
    name: "Kimi K2.5",
    inputCostPer1k: 0.0006, // $0.60 per 1M input = $0.0006 per 1K
    outputCostPer1k: 0.0025, // $2.50 per 1M output = $0.0025 per 1K
    provider: "openrouter",
    notes: "Latest Kimi model via OpenRouter",
  },
  "moonshotai/kimi-k2": {
    name: "Kimi K2",
    inputCostPer1k: 0.0006,
    outputCostPer1k: 0.0025,
    provider: "openrouter",
    notes: "Kimi K2 via OpenRouter",
  },

  // ==========================================================================
  // Amazon Nova Models
  // ==========================================================================
  "amazon.nova-pro-v1:0": {
    name: "Amazon Nova Pro",
    inputCostPer1k: 0.0008, // $0.0008 per 1K input tokens
    outputCostPer1k: 0.0032, // $0.0032 per 1K output tokens
    provider: "amazon",
  },
  "apac.amazon.nova-pro-v1:0": {
    name: "Amazon Nova Pro (APAC)",
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.0032,
    provider: "amazon",
    notes: "APAC cross-region inference profile",
  },
  "amazon.nova-lite-v1:0": {
    name: "Amazon Nova Lite",
    inputCostPer1k: 0.00006, // $0.00006 per 1K input tokens
    outputCostPer1k: 0.00024, // $0.00024 per 1K output tokens
    provider: "amazon",
    notes: "Lightweight, cost-effective model",
  },
  "amazon.nova-micro-v1:0": {
    name: "Amazon Nova Micro",
    inputCostPer1k: 0.000035, // $0.000035 per 1K input tokens
    outputCostPer1k: 0.00014, // $0.00014 per 1K output tokens
    provider: "amazon",
    notes: "Smallest Nova model, text-only",
  },

  // ==========================================================================
  // Anthropic Claude Models (via Bedrock)
  // ==========================================================================
  "us.anthropic.claude-3-haiku-20240307-v1:0": {
    name: "Claude 3 Haiku",
    inputCostPer1k: 0.00025, // $0.00025 per 1K input tokens
    outputCostPer1k: 0.00125, // $0.00125 per 1K output tokens
    provider: "anthropic",
    notes: "Fast, cost-effective Claude model",
  },
  "anthropic.claude-3-haiku-20240307-v1:0": {
    name: "Claude 3 Haiku",
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    provider: "anthropic",
  },
  "us.anthropic.claude-3-sonnet-20240229-v1:0": {
    name: "Claude 3 Sonnet",
    inputCostPer1k: 0.003, // $0.003 per 1K input tokens
    outputCostPer1k: 0.015, // $0.015 per 1K output tokens
    provider: "anthropic",
  },
  "us.anthropic.claude-3-5-sonnet-20240620-v1:0": {
    name: "Claude 3.5 Sonnet",
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    provider: "anthropic",
    notes: "Latest Claude 3.5 Sonnet",
  },
  "us.anthropic.claude-3-opus-20240229-v1:0": {
    name: "Claude 3 Opus",
    inputCostPer1k: 0.015, // $0.015 per 1K input tokens
    outputCostPer1k: 0.075, // $0.075 per 1K output tokens
    provider: "anthropic",
    notes: "Most capable Claude model",
  },

  // ==========================================================================
  // Cohere Embedding Models (via Bedrock)
  // ==========================================================================
  "cohere.embed-v4:0": {
    name: "Cohere Embed v4",
    inputCostPer1k: 0.001, // $0.001 per 1K input tokens (search_document)
    outputCostPer1k: 0, // Embedding models don't produce output tokens
    provider: "cohere",
    notes: "1024-dim embeddings via AWS Bedrock. Same rate for search_query and search_document.",
  },
  "global.cohere.embed-v4:0": {
    name: "Cohere Embed v4 (Global)",
    inputCostPer1k: 0.001,
    outputCostPer1k: 0,
    provider: "cohere",
    notes: "Global inference profile for Cohere Embed v4",
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get pricing for a model by ID
 * Falls back to a default pricing if model not found
 */
export function getModelPricing(modelId: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId];
  }

  // Try partial match (for inference profiles, etc.)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.includes(key) || key.includes(modelId)) {
      return pricing;
    }
  }

  // Default fallback (use Kimi K2 as default since it's our primary model)
  return {
    name: "Unknown Model",
    inputCostPer1k: 0.001, // Conservative default
    outputCostPer1k: 0.003, // Conservative default
    provider: "unknown",
    notes: `Model ${modelId} not in pricing map - using default`,
  };
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): UsageCost {
  const pricing = getModelPricing(modelId);

  // Calculate costs (pricing is per 1K tokens)
  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1k;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    formatted: formatCost(totalCost),
  };
}

/**
 * Calculate full usage stats including cost
 */
export function calculateUsageStats(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): UsageStats {
  const pricing = getModelPricing(modelId);
  const cost = calculateCost(modelId, inputTokens, outputTokens);

  return {
    modelId,
    modelName: pricing.name,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...cost,
  };
}

/**
 * Format cost as a readable string
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return `$${(cost * 10000).toFixed(4)} (×10⁻⁴)`;
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Get the currently configured model ID
 * Checks AI_PROVIDER to determine which model ID to return
 */
export function getCurrentModelId(): string {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "bedrock") {
    return process.env.BEDROCK_MODEL_ID || "moonshot.kimi-k2-thinking";
  }
  // Default to openrouter
  return process.env.OPENROUTER_MODEL_ID || "moonshotai/kimi-k2.5";
}

/**
 * Get pricing for the currently configured model
 */
export function getCurrentModelPricing(): ModelPricing {
  return getModelPricing(getCurrentModelId());
}

// =============================================================================
// Embedding Pricing
// =============================================================================

export interface EmbeddingPricing {
  /** Cost per 1,000 input tokens in USD */
  costPer1kTokens: number;
  /** Model name for display */
  modelName: string;
  /** Input type (search_query or search_document) */
  inputType: string;
}

/**
 * Get embedding pricing for Cohere Embed v4 cost calculation.
 * Bedrock charges ~$0.001/1K tokens for both search_query and search_document.
 */
export function getEmbeddingPricing(inputType: string): EmbeddingPricing {
  const modelId = "cohere.embed-v4:0";
  const pricing = getModelPricing(modelId);

  return {
    costPer1kTokens: pricing.inputCostPer1k,
    modelName: pricing.name,
    inputType,
  };
}

/**
 * Calculate embedding cost from token count
 */
export function calculateEmbeddingCost(tokens: number, inputType: string): number {
  const pricing = getEmbeddingPricing(inputType);
  return (tokens / 1000) * pricing.costPer1kTokens;
}
