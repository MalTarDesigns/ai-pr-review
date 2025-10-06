/**
 * Large PR Review Configuration
 * Centralized configuration for agent-based chunking strategy
 */

export interface LargeReviewConfig {
  chunking: {
    maxChunkSize: number;
    maxFilesPerChunk: number;
    minChunkSize: number;
    prioritizeHighRisk: boolean;
  };
  execution: {
    maxConcurrentAgents: number;
    agentTimeout: number;
    retryAttempts: number;
    fallbackToSummary: boolean;
  };
  aggregation: {
    deduplicationThreshold: number;
    maxIssuesPerFile: number;
    includeLowSeverity: boolean;
  };
  models: {
    agent: string;
    synthesis: string;
    maxTokensPerChunk: number;
  };
  routing: {
    standardThreshold: number;
    chunkedThreshold: number;
    hierarchicalThreshold: number;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: LargeReviewConfig = {
  chunking: {
    maxChunkSize: 8000,
    maxFilesPerChunk: 10,
    minChunkSize: 2000,
    prioritizeHighRisk: true,
  },
  execution: {
    maxConcurrentAgents: 3,
    agentTimeout: 30000,
    retryAttempts: 2,
    fallbackToSummary: true,
  },
  aggregation: {
    deduplicationThreshold: 0.85,
    maxIssuesPerFile: 20,
    includeLowSeverity: false,
  },
  models: {
    agent: 'claude-sonnet-4-5',
    synthesis: 'claude-sonnet-4-5',
    maxTokensPerChunk: 1500,
  },
  routing: {
    standardThreshold: 10000,
    chunkedThreshold: 100000,
    hierarchicalThreshold: 1000000,
  },
};

/**
 * Load configuration with environment variable overrides
 */
export function loadLargeReviewConfig(): LargeReviewConfig {
  const config = { ...DEFAULT_CONFIG };

  // Override from environment variables
  if (process.env.LLM_MAX_CHUNK_SIZE) {
    config.chunking.maxChunkSize = parseInt(process.env.LLM_MAX_CHUNK_SIZE);
  }

  if (process.env.LLM_MAX_CONCURRENT_AGENTS) {
    config.execution.maxConcurrentAgents = parseInt(process.env.LLM_MAX_CONCURRENT_AGENTS);
  }

  if (process.env.LLM_AGENT_TIMEOUT) {
    config.execution.agentTimeout = parseInt(process.env.LLM_AGENT_TIMEOUT);
  }

  if (process.env.LLM_AGENT_MODEL) {
    config.models.agent = process.env.LLM_AGENT_MODEL;
  }

  if (process.env.LLM_SYNTHESIS_MODEL) {
    config.models.synthesis = process.env.LLM_SYNTHESIS_MODEL;
  }

  if (process.env.LLM_MAX_TOKENS_PER_CHUNK) {
    config.models.maxTokensPerChunk = parseInt(process.env.LLM_MAX_TOKENS_PER_CHUNK);
  }

  if (process.env.LLM_STANDARD_THRESHOLD) {
    config.routing.standardThreshold = parseInt(process.env.LLM_STANDARD_THRESHOLD);
  }

  if (process.env.LLM_CHUNKED_THRESHOLD) {
    config.routing.chunkedThreshold = parseInt(process.env.LLM_CHUNKED_THRESHOLD);
  }

  return config;
}

/**
 * Validate configuration values
 */
export function validateConfig(config: LargeReviewConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.chunking.maxChunkSize <= 0) {
    errors.push('maxChunkSize must be greater than 0');
  }

  if (config.chunking.minChunkSize >= config.chunking.maxChunkSize) {
    errors.push('minChunkSize must be less than maxChunkSize');
  }

  if (config.execution.maxConcurrentAgents <= 0) {
    errors.push('maxConcurrentAgents must be greater than 0');
  }

  if (config.execution.agentTimeout <= 0) {
    errors.push('agentTimeout must be greater than 0');
  }

  if (config.aggregation.deduplicationThreshold < 0 || config.aggregation.deduplicationThreshold > 1) {
    errors.push('deduplicationThreshold must be between 0 and 1');
  }

  if (config.routing.standardThreshold >= config.routing.chunkedThreshold) {
    errors.push('standardThreshold must be less than chunkedThreshold');
  }

  if (config.routing.chunkedThreshold >= config.routing.hierarchicalThreshold) {
    errors.push('chunkedThreshold must be less than hierarchicalThreshold');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
