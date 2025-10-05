import { ProviderConfig, ReviewOptions } from '../providers/types';

/**
 * Extended provider configuration with additional settings
 */
export interface ExtendedProviderConfig extends ProviderConfig {
  provider: string;
  enabled: boolean;
  priority?: number;
  fallback?: string;
  rateLimit?: {
    maxRequestsPerMinute: number;
    maxTokensPerMinute: number;
  };
}

/**
 * Application configuration
 */
export interface AppConfig {
  primaryProvider: string;
  fallbackProviders: string[];
  providers: Record<string, ExtendedProviderConfig>;
  global: {
    maxRetries: number;
    timeout: number;
    defaultOptions: Partial<ReviewOptions>;
  };
}

/**
 * Load provider configuration from environment variables
 */
export function loadProviderConfig(providerName?: string): ExtendedProviderConfig {
  const provider = providerName || process.env.AI_PROVIDER || 'openai';
  const envPrefix = provider.toUpperCase();

  // Check if provider is explicitly disabled
  const enabled = process.env[`${envPrefix}_ENABLED`] !== 'false';

  return {
    provider,
    enabled,
    apiKey: process.env[`${envPrefix}_API_KEY`] || process.env.OPENAI_API_KEY || '',
    model: process.env[`${envPrefix}_MODEL`] || process.env.OPENAI_MODEL,
    baseUrl: process.env[`${envPrefix}_BASE_URL`],
    organization: process.env[`${envPrefix}_ORGANIZATION`],
    maxRetries: process.env[`${envPrefix}_MAX_RETRIES`]
      ? parseInt(process.env[`${envPrefix}_MAX_RETRIES`]!)
      : parseInt(process.env.MAX_RETRIES || '3'),
    timeout: process.env[`${envPrefix}_TIMEOUT`]
      ? parseInt(process.env[`${envPrefix}_TIMEOUT`]!)
      : parseInt(process.env.TIMEOUT || '30000'),
    priority: process.env[`${envPrefix}_PRIORITY`]
      ? parseInt(process.env[`${envPrefix}_PRIORITY`]!)
      : undefined,
    fallback: process.env[`${envPrefix}_FALLBACK`],
    defaultOptions: {
      maxTokens: process.env[`${envPrefix}_MAX_TOKENS`]
        ? parseInt(process.env[`${envPrefix}_MAX_TOKENS`]!)
        : parseInt(process.env.MAX_TOKENS || '1500'),
      temperature: process.env[`${envPrefix}_TEMPERATURE`]
        ? parseFloat(process.env[`${envPrefix}_TEMPERATURE`]!)
        : parseFloat(process.env.TEMPERATURE || '0.2'),
      topP: process.env[`${envPrefix}_TOP_P`]
        ? parseFloat(process.env[`${envPrefix}_TOP_P`]!)
        : undefined,
      frequencyPenalty: process.env[`${envPrefix}_FREQUENCY_PENALTY`]
        ? parseFloat(process.env[`${envPrefix}_FREQUENCY_PENALTY`]!)
        : undefined,
      presencePenalty: process.env[`${envPrefix}_PRESENCE_PENALTY`]
        ? parseFloat(process.env[`${envPrefix}_PRESENCE_PENALTY`]!)
        : undefined
    },
    rateLimit: {
      maxRequestsPerMinute: process.env[`${envPrefix}_RATE_LIMIT_RPM`]
        ? parseInt(process.env[`${envPrefix}_RATE_LIMIT_RPM`]!)
        : 60,
      maxTokensPerMinute: process.env[`${envPrefix}_RATE_LIMIT_TPM`]
        ? parseInt(process.env[`${envPrefix}_RATE_LIMIT_TPM`]!)
        : 150000
    }
  };
}

/**
 * Load complete application configuration
 */
export function loadAppConfig(): AppConfig {
  const primaryProvider = process.env.AI_PROVIDER || 'openai';
  const fallbackProviders = process.env.FALLBACK_PROVIDERS
    ? process.env.FALLBACK_PROVIDERS.split(',').map(s => s.trim())
    : [];

  // Load configurations for all known providers
  const providerNames = [
    primaryProvider,
    ...fallbackProviders,
    'openai',
    'claude'
  ].filter((v, i, a) => a.indexOf(v) === i); // unique values

  const providers: Record<string, ExtendedProviderConfig> = {};
  for (const name of providerNames) {
    const config = loadProviderConfig(name);
    if (config.apiKey) {
      providers[name] = config;
    }
  }

  return {
    primaryProvider,
    fallbackProviders,
    providers,
    global: {
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      timeout: parseInt(process.env.TIMEOUT || '30000'),
      defaultOptions: {
        maxTokens: parseInt(process.env.MAX_TOKENS || '1500'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.2')
      }
    }
  };
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ExtendedProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push(`API key is required for ${config.provider}`);
  }

  if (config.maxRetries && config.maxRetries < 0) {
    errors.push('maxRetries must be non-negative');
  }

  if (config.timeout && config.timeout < 1000) {
    errors.push('timeout must be at least 1000ms');
  }

  if (config.defaultOptions) {
    if (config.defaultOptions.temperature !== undefined) {
      if (config.defaultOptions.temperature < 0 || config.defaultOptions.temperature > 2) {
        errors.push('temperature must be between 0 and 2');
      }
    }

    if (config.defaultOptions.maxTokens !== undefined) {
      if (config.defaultOptions.maxTokens < 1) {
        errors.push('maxTokens must be positive');
      }
    }
  }

  return errors;
}

/**
 * Get provider-specific model mapping
 */
export function getModelMapping(provider: string): Record<string, string> {
  const mappings: Record<string, Record<string, string>> = {
    claude: {
      'gpt-3.5-turbo': 'claude-3-haiku-20240307',
      'gpt-4': 'claude-3-sonnet-20240229',
      'gpt-4-turbo': 'claude-3-5-sonnet-20241022',
      'gpt-4o': 'claude-3-opus-20240229'
    },
    openai: {
      'claude-3-haiku-20240307': 'gpt-3.5-turbo',
      'claude-3-sonnet-20240229': 'gpt-4',
      'claude-3-5-sonnet-20241022': 'gpt-4-turbo',
      'claude-3-opus-20240229': 'gpt-4o'
    }
  };

  return mappings[provider.toLowerCase()] || {};
}

/**
 * Get environment variable names for a provider
 */
export function getProviderEnvVars(provider: string): string[] {
  const prefix = provider.toUpperCase();
  return [
    `${prefix}_API_KEY`,
    `${prefix}_MODEL`,
    `${prefix}_BASE_URL`,
    `${prefix}_ORGANIZATION`,
    `${prefix}_MAX_RETRIES`,
    `${prefix}_TIMEOUT`,
    `${prefix}_MAX_TOKENS`,
    `${prefix}_TEMPERATURE`,
    `${prefix}_ENABLED`,
    `${prefix}_PRIORITY`,
    `${prefix}_FALLBACK`
  ];
}