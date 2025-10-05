import { LLMProvider, ProviderConfig, ProviderError } from './types';
import { BaseLLMProvider } from './BaseLLMProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * Factory class for creating and managing LLM providers
 */
export class LLMProviderFactory {
  private static providers: Map<string, typeof BaseLLMProvider> = new Map<string, typeof BaseLLMProvider>([
    ['claude', ClaudeProvider as typeof BaseLLMProvider],
    ['openai', OpenAIProvider as typeof BaseLLMProvider],
    // Aliases for convenience
    ['anthropic', ClaudeProvider as typeof BaseLLMProvider],
    ['gpt', OpenAIProvider as typeof BaseLLMProvider]
  ]);

  private static instances: Map<string, LLMProvider> = new Map();

  /**
   * Create a new provider instance
   */
  static async createProvider(
    providerName: string,
    config: ProviderConfig,
    cache: boolean = true
  ): Promise<LLMProvider> {
    const normalizedName = providerName.toLowerCase();
    const ProviderClass = this.providers.get(normalizedName);

    if (!ProviderClass) {
      const available = this.getAvailableProviders().join(', ');
      throw new ProviderError(
        `Unknown provider: ${providerName}. Available providers: ${available}`,
        'factory',
        'UNKNOWN_PROVIDER'
      );
    }

    // Check cache if enabled
    const cacheKey = `${normalizedName}-${config.model || 'default'}`;
    if (cache && this.instances.has(cacheKey)) {
      const cachedProvider = this.instances.get(cacheKey)!;
      console.log(`[Factory] Using cached provider: ${normalizedName}`);
      return cachedProvider;
    }

    try {
      // Create new instance
      const provider = new (ProviderClass as any)() as LLMProvider;
      await provider.initialize(config);

      // Cache if enabled
      if (cache) {
        this.instances.set(cacheKey, provider);
        console.log(`[Factory] Cached provider: ${normalizedName}`);
      }

      return provider;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        `Failed to create provider ${providerName}: ${error}`,
        'factory',
        'CREATION_ERROR'
      );
    }
  }

  /**
   * Create provider from environment variables
   */
  static async createFromEnv(providerName?: string): Promise<LLMProvider> {
    const provider = providerName || process.env.AI_PROVIDER || 'openai';
    const envPrefix = provider.toUpperCase();

    const config: ProviderConfig = {
      apiKey: process.env[`${envPrefix}_API_KEY`] || process.env.OPENAI_API_KEY || '',
      model: process.env[`${envPrefix}_MODEL`] || process.env.OPENAI_MODEL,
      baseUrl: process.env[`${envPrefix}_BASE_URL`],
      organization: process.env[`${envPrefix}_ORGANIZATION`],
      maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : 3,
      timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000,
      defaultOptions: {
        maxTokens: process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS) : 1500,
        temperature: process.env.TEMPERATURE ? parseFloat(process.env.TEMPERATURE) : 0.2
      }
    };

    if (!config.apiKey) {
      throw new ProviderError(
        `API key not found for provider ${provider}. Please set ${envPrefix}_API_KEY environment variable.`,
        'factory',
        'MISSING_API_KEY'
      );
    }

    return this.createProvider(provider, config);
  }

  /**
   * Create multiple providers with fallback support
   */
  static async createWithFallback(
    providers: Array<{ name: string; config: ProviderConfig }>
  ): Promise<LLMProvider[]> {
    const instances: LLMProvider[] = [];

    for (const { name, config } of providers) {
      try {
        const provider = await this.createProvider(name, config);
        instances.push(provider);
      } catch (error) {
        console.warn(`Failed to create provider ${name}: ${error}`);
      }
    }

    if (instances.length === 0) {
      throw new ProviderError(
        'Failed to create any providers',
        'factory',
        'NO_PROVIDERS_AVAILABLE'
      );
    }

    return instances;
  }

  /**
   * Register a custom provider
   */
  static registerProvider(name: string, providerClass: typeof BaseLLMProvider): void {
    const normalizedName = name.toLowerCase();
    if (this.providers.has(normalizedName)) {
      console.warn(`Provider ${normalizedName} already registered, overwriting...`);
    }
    this.providers.set(normalizedName, providerClass);
    console.log(`[Factory] Registered provider: ${normalizedName}`);
  }

  /**
   * Get list of available providers
   */
  static getAvailableProviders(): string[] {
    const uniqueProviders = new Set<string>();
    for (const [key, value] of this.providers) {
      // Add main provider names (not aliases)
      if (value === ClaudeProvider && !uniqueProviders.has('claude')) {
        uniqueProviders.add('claude');
      } else if (value === OpenAIProvider && !uniqueProviders.has('openai')) {
        uniqueProviders.add('openai');
      }
    }
    return Array.from(uniqueProviders);
  }

  /**
   * Clear cached instances
   */
  static clearCache(): void {
    this.instances.clear();
    console.log('[Factory] Provider cache cleared');
  }

  /**
   * Get cached provider instance if exists
   */
  static getCachedProvider(providerName: string, model?: string): LLMProvider | undefined {
    const cacheKey = `${providerName.toLowerCase()}-${model || 'default'}`;
    return this.instances.get(cacheKey);
  }

  /**
   * Validate provider configuration
   */
  static async validateProvider(
    providerName: string,
    config: ProviderConfig
  ): Promise<boolean> {
    try {
      const provider = await this.createProvider(providerName, config, false);
      return provider.validateConfig();
    } catch (error) {
      console.error(`Provider validation failed: ${error}`);
      return false;
    }
  }
}