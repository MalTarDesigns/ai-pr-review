import { OpenAI } from 'openai';
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
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  private client: OpenAI | null = null;

  // Model configurations
  private static readonly MODELS: Record<string, ModelInfo> = {
    'gpt-3.5-turbo': {
      name: 'GPT-3.5 Turbo',
      maxTokens: 4096,
      contextWindow: 16385,
      description: 'Fast and cost-effective for most tasks',
      pricing: {
        inputCostPer1k: 0.0005,
        outputCostPer1k: 0.0015
      }
    },
    'gpt-3.5-turbo-16k': {
      name: 'GPT-3.5 Turbo 16K',
      maxTokens: 4096,
      contextWindow: 16385,
      description: 'Extended context window version',
      pricing: {
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.004
      }
    },
    'gpt-4': {
      name: 'GPT-4',
      maxTokens: 8192,
      contextWindow: 8192,
      description: 'Most capable model for complex reasoning',
      pricing: {
        inputCostPer1k: 0.03,
        outputCostPer1k: 0.06
      }
    },
    'gpt-4-turbo': {
      name: 'GPT-4 Turbo',
      maxTokens: 4096,
      contextWindow: 128000,
      description: 'Latest GPT-4 with improved performance',
      pricing: {
        inputCostPer1k: 0.01,
        outputCostPer1k: 0.03
      }
    },
    'gpt-4o': {
      name: 'GPT-4o',
      maxTokens: 4096,
      contextWindow: 128000,
      description: 'Optimized GPT-4 model',
      pricing: {
        inputCostPer1k: 0.005,
        outputCostPer1k: 0.015
      }
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      maxTokens: 16384,
      contextWindow: 128000,
      description: 'Small, fast, and cost-efficient model',
      pricing: {
        inputCostPer1k: 0.00015,
        outputCostPer1k: 0.0006
      }
    }
  };

  async initialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ValidationError('API key is required for OpenAI provider', this.name);
    }

    this.config = {
      ...config,
      model: config.model || 'gpt-3.5-turbo'
    };

    try {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        organization: config.organization,
        baseURL: config.baseUrl,
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 30000
      });

      // Set model info
      const modelId = this.config.model || 'gpt-3.5-turbo';
      this.modelInfo = OpenAIProvider.MODELS[modelId] || null;

      this.initialized = true;
      console.log(`[${this.name}] Provider initialized with model: ${modelId}`);
    } catch (error) {
      this.initialized = false;
      throw new ProviderError(
        `Failed to initialize OpenAI provider: ${error}`,
        this.name,
        'INITIALIZATION_ERROR'
      );
    }
  }

  async generateReview(prompt: string, options?: ReviewOptions): Promise<ReviewResponse> {
    if (!this.client || !this.initialized) {
      throw new ProviderError('OpenAI provider not initialized', this.name, 'NOT_INITIALIZED');
    }

    const formattedPrompt = this.formatPrompt(prompt);
    const mergedOptions = this.mergeOptions(options);

    try {
      const { result, latency } = await this.measureLatency(
        async () => {
          return await this.retryWithBackoff(async () => {
            const response = await this.client!.chat.completions.create({
              model: mergedOptions.model || this.config!.model || 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: this.getSystemPrompt()
                },
                {
                  role: 'user',
                  content: formattedPrompt
                }
              ],
              temperature: mergedOptions.temperature ?? 0.2,
              max_tokens: mergedOptions.maxTokens || 1500,
              top_p: mergedOptions.topP,
              frequency_penalty: mergedOptions.frequencyPenalty,
              presence_penalty: mergedOptions.presencePenalty
            });

            return response;
          }, this.config?.maxRetries || 3);
        },
        'generateReview'
      );

      const content = result.choices[0]?.message?.content;
      if (!content) {
        throw new ProviderError('Empty response from OpenAI', this.name, 'EMPTY_RESPONSE');
      }

      return {
        content: content.trim(),
        model: result.model,
        provider: this.name,
        usage: result.usage ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens
        } : undefined,
        metadata: {
          requestId: result.id,
          latency: latency,
          finishReason: result.choices[0]?.finish_reason
        }
      };
    } catch (error: any) {
      // Handle specific OpenAI API errors
      if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'])
          : undefined;
        throw new RateLimitError(
          'OpenAI API rate limit exceeded',
          this.name,
          retryAfter
        );
      }

      if (error.status === 401 || error.code === 'invalid_api_key') {
        throw new AuthenticationError(
          'Invalid OpenAI API key',
          this.name
        );
      }

      if (error.status === 400 || error.code === 'invalid_request_error') {
        throw new ValidationError(
          `Invalid request: ${error.message}`,
          this.name
        );
      }

      // Check if it's already a ProviderError (from retry logic)
      if (error instanceof ProviderError) {
        throw error;
      }

      // Generic error
      throw new ProviderError(
        `OpenAI API error: ${error.message}`,
        this.name,
        error.code || 'UNKNOWN',
        error.status,
        error.status >= 500 // Server errors are retryable
      );
    }
  }

  /**
   * Get the system prompt for OpenAI
   */
  private getSystemPrompt(): string {
    return `You are an expert code reviewer with deep knowledge of software engineering best practices, design patterns, and security.
    Your reviews are thorough, constructive, and focused on improving code quality.
    You provide specific, actionable feedback with clear severity levels.
    Format your response in Markdown with clear sections and appropriate emoji indicators.`;
  }

  /**
   * Get available models
   */
  static getAvailableModels(): string[] {
    return Object.keys(OpenAIProvider.MODELS);
  }

  /**
   * Get model information
   */
  static getModelInfo(modelId: string): ModelInfo | undefined {
    return OpenAIProvider.MODELS[modelId];
  }
}