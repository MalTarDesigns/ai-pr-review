import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './BaseLLMProvider';
import {
  ReviewOptions,
  ReviewResponse,
  ModelInfo,
  ProviderConfig,
  ProviderError,
  RateLimitError,
  AuthenticationError,
  ValidationError
} from './types';

/**
 * Claude AI provider implementation using Anthropic SDK
 */
export class ClaudeProvider extends BaseLLMProvider {
  name = 'claude';
  private client: Anthropic | null = null;

  // Model configurations
  private static readonly MODELS: Record<string, ModelInfo> = {
    'claude-3-opus-20240229': {
      name: 'Claude 3 Opus',
      maxTokens: 4096,
      contextWindow: 200000,
      description: 'Most capable model for complex tasks',
      pricing: {
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.075
      }
    },
    'claude-3-sonnet-20240229': {
      name: 'Claude 3 Sonnet',
      maxTokens: 4096,
      contextWindow: 200000,
      description: 'Balanced performance and cost',
      pricing: {
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015
      }
    },
    'claude-3-haiku-20240307': {
      name: 'Claude 3 Haiku',
      maxTokens: 4096,
      contextWindow: 200000,
      description: 'Fastest and most cost-effective',
      pricing: {
        inputCostPer1k: 0.00025,
        outputCostPer1k: 0.00125
      }
    },
    'claude-3-5-sonnet-20241022': {
      name: 'Claude 3.5 Sonnet',
      maxTokens: 8192,
      contextWindow: 200000,
      description: 'Latest and most advanced model',
      pricing: {
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015
      }
    }
  };

  async initialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ValidationError('API key is required for Claude provider', this.name);
    }

    this.config = {
      ...config,
      model: config.model || 'claude-3-sonnet-20240229'
    };

    try {
      this.client = new Anthropic({
        apiKey: config.apiKey,
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 30000,
        baseURL: config.baseUrl
      });

      // Set model info
      const modelId = this.config.model || 'claude-3-sonnet-20240229';
      this.modelInfo = ClaudeProvider.MODELS[modelId] || null;

      this.initialized = true;
      console.log(`[${this.name}] Provider initialized with model: ${modelId}`);
    } catch (error) {
      this.initialized = false;
      throw new ProviderError(
        `Failed to initialize Claude provider: ${error}`,
        this.name,
        'INITIALIZATION_ERROR'
      );
    }
  }

  async generateReview(prompt: string, options?: ReviewOptions): Promise<ReviewResponse> {
    if (!this.client || !this.initialized) {
      throw new ProviderError('Claude provider not initialized', this.name, 'NOT_INITIALIZED');
    }

    const formattedPrompt = this.formatPrompt(prompt);
    const mergedOptions = this.mergeOptions(options);

    try {
      const { result, latency } = await this.measureLatency(
        async () => {
          return await this.retryWithBackoff(async () => {
            const response = await this.client!.messages.create({
              model: mergedOptions.model || this.config!.model || 'claude-3-sonnet-20240229',
              max_tokens: mergedOptions.maxTokens || 4096,
              temperature: mergedOptions.temperature ?? 0.2,
              top_p: mergedOptions.topP,
              messages: [{
                role: 'user',
                content: formattedPrompt
              }],
              system: this.getSystemPrompt()
            });

            return response;
          }, this.config?.maxRetries || 3);
        },
        'generateReview'
      );

      // Extract text content from the response
      const content = result.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      if (!content) {
        throw new ProviderError('Empty response from Claude', this.name, 'EMPTY_RESPONSE');
      }

      return {
        content: content,
        model: result.model,
        provider: this.name,
        usage: {
          promptTokens: result.usage.input_tokens,
          completionTokens: result.usage.output_tokens,
          totalTokens: result.usage.input_tokens + result.usage.output_tokens
        },
        metadata: {
          requestId: result.id,
          latency: latency,
          stopReason: result.stop_reason
        }
      };
    } catch (error: any) {
      // Handle specific Anthropic SDK errors
      if (error.status === 429 || error.error?.type === 'rate_limit_error') {
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'])
          : undefined;
        throw new RateLimitError(
          'Claude API rate limit exceeded',
          this.name,
          retryAfter
        );
      }

      if (error.status === 401 || error.error?.type === 'authentication_error') {
        throw new AuthenticationError(
          'Invalid Claude API key',
          this.name
        );
      }

      if (error.status === 400 || error.error?.type === 'invalid_request_error') {
        throw new ValidationError(
          `Invalid request: ${error.message}`,
          this.name
        );
      }

      // Generic error
      throw new ProviderError(
        `Claude API error: ${error.message}`,
        this.name,
        error.error?.type || 'UNKNOWN',
        error.status,
        error.status >= 500 // Server errors are retryable
      );
    }
  }

  /**
   * Get the system prompt for Claude
   */
  private getSystemPrompt(): string {
    return `You are an expert code reviewer with deep knowledge of software engineering best practices, design patterns, and security.
    Your reviews are thorough, constructive, and focused on improving code quality.
    You provide specific, actionable feedback with clear severity levels.`;
  }

  /**
   * Get available models
   */
  static getAvailableModels(): string[] {
    return Object.keys(ClaudeProvider.MODELS);
  }

  /**
   * Get model information
   */
  static getModelInfo(modelId: string): ModelInfo | undefined {
    return ClaudeProvider.MODELS[modelId];
  }
}