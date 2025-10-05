import {
  LLMProvider,
  ReviewOptions,
  ReviewResponse,
  ModelInfo,
  ProviderConfig,
  ProviderError
} from './types';

/**
 * Base class for all LLM providers
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;
  protected config: ProviderConfig | null = null;
  protected modelInfo: ModelInfo | null = null;
  protected initialized: boolean = false;

  /**
   * Initialize the provider with configuration
   */
  abstract initialize(config: ProviderConfig): Promise<void>;

  /**
   * Generate a review using the LLM
   */
  abstract generateReview(prompt: string, options?: ReviewOptions): Promise<ReviewResponse>;

  /**
   * Check if the provider is available and properly configured
   */
  isAvailable(): boolean {
    return this.initialized && this.validateConfig();
  }

  /**
   * Get information about the current model
   */
  getModelInfo(): ModelInfo | null {
    return this.modelInfo;
  }

  /**
   * Validate the provider configuration
   */
  validateConfig(): boolean {
    if (!this.config) {
      return false;
    }

    return !!(this.config.apiKey && this.config.apiKey.length > 0);
  }

  /**
   * Format the prompt with common preprocessing
   */
  protected formatPrompt(prompt: string): string {
    // Remove excessive whitespace
    prompt = prompt.replace(/\s+/g, ' ').trim();

    // Ensure prompt doesn't exceed reasonable length
    const MAX_PROMPT_LENGTH = 50000;
    if (prompt.length > MAX_PROMPT_LENGTH) {
      console.warn(`Prompt truncated from ${prompt.length} to ${MAX_PROMPT_LENGTH} characters`);
      prompt = prompt.substring(0, MAX_PROMPT_LENGTH);
    }

    return prompt;
  }

  /**
   * Merge options with defaults
   */
  protected mergeOptions(options?: ReviewOptions): ReviewOptions {
    const defaults = this.config?.defaultOptions || {};
    return {
      ...defaults,
      ...options,
      model: options?.model || defaults.model || this.config?.model
    };
  }

  /**
   * Calculate token usage estimation (rough approximation)
   */
  protected estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Retry logic with exponential backoff
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors
        if (error instanceof ProviderError && !error.retryable) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(2, i);

        // Check for rate limit specific retry-after header
        if (error instanceof ProviderError && error.code === 'RATE_LIMIT') {
          const rateLimitError = error as any;
          if (rateLimitError.retryAfter) {
            await this.sleep(rateLimitError.retryAfter * 1000);
            continue;
          }
        }

        // Don't sleep after the last attempt
        if (i < maxRetries - 1) {
          console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries reached');
  }

  /**
   * Sleep helper for retry logic
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Measure and log request latency
   */
  protected async measureLatency<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result: T; latency: number }> {
    const startTime = Date.now();
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      console.log(`[${this.name}] ${operationName} completed in ${latency}ms`);
      return { result, latency };
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`[${this.name}] ${operationName} failed after ${latency}ms`);
      throw error;
    }
  }
}