/**
 * Core interfaces and types for LLM provider abstraction
 */

export interface ReviewOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ReviewResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: {
    requestId?: string;
    latency?: number;
    [key: string]: any;
  };
}

export interface ModelInfo {
  name: string;
  maxTokens: number;
  contextWindow: number;
  description?: string;
  pricing?: {
    inputCostPer1k: number;
    outputCostPer1k: number;
  };
}

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  maxRetries?: number;
  timeout?: number;
  defaultOptions?: Partial<ReviewOptions>;
}

export interface LLMProvider {
  name: string;
  initialize(config: ProviderConfig): Promise<void>;
  generateReview(prompt: string, options?: ReviewOptions): Promise<ReviewResponse>;
  isAvailable(): boolean;
  getModelInfo(): ModelInfo | null;
  validateConfig(): boolean;
  getUsage?(): { total: number; limit?: number };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    public retryAfter?: number
  ) {
    super(message, provider, 'RATE_LIMIT', 429, true);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends ProviderError {
  constructor(message: string, provider: string) {
    super(message, provider, 'AUTHENTICATION', 401, false);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ProviderError {
  constructor(message: string, provider: string) {
    super(message, provider, 'VALIDATION', 400, false);
    this.name = 'ValidationError';
  }
}